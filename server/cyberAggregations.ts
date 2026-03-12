// server/cyberAggregations.ts — Pre-computed cyber threat aggregations
import { getCachedArticles, getCyberNewsGraph } from './cyberNewsCache'
import { resolveTacticId, TACTICS } from './mitreData'
import type { CyberNewsArticle } from './cyberNewsCache'

// ── Threat Landscape Stats ──────────────────────────────────────────

export interface ThreatStats {
  totalArticles: number
  extractedArticles: number
  activeActors: number
  activeTargets: number
  criticalCount24h: number
  highCount24h: number
  topAttackTypes: { type: string; count: number }[]
  topActors: { name: string; count: number; severity: string }[]
  topTargets: { name: string; count: number }[]
  topMalware: { name: string; count: number }[]
  trendingCves: { id: string; count: number }[]
}

export function getThreatStats(): ThreatStats {
  const articles = getCachedArticles()
  const graph = getCyberNewsGraph()
  const now = Date.now()
  const h24 = now - 24 * 60 * 60 * 1000

  const recent = articles.filter(a => a.timestamp > h24)

  const attackCounts = new Map<string, number>()
  for (const a of articles) {
    attackCounts.set(a.attackType, (attackCounts.get(a.attackType) ?? 0) + 1)
  }

  const actorCounts = new Map<string, { count: number; severity: string }>()
  for (const a of articles) {
    if (!a.sourceActor) continue
    const entry = actorCounts.get(a.sourceActor) ?? { count: 0, severity: 'low' }
    entry.count++
    if (severityRank(a.severity) > severityRank(entry.severity)) entry.severity = a.severity
    actorCounts.set(a.sourceActor, entry)
  }

  const targetCounts = new Map<string, number>()
  for (const a of articles) {
    if (!a.target) continue
    targetCounts.set(a.target, (targetCounts.get(a.target) ?? 0) + 1)
  }

  const malwareCounts = new Map<string, number>()
  for (const a of articles) {
    for (const m of a.malwareFamily) {
      malwareCounts.set(m, (malwareCounts.get(m) ?? 0) + 1)
    }
  }

  const cveCounts = new Map<string, number>()
  for (const a of articles) {
    for (const c of a.cves) {
      cveCounts.set(c, (cveCounts.get(c) ?? 0) + 1)
    }
  }

  return {
    totalArticles: articles.length,
    extractedArticles: articles.filter(a => a.extracted).length,
    activeActors: graph.nodes.filter(n => n.type === 'actor').length,
    activeTargets: graph.nodes.filter(n => n.type === 'target').length,
    criticalCount24h: recent.filter(a => a.severity === 'critical').length,
    highCount24h: recent.filter(a => a.severity === 'high').length,
    topAttackTypes: sortedEntries(attackCounts).slice(0, 6),
    topActors: [...actorCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, { count, severity }]) => ({ name, count, severity })),
    topTargets: sortedEntries(targetCounts).slice(0, 8),
    topMalware: sortedEntries(malwareCounts).slice(0, 6),
    trendingCves: sortedEntries(cveCounts).slice(0, 8),
  }
}

function sortedEntries(map: Map<string, number>): { name: string; count: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
}

function severityRank(s: string): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1
}

// ── MITRE Tactic Heatmap ────────────────────────────────────────────

export interface MitreHeatmapCell {
  tacticId: string
  tacticName: string
  count: number
  severity: string
}

export function getMitreHeatmap(): MitreHeatmapCell[] {
  const articles = getCachedArticles()
  const tacticMap = new Map<string, { count: number; severity: string }>()

  for (const a of articles) {
    for (const tacticName of a.mitreTactics) {
      const tacticId = resolveTacticId(tacticName)
      if (!tacticId) continue
      const entry = tacticMap.get(tacticId) ?? { count: 0, severity: 'low' }
      entry.count++
      if (severityRank(a.severity) > severityRank(entry.severity)) entry.severity = a.severity
      tacticMap.set(tacticId, entry)
    }
  }

  return TACTICS.map(t => ({
    tacticId: t.id,
    tacticName: t.name,
    count: tacticMap.get(t.id)?.count ?? 0,
    severity: tacticMap.get(t.id)?.severity ?? 'low',
  }))
}

