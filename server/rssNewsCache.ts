// server/rssNewsCache.ts — RSS news aggregation with optional Gemini geocoding
import Parser from 'rss-parser'
import { GoogleGenAI } from '@google/genai'
import { stripHtml, hashLink, sleep } from './utils'

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'Endurion-Monitor/1.0',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
})

// ── Types ────────────────────────────────────────────────────────────

export type FeedCategory =
  | 'world_news' | 'regional' | 'defense_security' | 'think_tanks'
  | 'government' | 'tech' | 'economic' | 'humanitarian' | 'osint'
  | 'energy_resources'

export type FeedRegion =
  | 'global' | 'americas' | 'europe' | 'mena' | 'asia' | 'africa'
  | 'russia_eurasia'

export type NewsPriority = 'critical' | 'high' | 'medium' | 'low'

interface RssFeedSource {
  name: string
  url: string
  category: FeedCategory
  region: FeedRegion
}

export interface NewsArticle {
  id: string
  title: string
  link: string
  source: string
  category: FeedCategory
  region: FeedRegion
  pubDate: string
  timestamp: number
  description?: string
  priority: NewsPriority
  latitude?: number
  longitude?: number
  locationName?: string
}

// ── Priority scoring ─────────────────────────────────────────────────

const CATEGORY_WEIGHT: Record<FeedCategory, number> = {
  government: 3, humanitarian: 3, defense_security: 3, osint: 3,
  world_news: 2, regional: 2, energy_resources: 2,
  economic: 1, tech: 1, think_tanks: 1,
}

const CRISIS_KEYWORDS = /\b(attack|strikes?|bomb|missile|explosion|outbreak|pandemic|earthquake|tsunami|famine|sanctions?|invasion|coup|evacuat|emergency|hostage|shoot|terror|nuclear|chemical|bioweapon|cyberattack|blockade|ceasefire|casualt|death toll|killed|wounded)\b/i

