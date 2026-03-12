// server/cyberNewsCache.ts — Cybersecurity RSS + Gemini threat intel extraction
import Parser from 'rss-parser'
import { GoogleGenAI } from '@google/genai'
import { stripHtml, hashLink, sleep } from './utils'
import { prewarmCveCache } from './cveCache'

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'Endurion-CyberMonitor/1.0',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
})

// ── Types ────────────────────────────────────────────────────────────

export type CyberAttackType =
  | 'ransomware' | 'apt' | 'phishing' | 'exploit' | 'ddos'
  | 'data_breach' | 'vulnerability' | 'supply_chain' | 'malware' | 'other'

export type CyberSeverity = 'critical' | 'high' | 'medium' | 'low'

interface CyberFeedSource {
  name: string
  url: string
  type: 'threat_intel' | 'vendor' | 'government' | 'research'
}

export interface CyberNewsArticle {
  id: string
  title: string
  link: string
  source: string
  pubDate: string
  timestamp: number
  description?: string
  // Gemini-extracted fields
  sourceActor?: string
  sourceCountry?: string
  sourceLat?: number
  sourceLng?: number
  target?: string
  targetCountry?: string
  targetLat?: number
  targetLng?: number
  attackType: CyberAttackType
  severity: CyberSeverity
  malwareFamily: string[]
  cves: string[]
  iocs: string[]
  mitreTactics: string[]
  extracted: boolean // whether Gemini extraction completed
}

export interface CyberNewsNode {
  id: string
  label: string
  type: 'actor' | 'target'
  lat: number
  lng: number
  country?: string
  threatScore: number
  articleCount: number
  attackTypes: string[]
}

export interface CyberNewsEdge {
  id: string
  sourceId: string
  targetId: string
  attackType: string
  threatScore: number
  articleCount: number
}

export interface CyberNewsGraph {
  nodes: CyberNewsNode[]
  edges: CyberNewsEdge[]
}

// ── Feed list (~25 curated cyber sources) ────────────────────────────