// ── Campaign Clustering ─────────────────────────────────────────────

export interface Campaign {
  id: string
  actor: string
  attackType: string
  malware: string[]
  targets: string[]
  articleCount: number
  severity: string
  firstSeen: number
  lastSeen: number
  articleIds: string[]
}

export function getCampaigns(): Campaign[] {
  const articles = getCachedArticles().filter(a => a.extracted && a.sourceActor)
  const campaignMap = new Map<string, Campaign>()

  for (const a of articles) {
    const malwareKey = a.malwareFamily[0]?.toLowerCase() ?? 'none'
    const key = `${a.sourceActor!.toLowerCase()}::${a.attackType}::${malwareKey}`

    let campaign = campaignMap.get(key)
    if (!campaign) {
      campaign = {
        id: key.replace(/\s+/g, '-').replace(/::/g, '-'),
        actor: a.sourceActor!,
        attackType: a.attackType,
        malware: [],
        targets: [],
        articleCount: 0,
        severity: 'low',
        firstSeen: a.timestamp,
        lastSeen: a.timestamp,
        articleIds: [],
      }
      campaignMap.set(key, campaign)
    }

    campaign.articleCount++
    campaign.articleIds.push(a.id)
    if (a.timestamp < campaign.firstSeen) campaign.firstSeen = a.timestamp
    if (a.timestamp > campaign.lastSeen) campaign.lastSeen = a.timestamp
    if (severityRank(a.severity) > severityRank(campaign.severity)) campaign.severity = a.severity
    if (a.target && !campaign.targets.includes(a.target)) campaign.targets.push(a.target)
    for (const m of a.malwareFamily) {
      if (!campaign.malware.includes(m)) campaign.malware.push(m)
    }
  }

  return [...campaignMap.values()]
    .filter(c => c.articleCount >= 2)
    .sort((a, b) => b.lastSeen - a.lastSeen)
}

// ── Actor Profile ───────────────────────────────────────────────────

export interface ActorProfile {
  name: string
  country: string | null
  lat: number | null
  lng: number | null
  threatScore: number
  articleCount: number
  attackTypes: string[]
  targets: { name: string; country: string | null }[]
  malware: string[]
  cves: string[]
  mitreTactics: string[]
  recentArticles: { id: string; title: string; severity: string; timestamp: number }[]
  firstSeen: number
  lastSeen: number
}

export function getActorProfile(actorName: string): ActorProfile | null {
  const articles = getCachedArticles().filter(
    a => a.sourceActor?.toLowerCase() === actorName.toLowerCase()
  )
  if (articles.length === 0) return null

  const attackTypes = new Set<string>()
  const targets = new Map<string, string | null>()
  const malware = new Set<string>()
  const cves = new Set<string>()
  const tactics = new Set<string>()
  let cumulativeScore = 0

  for (const a of articles) {
    attackTypes.add(a.attackType)
    if (a.target) targets.set(a.target, a.targetCountry ?? null)
    a.malwareFamily.forEach(m => malware.add(m))
    a.cves.forEach(c => cves.add(c))
    a.mitreTactics.forEach(t => tactics.add(t))
    const sev = a.severity === 'critical' ? 25 : a.severity === 'high' ? 15 : a.severity === 'medium' ? 8 : 3
    cumulativeScore += sev
  }

  const first = articles[0]
  return {
    name: first.sourceActor!,
    country: first.sourceCountry ?? null,
    lat: first.sourceLat ?? null,
    lng: first.sourceLng ?? null,
    threatScore: Math.min(100, cumulativeScore),
    articleCount: articles.length,
    attackTypes: [...attackTypes],
    targets: [...targets.entries()].map(([name, country]) => ({ name, country })),
    malware: [...malware],
    cves: [...cves],
    mitreTactics: [...tactics],
    recentArticles: articles
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
      .map(a => ({ id: a.id, title: a.title, severity: a.severity, timestamp: a.timestamp })),
    firstSeen: Math.min(...articles.map(a => a.timestamp)),
    lastSeen: Math.max(...articles.map(a => a.timestamp)),
  }
}