function computePriority(article: { title: string; category: FeedCategory; timestamp: number }): NewsPriority {
  let score = CATEGORY_WEIGHT[article.category] ?? 1

  if (CRISIS_KEYWORDS.test(article.title)) score += 1

  const ageMs = Date.now() - article.timestamp
  if (ageMs < 60 * 60 * 1000) score += 1 // < 1h old

  if (score >= 5) return 'critical'
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

// ── Curated feed list (~70 high-signal sources) ──────────────────────

const RSS_FEEDS: RssFeedSource[] = [
  // World News
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world_news', region: 'global' },
  { name: 'AP News', url: 'https://rsshub.app/apnews/topics/world-news', category: 'world_news', region: 'global' },
  { name: 'Reuters', url: 'https://www.reutersagency.com/feed/', category: 'world_news', region: 'global' },
  { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss', category: 'world_news', region: 'global' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'world_news', region: 'mena' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', category: 'world_news', region: 'europe' },
  { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'world_news', region: 'europe' },
  { name: 'NHK World', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', category: 'world_news', region: 'asia' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', category: 'world_news', region: 'americas' },
  { name: 'Der Spiegel', url: 'https://www.spiegel.de/international/index.rss', category: 'world_news', region: 'europe' },
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'world_news', region: 'global' },
  { name: 'ABC News AU', url: 'https://www.abc.net.au/news/feed/2942460/rss.xml', category: 'world_news', region: 'asia' },

  // Regional
  { name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', category: 'regional', region: 'africa' },
  { name: 'BBC Asia', url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', category: 'regional', region: 'asia' },
  { name: 'BBC Middle East', url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', category: 'regional', region: 'mena' },
  { name: 'SCMP', url: 'https://www.scmp.com/rss/91/feed', category: 'regional', region: 'asia' },
  { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/', category: 'regional', region: 'europe' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/', category: 'regional', region: 'asia' },
  { name: 'Meduza', url: 'https://meduza.io/rss/en/all', category: 'regional', region: 'russia_eurasia' },
  { name: 'Africa News', url: 'https://www.africanews.com/feed/', category: 'regional', region: 'africa' },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', category: 'regional', region: 'mena' },
  { name: 'VnExpress', url: 'https://e.vnexpress.net/rss/news/newest.rss', category: 'regional', region: 'asia' },

  // Defense & Security
  { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', category: 'defense_security', region: 'global' },
  { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', category: 'defense_security', region: 'global' },
  { name: 'Defense One', url: 'https://www.defenseone.com/rss/', category: 'defense_security', region: 'americas' },
  { name: 'The War Zone', url: 'https://www.thedrive.com/the-war-zone/feed', category: 'defense_security', region: 'global' },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/', category: 'defense_security', region: 'global' },
  { name: 'USNI News', url: 'https://news.usni.org/feed', category: 'defense_security', region: 'americas' },
  { name: 'Arms Control Assn', url: 'https://www.armscontrol.org/rss.xml', category: 'defense_security', region: 'global' },

  // Think Tanks
  { name: 'CSIS', url: 'https://www.csis.org/analysis/feed', category: 'think_tanks', region: 'global' },
  { name: 'Brookings', url: 'https://www.brookings.edu/feed/', category: 'think_tanks', region: 'global' },
  { name: 'Carnegie', url: 'https://carnegieendowment.org/rss/solr/?lang=en', category: 'think_tanks', region: 'global' },
  { name: 'Atlantic Council', url: 'https://www.atlanticcouncil.org/feed/', category: 'think_tanks', region: 'global' },
  { name: 'RAND', url: 'https://www.rand.org/content/rand/blog.rss2.xml', category: 'think_tanks', region: 'global' },
  { name: 'Foreign Affairs', url: 'https://www.foreignaffairs.com/rss.xml', category: 'think_tanks', region: 'global' },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', category: 'think_tanks', region: 'global' },
  { name: 'Chatham House', url: 'https://www.chathamhouse.org/rss.xml', category: 'think_tanks', region: 'europe' },

  // Government
  { name: 'State Dept', url: 'https://www.state.gov/rss-feed/press-releases/feed/', category: 'government', region: 'americas' },
  { name: 'Pentagon', url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=10&ContentType=1&Site=945', category: 'government', region: 'americas' },
  { name: 'White House', url: 'https://www.whitehouse.gov/feed/', category: 'government', region: 'americas' },
  { name: 'CISA', url: 'https://www.cisa.gov/news.xml', category: 'government', region: 'americas' },
  { name: 'IAEA', url: 'https://www.iaea.org/feeds/topnews', category: 'government', region: 'global' },

  // Tech
  { name: 'Krebs Security', url: 'https://krebsonsecurity.com/feed/', category: 'tech', region: 'global' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech', region: 'global' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', region: 'global' },

  // Economic
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', category: 'economic', region: 'global' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home', category: 'economic', region: 'global' },
  { name: 'Nikkei Asia', url: 'https://asia.nikkei.com/rss/feed/nar', category: 'economic', region: 'asia' },

  // Humanitarian
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', category: 'humanitarian', region: 'global' },
  { name: 'WHO', url: 'https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml', category: 'humanitarian', region: 'global' },
  { name: 'CrisisWatch', url: 'https://www.crisisgroup.org/crisiswatch/feed', category: 'humanitarian', region: 'global' },
  { name: 'CDC', url: 'https://tools.cdc.gov/api/v2/resources/media/rss', category: 'humanitarian', region: 'americas' },
  { name: 'FEMA', url: 'https://www.fema.gov/feeds/disasters/rss.xml', category: 'government', region: 'americas' },

  // OSINT
  { name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/', category: 'osint', region: 'global' },
  { name: 'Oryx OSINT', url: 'https://www.oryxspioenkop.com/feeds/posts/default?alt=rss', category: 'osint', region: 'global' },

  // Energy & Resources
  { name: 'Bulletin of Atomic Scientists', url: 'https://thebulletin.org/feed/', category: 'energy_resources', region: 'global' },
]

// ── Caching state ────────────────────────────────────────────────────

let cachedArticles: NewsArticle[] = []
let lastFetchTime = 0
const CACHE_DURATION_MS = 5 * 60 * 1000
const BATCH_SIZE = 15
const BATCH_DELAY_MS = 500
let isFetching = false
let activeFetchPromise: Promise<NewsArticle[]> | null = null


async function fetchSingleFeed(source: RssFeedSource): Promise<NewsArticle[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const articles: NewsArticle[] = []

    for (const item of (feed.items || []).slice(0, 10)) {
      const pubDate = item.pubDate || item.isoDate || ''
      const timestamp = pubDate ? new Date(pubDate).getTime() : 0
      if (!item.title || !item.link) continue
      if (isNaN(timestamp) || timestamp <= 0) continue

      const title = item.title.trim()
      const article: NewsArticle = {
        id: hashLink('news', item.link),
        title,
        link: item.link,
        source: source.name,
        category: source.category,
        region: source.region,
        pubDate,
        timestamp,
        description: stripHtml(item.contentSnippet || item.content || item.summary),
        priority: 'low', // computed below
      }
      article.priority = computePriority(article)
      articles.push(article)
    }
    return articles
  } catch {
    return []
  }
}

// ── Gemini geocoding (optional) ──────────────────────────────────────

const geocodeCache = new Map<string, { lat: number; lng: number; name: string } | null>()
const MAX_GEOCODE_CACHE = 5000
let isGeocoding = false
const MAX_GEOCODE_PER_CYCLE = 500

const GEOCODE_PROMPT = `You are a geolocation extraction engine. Given a batch of news article headlines, extract the PRIMARY geographic location mentioned in each headline.

Rules:
- Return a JSON array with one entry per headline, in the same order
- Each entry: {"index": <number>, "location": "<city/country>", "lat": <number>, "lng": <number>}
- If no specific geographic location can be determined, return {"index": <number>, "location": null, "lat": null, "lng": null}
- Use the most specific location mentioned (city > country > region)
- For geopolitical news ("US-China talks"), use the location where the event takes place, or null if unclear
- For opinion pieces, think tank analysis, or tech articles with no geographic context, return null
- Coordinates must be realistic WGS84 decimal degrees
- Return ONLY the JSON array, no markdown, no explanation

Headlines:
`

async function geocodeBatch(articles: NewsArticle[]): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return

  const ai = new GoogleGenAI({ apiKey })

  // Prune oldest entries if cache grows too large
  if (geocodeCache.size > MAX_GEOCODE_CACHE) {
    const excess = geocodeCache.size - MAX_GEOCODE_CACHE
    const iter = geocodeCache.keys()
    for (let i = 0; i < excess; i++) {
      const { value, done } = iter.next()
      if (done) break
      geocodeCache.delete(value)
    }
  }

  const toGeocode = articles
    .filter((a) => a.latitude === undefined && !geocodeCache.has(a.link))
    .slice(0, MAX_GEOCODE_PER_CYCLE)

  if (toGeocode.length === 0) return

  const GEO_BATCH_SIZE = 30

  for (let i = 0; i < toGeocode.length; i += GEO_BATCH_SIZE) {
    const batch = toGeocode.slice(i, i + GEO_BATCH_SIZE)
    const headlineList = batch.map((a, idx) => `${idx}. ${a.title}`).join('\n')

    try {
      console.log(`[RSSNews] Geocoding batch ${Math.floor(i / GEO_BATCH_SIZE) + 1}: ${batch.length} headlines`)
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: GEOCODE_PROMPT + headlineList,
        config: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })

      const text = response.text?.trim() || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue

      const results = JSON.parse(jsonMatch[0]) as Array<{
        index: number; location: string | null; lat: number | null; lng: number | null
      }>

      for (const result of results) {
        const article = batch[result.index]
        if (!article) continue

        if (
          result.location && result.lat !== null && result.lng !== null &&
          Math.abs(result.lat) <= 90 && Math.abs(result.lng) <= 180
        ) {
          geocodeCache.set(article.link, { lat: result.lat, lng: result.lng, name: result.location })
          article.latitude = result.lat
          article.longitude = result.lng
          article.locationName = result.location
        } else {
          geocodeCache.set(article.link, null)
        }
      }
    } catch (err) {
      console.error('[RSSNews] Gemini geocode batch error:', err)
    }

    if (i + GEO_BATCH_SIZE < toGeocode.length) await sleep(1000)
  }
}

function applyGeoCache(articles: NewsArticle[]): void {
  for (const article of articles) {
    if (article.latitude !== undefined) continue
    const cached = geocodeCache.get(article.link)
    if (cached) {
      article.latitude = cached.lat
      article.longitude = cached.lng
      article.locationName = cached.name
    }
  }
}

// ── Fetch all feeds ──────────────────────────────────────────────────

async function doFetchAllFeeds(): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = []

  try {
    for (let i = 0; i < RSS_FEEDS.length; i += BATCH_SIZE) {
      const batch = RSS_FEEDS.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map((s) => fetchSingleFeed(s)))

      for (const result of results) {
        if (result.status === 'fulfilled') allArticles.push(...result.value)
      }

      if (i + BATCH_SIZE < RSS_FEEDS.length) await sleep(BATCH_DELAY_MS)
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

    console.log(`[RSSNews] Fetched ${cachedArticles.length} articles from ${RSS_FEEDS.length} sources`)

    applyGeoCache(cachedArticles)

    // Fire-and-forget geocoding
    if (!isGeocoding) {
      isGeocoding = true
      geocodeBatch(cachedArticles)
        .then(() => {
          const geoCount = cachedArticles.filter((a) => a.latitude !== undefined).length
          console.log(`[RSSNews] Geocoded ${geoCount}/${cachedArticles.length} articles`)
        })
        .catch((err) => console.error('[RSSNews] Geocode error:', err))
        .finally(() => { isGeocoding = false })
    }
  } catch (err) {
    console.error('[RSSNews] Error fetching feeds:', err)
  } finally {
    isFetching = false
    activeFetchPromise = null
  }

  return cachedArticles
}

async function fetchAllFeeds(): Promise<NewsArticle[]> {
  if (isFetching && activeFetchPromise) return activeFetchPromise
  isFetching = true
  activeFetchPromise = doFetchAllFeeds()
  return activeFetchPromise
}

// ── Public API (called from server/index.ts) ─────────────────────────

export function getNewsFiltered(opts: {
  category?: string
  region?: string
  search?: string
  limit?: number
  offset?: number
}): {
  articles: NewsArticle[]
  total: number
  sources: number
  lastUpdated: number
  categories: string[]
  regions: string[]
} {
  let articles = [...cachedArticles]

  if (opts.category && opts.category !== 'all') {
    articles = articles.filter((a) => a.category === opts.category)
  }
  if (opts.region && opts.region !== 'all') {
    articles = articles.filter((a) => a.region === opts.region)
  }
  if (opts.search) {
    const q = opts.search.toLowerCase()
    articles = articles.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q))
    )
  }

  const total = articles.length
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  return {
    articles: articles.slice(offset, offset + limit),
    total,
    sources: RSS_FEEDS.length,
    lastUpdated: lastFetchTime,
    categories: ['all', 'world_news', 'regional', 'defense_security', 'think_tanks', 'government', 'tech', 'economic', 'humanitarian', 'osint', 'energy_resources'],
    regions: ['all', 'global', 'americas', 'europe', 'mena', 'asia', 'africa', 'russia_eurasia'],
  }
}

export function getNewsGeolocated(): object {
  const geoArticles = cachedArticles
    .filter((a) => a.latitude !== undefined && a.longitude !== undefined)
    .slice(0, 300)

  return {
    type: 'FeatureCollection',
    features: geoArticles.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] },
      properties: {
        id: a.id,
        title: a.title,
        link: a.link,
        source: a.source,
        category: a.category,
        region: a.region,
        timestamp: a.timestamp,
        priority: a.priority,
        locationName: a.locationName,
      },
    })),
  }
}

export function getNewsSources(): { sources: { name: string; category: FeedCategory; region: FeedRegion }[]; total: number } {
  return {
    sources: RSS_FEEDS.map((f) => ({ name: f.name, category: f.category, region: f.region })),
    total: RSS_FEEDS.length,
  }
}

export async function startNewsPoller(): Promise<void> {
  await fetchAllFeeds()
  setInterval(() => { fetchAllFeeds().catch((e) => console.error('[RSSNews] poll error:', e)) }, CACHE_DURATION_MS)
}