const CYBER_FEEDS: CyberFeedSource[] = [
  // Threat Intel
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', type: 'threat_intel' },
  { name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/', type: 'threat_intel' },
  { name: 'The Record', url: 'https://therecord.media/feed', type: 'threat_intel' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', type: 'threat_intel' },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', type: 'threat_intel' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', type: 'threat_intel' },
  { name: 'Threatpost', url: 'https://threatpost.com/feed/', type: 'threat_intel' },
  { name: 'SC Magazine', url: 'https://www.scmagazine.com/feed', type: 'threat_intel' },

  // Vendor Blogs
  { name: 'Mandiant', url: 'https://www.mandiant.com/resources/blog/rss.xml', type: 'vendor' },
  { name: 'CrowdStrike', url: 'https://www.crowdstrike.com/blog/feed/', type: 'vendor' },
  { name: 'SentinelOne', url: 'https://www.sentinelone.com/blog/feed/', type: 'vendor' },
  { name: 'Unit 42', url: 'https://unit42.paloaltonetworks.com/feed/', type: 'vendor' },
  { name: 'Talos Intelligence', url: 'https://blog.talosintelligence.com/feeds/posts/default?alt=rss', type: 'vendor' },
  { name: 'Recorded Future', url: 'https://www.recordedfuture.com/feed', type: 'vendor' },
  { name: 'Sophos News', url: 'https://news.sophos.com/en-us/feed/', type: 'vendor' },
  { name: 'Microsoft Security', url: 'https://www.microsoft.com/en-us/security/blog/feed/', type: 'vendor' },
  { name: 'Google TAG', url: 'https://blog.google/threat-analysis-group/rss/', type: 'vendor' },
  { name: 'ESET WeLiveSecurity', url: 'https://www.welivesecurity.com/en/rss/feed/', type: 'vendor' },
  { name: 'Rapid7', url: 'https://blog.rapid7.com/rss/', type: 'vendor' },
  { name: 'Check Point Research', url: 'https://research.checkpoint.com/feed/', type: 'vendor' },
  { name: 'Fortinet Threat Research', url: 'https://www.fortinet.com/blog/threat-research.xml', type: 'vendor' },
  { name: 'Proofpoint', url: 'https://www.proofpoint.com/us/blog.xml', type: 'vendor' },
  { name: 'Volexity', url: 'https://www.volexity.com/blog/feed/', type: 'vendor' },
  { name: 'Elastic Security Labs', url: 'https://www.elastic.co/security-labs/rss/feed.xml', type: 'vendor' },
  { name: 'Kaspersky Securelist', url: 'https://securelist.com/feed/', type: 'vendor' },
  { name: 'Trend Micro Research', url: 'https://www.trendmicro.com/en_us/research.rss.html', type: 'vendor' },
  { name: 'Qualys Blog', url: 'https://blog.qualys.com/feed', type: 'vendor' },
  { name: 'Dragos', url: 'https://www.dragos.com/feed/', type: 'vendor' },

  // Government
  { name: 'CISA Alerts', url: 'https://www.cisa.gov/news.xml', type: 'government' },
  { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', type: 'government' },
  { name: 'CISA Current Activity', url: 'https://www.cisa.gov/uscert/ncas/current-activity.xml', type: 'government' },
  { name: 'US-CERT', url: 'https://www.cisa.gov/uscert/ncas/alerts.xml', type: 'government' },
  { name: 'NCSC UK', url: 'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml', type: 'government' },
  { name: 'CERT-EU', url: 'https://cert.europa.eu/publications/security-advisories/rss', type: 'government' },
  { name: 'ACSC Australia', url: 'https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/rss.xml', type: 'government' },

  // Research
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/', type: 'research' },
  { name: 'SANS ISC', url: 'https://isc.sans.edu/rssfeed.xml', type: 'research' },
  { name: 'Packet Storm', url: 'https://rss.packetstormsecurity.com/', type: 'research' },
  { name: 'Exploit Database', url: 'https://www.exploit-db.com/rss.xml', type: 'research' },
  { name: 'Huntress', url: 'https://www.huntress.com/blog/rss.xml', type: 'research' },
  { name: 'Binary Defense', url: 'https://www.binarydefense.com/feed/', type: 'research' },
  { name: 'GreyNoise', url: 'https://www.greynoise.io/blog/rss.xml', type: 'research' },
]

// ── Cache state ──────────────────────────────────────────────────────

let cachedArticles: CyberNewsArticle[] = []
let cachedGraph: CyberNewsGraph = { nodes: [], edges: [] }
let lastFetchTime = 0
const CACHE_DURATION_MS = 5 * 60 * 1000
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 500
let isFetching = false
let activeFetchPromise: Promise<void> | null = null

// ── RSS fetching ─────────────────────────────────────────────────────

async function fetchSingleFeed(source: CyberFeedSource): Promise<CyberNewsArticle[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const articles: CyberNewsArticle[] = []

    for (const item of (feed.items || []).slice(0, 10)) {
      const pubDate = item.pubDate || item.isoDate || ''
      const timestamp = pubDate ? new Date(pubDate).getTime() : 0
      if (!item.title || !item.link) continue
      if (isNaN(timestamp) || timestamp <= 0) continue

      articles.push({
        id: hashLink('cyber', item.link),
        title: item.title.trim(),
        link: item.link,
        source: source.name,
        pubDate,
        timestamp,
        description: stripHtml(item.contentSnippet || item.content || item.summary, 500),
        attackType: 'other',
        severity: 'medium',
        malwareFamily: [],
        cves: [],
        iocs: [],
        mitreTactics: [],
        extracted: false,
      })
    }
    return articles
  } catch {
    return []
  }
}

// ── Gemini threat intel extraction ───────────────────────────────────

const extractionCache = new Map<string, Partial<CyberNewsArticle>>()
const MAX_EXTRACTION_CACHE = 3000
let isExtracting = false
const MAX_EXTRACT_PER_CYCLE = 300

const EXTRACTION_PROMPT = `You are a cybersecurity threat intelligence extraction engine. Given a batch of cybersecurity news headlines and descriptions, extract structured threat data from each.

Rules:
- Return a JSON array with one entry per article, in the same order
- Each entry:
{
  "index": <number>,
  "sourceActor": "<threat actor name or null>",
  "sourceCountry": "<country name or null>",
  "sourceLat": <number or null>,
  "sourceLng": <number or null>,
  "target": "<target org/sector/country or null>",
  "targetCountry": "<country name or null>",
  "targetLat": <number or null>,
  "targetLng": <number or null>,
  "attackType": "<ransomware|apt|phishing|exploit|ddos|data_breach|vulnerability|supply_chain|malware|other>",
  "severity": "<critical|high|medium|low>",
  "malwareFamily": ["<name>", ...],
  "cves": ["CVE-YYYY-NNNN", ...],
  "iocs": ["<IP or domain>", ...],
  "mitreTactics": ["<tactic name>", ...]
}
- sourceActor: Named threat group (APT29, LockBit, Lazarus) or descriptive ("Chinese state hackers", "unknown ransomware group"), null if not identifiable
- Coordinates: Use capital city or HQ location. If actor is a nation-state group, use that country's capital. If target is an org, use their HQ country's capital.
- attackType: Best fit from the enum. Use "other" only if nothing fits.
- severity: critical = active exploitation/mass impact, high = targeted attacks/major vulns, medium = general threats, low = advisories/research
- malwareFamily: Named malware/tools mentioned (Cobalt Strike, BlackCat, etc.)
- cves: Extract any CVE IDs mentioned
- iocs: Extract IP addresses or domain names that appear to be indicators of compromise
- mitreTactics: Map to MITRE ATT&CK tactics (Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Exfiltration, Command and Control, Impact)
- Return ONLY the JSON array, no markdown, no explanation

Articles:
`

async function extractBatch(articles: CyberNewsArticle[]): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return

  const ai = new GoogleGenAI({ apiKey })

  // Prune oldest entries if cache grows too large
  if (extractionCache.size > MAX_EXTRACTION_CACHE) {
    const excess = extractionCache.size - MAX_EXTRACTION_CACHE
    const iter = extractionCache.keys()
    for (let i = 0; i < excess; i++) {
      const { value, done } = iter.next()
      if (done) break
      extractionCache.delete(value)
    }
  }

  const toExtract = articles
    .filter((a) => !a.extracted && !extractionCache.has(a.link))
    .slice(0, MAX_EXTRACT_PER_CYCLE)

  if (toExtract.length === 0) return

  const EXTRACT_BATCH_SIZE = 15

  for (let i = 0; i < toExtract.length; i += EXTRACT_BATCH_SIZE) {
    const batch = toExtract.slice(i, i + EXTRACT_BATCH_SIZE)
    const articleList = batch
      .map((a, idx) => `${idx}. [${a.source}] ${a.title}${a.description ? '\n   ' + a.description.slice(0, 200) : ''}`)
      .join('\n\n')

    try {
      console.log(`[CyberNews] Extracting batch ${Math.floor(i / EXTRACT_BATCH_SIZE) + 1}: ${batch.length} articles`)
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: EXTRACTION_PROMPT + articleList,
        config: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })

      const text = response.text?.trim() || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn(`[CyberNews] No JSON in Gemini response (len=${text.length})`)
        continue
      }

      const results = JSON.parse(jsonMatch[0]) as Array<{
        index: number
        sourceActor: string | null
        sourceCountry: string | null
        sourceLat: number | null
        sourceLng: number | null
        target: string | null
        targetCountry: string | null
        targetLat: number | null
        targetLng: number | null
        attackType: string
        severity: string
        malwareFamily: string[]
        cves: string[]
        iocs: string[]
        mitreTactics: string[]
      }>

      for (const result of results) {
        const article = batch[result.index]
        if (!article) continue

        const extracted: Partial<CyberNewsArticle> = {
          sourceActor: result.sourceActor || undefined,
          sourceCountry: result.sourceCountry || undefined,
          sourceLat: validCoord(result.sourceLat, 90) ? result.sourceLat! : undefined,
          sourceLng: validCoord(result.sourceLng, 180) ? result.sourceLng! : undefined,
          target: result.target || undefined,
          targetCountry: result.targetCountry || undefined,
          targetLat: validCoord(result.targetLat, 90) ? result.targetLat! : undefined,
          targetLng: validCoord(result.targetLng, 180) ? result.targetLng! : undefined,
          attackType: validAttackType(result.attackType) ? result.attackType as CyberAttackType : 'other',
          severity: validSeverity(result.severity) ? result.severity as CyberSeverity : 'medium',
          malwareFamily: result.malwareFamily ?? [],
          cves: result.cves ?? [],
          iocs: result.iocs ?? [],
          mitreTactics: result.mitreTactics ?? [],
          extracted: true,
        }

        extractionCache.set(article.link, extracted)
        Object.assign(article, extracted)
      }
    } catch (err) {
      console.error('[CyberNews] Gemini extraction error:', err)
    }

    if (i + EXTRACT_BATCH_SIZE < toExtract.length) await sleep(1500)
  }
}