// ── Temporal Buckets ────────────────────────────────────────────────

export interface TemporalBucket {
  timestamp: number
  total: number
  critical: number
  high: number
  medium: number
  low: number
  attackTypes: Record<string, number>
}

export function getTemporalData(hours = 168): TemporalBucket[] {
  hours = Math.min(hours, 720) // cap at 30 days
  const articles = getCachedArticles()
  const now = Date.now()
  const cutoff = now - hours * 60 * 60 * 1000
  const bucketSize = 60 * 60 * 1000

  const buckets = new Map<number, TemporalBucket>()

  for (let t = cutoff; t <= now; t += bucketSize) {
    const key = Math.floor(t / bucketSize) * bucketSize
    buckets.set(key, { timestamp: key, total: 0, critical: 0, high: 0, medium: 0, low: 0, attackTypes: {} })
  }

  for (const a of articles) {
    if (a.timestamp < cutoff) continue
    const key = Math.floor(a.timestamp / bucketSize) * bucketSize
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { timestamp: key, total: 0, critical: 0, high: 0, medium: 0, low: 0, attackTypes: {} }
      buckets.set(key, bucket)
    }
    bucket.total++
    const sev = a.severity as 'critical' | 'high' | 'medium' | 'low'
    bucket[sev]++
    bucket.attackTypes[a.attackType] = (bucket.attackTypes[a.attackType] ?? 0) + 1
  }

  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp)
}

// ── Geographic Heatmap ──────────────────────────────────────────────

export interface GeoHeatmapPoint {
  lat: number
  lng: number
  weight: number
  type: 'actor' | 'target'
}

export function getGeoHeatmap(): GeoHeatmapPoint[] {
  const articles = getCachedArticles().filter(a => a.extracted)
  const pointMap = new Map<string, GeoHeatmapPoint>()

  for (const a of articles) {
    const sevWeight = a.severity === 'critical' ? 4 : a.severity === 'high' ? 3 : a.severity === 'medium' ? 2 : 1

    if (a.sourceLat !== undefined && a.sourceLng !== undefined) {
      const key = `a:${a.sourceLat.toFixed(1)},${a.sourceLng.toFixed(1)}`
      const existing = pointMap.get(key)
      if (existing) { existing.weight += sevWeight }
      else { pointMap.set(key, { lat: a.sourceLat, lng: a.sourceLng, weight: sevWeight, type: 'actor' }) }
    }

    if (a.targetLat !== undefined && a.targetLng !== undefined) {
      const key = `t:${a.targetLat.toFixed(1)},${a.targetLng.toFixed(1)}`
      const existing = pointMap.get(key)
      if (existing) { existing.weight += sevWeight }
      else { pointMap.set(key, { lat: a.targetLat, lng: a.targetLng, weight: sevWeight, type: 'target' }) }
    }
  }

  return [...pointMap.values()]
}

// ── Edge Articles ───────────────────────────────────────────────────

export function getEdgeArticles(actorId: string, targetId: string): CyberNewsArticle[] {
  const articles = getCachedArticles()
  const actorName = actorId.replace(/^actor-/, '').replace(/-/g, ' ')
  const targetName = targetId.replace(/^target-/, '').replace(/-/g, ' ')

  return articles.filter(a =>
    a.sourceActor?.toLowerCase() === actorName &&
    a.target?.toLowerCase() === targetName
  ).sort((a, b) => b.timestamp - a.timestamp)
}