function validCoord(v: number | null | undefined, max: number): boolean {
  return v !== null && v !== undefined && !isNaN(v) && Math.abs(v) <= max
}

const VALID_ATTACK_TYPES = new Set(['ransomware', 'apt', 'phishing', 'exploit', 'ddos', 'data_breach', 'vulnerability', 'supply_chain', 'malware', 'other'])
function validAttackType(v: string): boolean { return VALID_ATTACK_TYPES.has(v) }

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])
function validSeverity(v: string): boolean { return VALID_SEVERITIES.has(v) }

function applyExtractionCache(articles: CyberNewsArticle[]): void {
  for (const article of articles) {
    if (article.extracted) continue
    const cached = extractionCache.get(article.link)
    if (cached) Object.assign(article, cached)
  }
}

// ── Graph builder ────────────────────────────────────────────────────

function buildGraph(articles: CyberNewsArticle[]): CyberNewsGraph {
  const nodes: CyberNewsNode[] = []
  const edges: CyberNewsEdge[] = []
  const nodeMap = new Map<string, CyberNewsNode>()
  const edgeMap = new Map<string, CyberNewsEdge>()

  const extracted = articles.filter((a) => a.extracted && (a.sourceLat !== undefined || a.targetLat !== undefined))

  for (const article of extracted) {
    // Actor node
    if (article.sourceActor && article.sourceLat !== undefined && article.sourceLng !== undefined) {
      const actorId = `actor-${article.sourceActor.toLowerCase().replace(/\s+/g, '-')}`
      let actor = nodeMap.get(actorId)
      if (!actor) {
        actor = {
          id: actorId,
          label: article.sourceActor.toUpperCase(),
          type: 'actor',
          lat: article.sourceLat,
          lng: article.sourceLng,
          country: article.sourceCountry,
          threatScore: 0,
          articleCount: 0,
          attackTypes: [],
        }
        nodeMap.set(actorId, actor)
      }
      actor.articleCount++
      if (!actor.attackTypes.includes(article.attackType)) actor.attackTypes.push(article.attackType)
      // Threat score: more articles + higher severity = higher score
      const sevScore = article.severity === 'critical' ? 25 : article.severity === 'high' ? 15 : article.severity === 'medium' ? 8 : 3
      actor.threatScore = Math.min(100, actor.threatScore + sevScore)
    }

    // Target node
    if (article.target && article.targetLat !== undefined && article.targetLng !== undefined) {
      const targetId = `target-${article.target.toLowerCase().replace(/\s+/g, '-')}`
      let target = nodeMap.get(targetId)
      if (!target) {
        target = {
          id: targetId,
          label: article.target.toUpperCase(),
          type: 'target',
          lat: article.targetLat,
          lng: article.targetLng,
          country: article.targetCountry,
          threatScore: 0,
          articleCount: 0,
          attackTypes: [],
        }
        nodeMap.set(targetId, target)
      }
      target.articleCount++
      if (!target.attackTypes.includes(article.attackType)) target.attackTypes.push(article.attackType)
      const sevScore = article.severity === 'critical' ? 20 : article.severity === 'high' ? 12 : 5
      target.threatScore = Math.min(100, target.threatScore + sevScore)
    }

    // Edge: actor → target
    if (article.sourceActor && article.target && article.sourceLat !== undefined && article.targetLat !== undefined) {
      const actorId = `actor-${article.sourceActor.toLowerCase().replace(/\s+/g, '-')}`
      const targetId = `target-${article.target.toLowerCase().replace(/\s+/g, '-')}`
      const edgeId = `${actorId}--${targetId}`
      let edge = edgeMap.get(edgeId)
      if (!edge) {
        edge = {
          id: edgeId,
          sourceId: actorId,
          targetId: targetId,
          attackType: article.attackType,
          threatScore: 0,
          articleCount: 0,
        }
        edgeMap.set(edgeId, edge)
      }
      edge.articleCount++
      const sevScore = article.severity === 'critical' ? 30 : article.severity === 'high' ? 20 : 10
      edge.threatScore = Math.min(100, edge.threatScore + sevScore)
    }
  }

  nodes.push(...nodeMap.values())
  edges.push(...edgeMap.values())
  return { nodes, edges }
}

// ── Fetch all feeds ──────────────────────────────────────────────────

async function doFetchAll(): Promise<void> {
  const allArticles: CyberNewsArticle[] = []

  try {
    for (let i = 0; i < CYBER_FEEDS.length; i += BATCH_SIZE) {
      const batch = CYBER_FEEDS.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map((s) => fetchSingleFeed(s)))

      for (const result of results) {
        if (result.status === 'fulfilled') allArticles.push(...result.value)
      }

      if (i + BATCH_SIZE < CYBER_FEEDS.length) await sleep(BATCH_DELAY_MS)
    }

    const seenLinks = new Set<string>()
    const deduplicated = allArticles
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((article) => {
        if (seenLinks.has(article.link)) return false
        seenLinks.add(article.link)
        return true
      })

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    cachedArticles = deduplicated.filter((a) => a.timestamp > sevenDaysAgo)
    lastFetchTime = Date.now()

    console.log(`[CyberNews] Fetched ${cachedArticles.length} articles from ${CYBER_FEEDS.length} sources`)

    // Apply cached extractions first
    applyExtractionCache(cachedArticles)

    // Fire-and-forget Gemini extraction
    if (!isExtracting) {
      isExtracting = true
      extractBatch(cachedArticles)
        .then(() => {
          const extractedCount = cachedArticles.filter((a) => a.extracted).length
          console.log(`[CyberNews] Extracted ${extractedCount}/${cachedArticles.length} articles`)
          cachedGraph = buildGraph(cachedArticles)
          console.log(`[CyberNews] Graph: ${cachedGraph.nodes.length} nodes, ${cachedGraph.edges.length} edges`)
          // Pre-warm CVE cache for extracted CVEs
          const allCves = [...new Set(cachedArticles.flatMap(a => a.cves))]
          if (allCves.length > 0) {
            prewarmCveCache(allCves).catch(e => console.error('[CVE] prewarm error:', e))
          }
        })
        .catch((err) => console.error('[CyberNews] Extraction error:', err))
        .finally(() => { isExtracting = false })
    }

    // Build graph from whatever extractions we have
    cachedGraph = buildGraph(cachedArticles)
  } catch (err) {
    console.error('[CyberNews] Error fetching feeds:', err)
  } finally {
    isFetching = false
    activeFetchPromise = null
  }
}

async function fetchAll(): Promise<void> {
  if (isFetching && activeFetchPromise) { await activeFetchPromise; return }
  isFetching = true
  activeFetchPromise = doFetchAll()
  return activeFetchPromise
}

// ── Public API ───────────────────────────────────────────────────────

export function getCyberNews(opts: {
  attackType?: string
  severity?: string
  search?: string
  limit?: number
  offset?: number
}): {
  articles: CyberNewsArticle[]
  total: number
  sources: number
  lastUpdated: number
  attackTypes: string[]
  severities: string[]
} {
  let articles = [...cachedArticles]

  if (opts.attackType && opts.attackType !== 'all') {
    articles = articles.filter((a) => a.attackType === opts.attackType)
  }
  if (opts.severity && opts.severity !== 'all') {
    articles = articles.filter((a) => a.severity === opts.severity)
  }
  if (opts.search) {
    const q = opts.search.toLowerCase()
    articles = articles.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q) ||
      (a.sourceActor && a.sourceActor.toLowerCase().includes(q)) ||
      (a.target && a.target.toLowerCase().includes(q)) ||
      (a.description && a.description.toLowerCase().includes(q))
    )
  }

  const total = articles.length
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  return {
    articles: articles.slice(offset, offset + limit),
    total,
    sources: CYBER_FEEDS.length,
    lastUpdated: lastFetchTime,
    attackTypes: ['all', 'ransomware', 'apt', 'phishing', 'exploit', 'ddos', 'data_breach', 'vulnerability', 'supply_chain', 'malware', 'other'],
    severities: ['all', 'critical', 'high', 'medium', 'low'],
  }
}

export function getCyberNewsGraph(): CyberNewsGraph {
  return cachedGraph
}

export function getCachedArticles(): CyberNewsArticle[] {
  return cachedArticles
}

export function getCyberNewsSources(): { sources: { name: string; type: string }[]; total: number } {
  return {
    sources: CYBER_FEEDS.map((f) => ({ name: f.name, type: f.type })),
    total: CYBER_FEEDS.length,
  }
}

export async function startCyberNewsPoller(): Promise<void> {
  await fetchAll()
  setInterval(() => { fetchAll().catch((e) => console.error('[CyberNews] poll error:', e)) }, CACHE_DURATION_MS)
}
