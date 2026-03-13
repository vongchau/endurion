# Cyber Threat Intelligence Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the cyber view from a basic news feed + graph visualization into a full threat intelligence workstation with landscape summaries, actor profiles, IOC export, CVE enrichment, MITRE ATT&CK heatmap, temporal views, campaign clustering, geographic heatmaps, watchlists, and edge drill-down.

**Architecture:** Ten features built incrementally on top of the existing RSS + Gemini extraction pipeline. Server-side additions: NVD CVE API integration, MITRE ATT&CK static data, and new aggregation endpoints. Client-side: new panel components, store extensions, and visualization layers. Each task produces a working, testable increment.

**Tech Stack:** React 18, TypeScript, Zustand, Framer Motion, Tailwind CSS, Hono (server), Mapbox GL JS, NVD REST API (free, no key), MITRE ATT&CK STIX JSON (static).

---

## File Structure

### Server — New Files
- `server/cveCache.ts` — NVD CVE lookup + in-memory cache
- `server/mitreData.ts` — MITRE ATT&CK tactic/technique matrix from static JSON
- `server/cyberAggregations.ts` — Pre-computed aggregations (stats, campaigns, actor profiles, heatmap)

### Server — Modified Files
- `server/cyberNewsCache.ts` — Expose article lookup helpers, campaign grouping
- `server/index.ts` — New endpoints for aggregations, CVE, MITRE data

### Client — New Files
- `src/views/cyber/CyberDashboard.tsx` — Threat landscape summary strip
- `src/views/cyber/CyberHeatmap.tsx` — Geographic attack density layer (Mapbox)
- `src/views/cyber/MitreHeatmap.tsx` — MITRE ATT&CK tactic grid
- `src/views/cyber/CyberTimeline.tsx` — Temporal sparkline strip
- `src/components/panels/ActorProfilePanel.tsx` — Aggregated threat actor detail
- `src/components/panels/CveDetail.tsx` — Enriched CVE display component
- `src/components/panels/shared.tsx` — Shared DataRow and SectionHeader components
- `src/components/IocExport.tsx` — Copy/export IOC button
- `src/hooks/useCyberAggregations.ts` — Polls /api/cyber/aggregations
- `src/hooks/useCveEnrichment.ts` — Fetches CVE details from server
- `src/views/cyber/CyberViewToggles.tsx` — Graph/Heatmap/ATT&CK view toggle buttons

### Client — Modified Files
- `src/types/index.ts` — New types for aggregations, CVE, MITRE, campaigns, watchlist
- `src/store/index.ts` — Watchlist state, cyber layer toggles, active cyber panel
- `src/views/cyber/CyberLayer.tsx` — Edge click handling, heatmap toggle, actor profile click
- `src/components/panels/EntityPanel/index.tsx` — Actor profile rendering, CVE enrichment display, edge detail
- `src/components/panels/EventFeedPanel/index.tsx` — Watchlist highlighting, campaign grouping toggle
- `src/App.tsx` — Render new cyber sub-panels conditionally

---

## Chunk 1: Server-Side Foundation (Tasks 1-3)

### Task 1: CVE Enrichment Cache

**Files:**
- Create: `server/cveCache.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Create `server/cveCache.ts`**

```typescript
// server/cveCache.ts — NVD CVE lookup with in-memory cache
import { sleep } from './utils'

export interface CveDetail {
  id: string              // CVE-2024-1234
  description: string
  cvssScore: number | null
  cvssVector: string | null
  cvssSeverity: string | null  // CRITICAL, HIGH, MEDIUM, LOW
  publishedDate: string
  lastModified: string
  references: string[]
  affectedProducts: string[]
  exploitAvailable: boolean
}

const cveCache = new Map<string, CveDetail | null>()
const MAX_CVE_CACHE = 2000
const NVD_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0'

async function fetchCve(cveId: string): Promise<CveDetail | null> {
  try {
    const res = await fetch(`${NVD_BASE}?cveId=${encodeURIComponent(cveId)}`)
    if (!res.ok) return null
    const data = await res.json()
    const vuln = data.vulnerabilities?.[0]?.cve
    if (!vuln) return null

    // Extract CVSS v3.1 first, fall back to v3.0, then v2
    const metrics = vuln.metrics
    const cvss31 = metrics?.cvssMetricV31?.[0]?.cvssData
    const cvss30 = metrics?.cvssMetricV30?.[0]?.cvssData
    const cvss2 = metrics?.cvssMetricV2?.[0]?.cvssData

    const cvssData = cvss31 || cvss30 || cvss2
    const cvssScore = cvssData?.baseScore ?? null
    const cvssVector = cvssData?.vectorString ?? null
    const cvssSeverity = cvssData?.baseSeverity ?? null

    // Extract affected products from CPE
    const configs = vuln.configurations ?? []
    const products: string[] = []
    for (const config of configs) {
      for (const node of config.nodes ?? []) {
        for (const match of node.cpeMatch ?? []) {
          if (match.criteria) {
            // cpe:2.3:a:vendor:product:version:...
            const parts = match.criteria.split(':')
            if (parts.length >= 5) {
              products.push(`${parts[3]}/${parts[4]}`)
            }
          }
        }
      }
    }

    // Check for exploit references
    const refs = (vuln.references ?? []).map((r: { url: string }) => r.url)
    const exploitAvailable = refs.some((r: string) =>
      r.includes('exploit-db') || r.includes('packetstorm') ||
      r.includes('github.com') && r.includes('exploit')
    )

    return {
      id: cveId,
      description: vuln.descriptions?.find((d: { lang: string }) => d.lang === 'en')?.value ?? '',
      cvssScore,
      cvssVector,
      cvssSeverity,
      publishedDate: vuln.published ?? '',
      lastModified: vuln.lastModified ?? '',
      references: refs.slice(0, 5),
      affectedProducts: [...new Set(products)].slice(0, 10),
      exploitAvailable,
    }
  } catch (err) {
    console.error(`[CVE] Failed to fetch ${cveId}:`, err)
    return null
  }
}

export async function getCveDetails(cveIds: string[]): Promise<Record<string, CveDetail>> {
  const results: Record<string, CveDetail> = {}
  const toFetch: string[] = []

  for (const id of cveIds) {
    const cached = cveCache.get(id)
    if (cached !== undefined) {
      if (cached) results[id] = cached
    } else {
      toFetch.push(id)
    }
  }

  // NVD rate limit: 5 requests per 30s without API key
  for (const id of toFetch.slice(0, 5)) {
    // Prune cache if needed
    if (cveCache.size > MAX_CVE_CACHE) {
      const iter = cveCache.keys()
      for (let i = 0; i < 200; i++) {
        const { value, done } = iter.next()
        if (done) break
        cveCache.delete(value)
      }
    }

    const detail = await fetchCve(id)
    cveCache.set(id, detail)
    if (detail) results[id] = detail
    await sleep(6500) // respect NVD rate limit
  }

  return results
}

export function getCachedCve(cveId: string): CveDetail | null {
  return cveCache.get(cveId) ?? null
}

// Pre-warm cache for all CVEs seen in articles (fire-and-forget)
export async function prewarmCveCache(cveIds: string[]): Promise<void> {
  const unknown = cveIds.filter(id => !cveCache.has(id)).slice(0, 30)
  for (const id of unknown) {
    if (cveCache.size > MAX_CVE_CACHE) break
    const detail = await fetchCve(id)
    cveCache.set(id, detail)
    await sleep(6500)
  }
  console.log(`[CVE] Prewarmed ${unknown.length} CVEs, cache size: ${cveCache.size}`)
}
```

- [ ] **Step 2: Add CVE endpoint to `server/index.ts`**

Add import at top of `server/index.ts`:
```typescript
import { getCveDetails, getCachedCve } from './cveCache'
```

Add route before the `serve()` call:
```typescript
app.get('/api/cyber/cve', async (c) => {
  const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? []
  if (ids.length === 0) return c.json({ error: 'Missing ids param' }, 400)
  if (ids.length > 10) return c.json({ error: 'Max 10 CVEs per request' }, 400)
  const details = await getCveDetails(ids)
  return c.json(details)
})
```

- [ ] **Step 3: Trigger CVE prewarm from cyber news poller**

In `server/cyberNewsCache.ts`, add import:
```typescript
import { prewarmCveCache } from './cveCache'
```

At the end of the `extractBatch` `.then()` callback (inside `doFetchAll`), add:
```typescript
// Pre-warm CVE cache for extracted CVEs
const allCves = [...new Set(cachedArticles.flatMap(a => a.cves))]
if (allCves.length > 0) {
  prewarmCveCache(allCves).catch(e => console.error('[CVE] prewarm error:', e))
}
```

- [ ] **Step 4: Commit**

```bash
git add server/cveCache.ts server/index.ts server/cyberNewsCache.ts
git commit -m "feat(cyber): add NVD CVE enrichment cache with prewarm"
```

---

### Task 2: MITRE ATT&CK Static Data

**Files:**
- Create: `server/mitreData.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Create `server/mitreData.ts`**

The MITRE ATT&CK Enterprise matrix has 14 tactics. We embed the canonical list rather than fetching STIX JSON at runtime — it rarely changes and this avoids an external dependency.

```typescript
// server/mitreData.ts — MITRE ATT&CK Enterprise matrix (v15)

export interface MitreTactic {
  id: string         // TA0001
  name: string       // Initial Access
  shortName: string  // initial-access
  order: number      // display order in matrix
}

export interface MitreTechnique {
  id: string         // T1566
  name: string       // Phishing
  tacticIds: string[] // which tactics it belongs to
}

export const TACTICS: MitreTactic[] = [
  { id: 'TA0043', name: 'Reconnaissance',        shortName: 'reconnaissance',        order: 0 },
  { id: 'TA0042', name: 'Resource Development',   shortName: 'resource-development',   order: 1 },
  { id: 'TA0001', name: 'Initial Access',         shortName: 'initial-access',         order: 2 },
  { id: 'TA0002', name: 'Execution',              shortName: 'execution',              order: 3 },
  { id: 'TA0003', name: 'Persistence',            shortName: 'persistence',            order: 4 },
  { id: 'TA0004', name: 'Privilege Escalation',   shortName: 'privilege-escalation',   order: 5 },
  { id: 'TA0005', name: 'Defense Evasion',        shortName: 'defense-evasion',        order: 6 },
  { id: 'TA0006', name: 'Credential Access',      shortName: 'credential-access',      order: 7 },
  { id: 'TA0007', name: 'Discovery',              shortName: 'discovery',              order: 8 },
  { id: 'TA0008', name: 'Lateral Movement',       shortName: 'lateral-movement',       order: 9 },
  { id: 'TA0009', name: 'Collection',             shortName: 'collection',             order: 10 },
  { id: 'TA0011', name: 'Command and Control',    shortName: 'command-and-control',    order: 11 },
  { id: 'TA0010', name: 'Exfiltration',           shortName: 'exfiltration',           order: 12 },
  { id: 'TA0040', name: 'Impact',                 shortName: 'impact',                 order: 13 },
]

// Fuzzy-match article tactic names to canonical MITRE tactic IDs
const TACTIC_ALIASES: Record<string, string> = {}
for (const t of TACTICS) {
  const lower = t.name.toLowerCase()
  TACTIC_ALIASES[lower] = t.id
  TACTIC_ALIASES[t.shortName] = t.id
  // Common aliases
  if (lower === 'command and control') TACTIC_ALIASES['c2'] = t.id
  if (lower === 'command and control') TACTIC_ALIASES['command & control'] = t.id
  if (lower === 'privilege escalation') TACTIC_ALIASES['priv esc'] = t.id
}

export function resolveTacticId(name: string): string | null {
  return TACTIC_ALIASES[name.toLowerCase().trim()] ?? null
}

export function getTactics(): MitreTactic[] {
  return TACTICS
}
```

- [ ] **Step 2: Add MITRE endpoint to `server/index.ts`**

Add import:
```typescript
import { getTactics } from './mitreData'
```

Add route:
```typescript
app.get('/api/cyber/mitre/tactics', (c) => c.json(getTactics()))
```

- [ ] **Step 3: Commit**

```bash
git add server/mitreData.ts server/index.ts
git commit -m "feat(cyber): add MITRE ATT&CK tactic matrix data"
```

---

### Task 3: Server-Side Aggregations

**Files:**
- Create: `server/cyberAggregations.ts`
- Modify: `server/cyberNewsCache.ts` — expose `getCachedArticles()` helper
- Modify: `server/index.ts` — add aggregation endpoints

- [ ] **Step 1: Export article accessor from `server/cyberNewsCache.ts`**

Add at the bottom of the public API section:
```typescript
export function getCachedArticles(): CyberNewsArticle[] {
  return cachedArticles
}
```

- [ ] **Step 2: Create `server/cyberAggregations.ts`**

```typescript
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

  // Attack type distribution
  const attackCounts = new Map<string, number>()
  for (const a of articles) {
    attackCounts.set(a.attackType, (attackCounts.get(a.attackType) ?? 0) + 1)
  }

  // Actor frequency
  const actorCounts = new Map<string, { count: number; severity: string }>()
  for (const a of articles) {
    if (!a.sourceActor) continue
    const entry = actorCounts.get(a.sourceActor) ?? { count: 0, severity: 'low' }
    entry.count++
    if (severityRank(a.severity) > severityRank(entry.severity)) entry.severity = a.severity
    actorCounts.set(a.sourceActor, entry)
  }

  // Target frequency
  const targetCounts = new Map<string, number>()
  for (const a of articles) {
    if (!a.target) continue
    targetCounts.set(a.target, (targetCounts.get(a.target) ?? 0) + 1)
  }

  // Malware frequency
  const malwareCounts = new Map<string, number>()
  for (const a of articles) {
    for (const m of a.malwareFamily) {
      malwareCounts.set(m, (malwareCounts.get(m) ?? 0) + 1)
    }
  }

  // CVE frequency
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
  count: number       // articles mentioning this tactic
  severity: string    // worst severity seen
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
    // Campaign key: actor + attack type + first malware (or 'none')
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
    .filter(c => c.articleCount >= 2)  // only show multi-article campaigns
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
  let worstSeverity = 0

  for (const a of articles) {
    attackTypes.add(a.attackType)
    if (a.target) targets.set(a.target, a.targetCountry ?? null)
    a.malwareFamily.forEach(m => malware.add(m))
    a.cves.forEach(c => cves.add(c))
    a.mitreTactics.forEach(t => tactics.add(t))
    const sev = a.severity === 'critical' ? 25 : a.severity === 'high' ? 15 : a.severity === 'medium' ? 8 : 3
    worstSeverity += sev
  }

  const first = articles[0]
  return {
    name: first.sourceActor!,
    country: first.sourceCountry ?? null,
    lat: first.sourceLat ?? null,
    lng: first.sourceLng ?? null,
    threatScore: Math.min(100, worstSeverity),
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
  timestamp: number   // start of bucket (hour)
  total: number
  critical: number
  high: number
  medium: number
  low: number
  attackTypes: Record<string, number>
}

export function getTemporalData(hours = 168): TemporalBucket[] {
  const articles = getCachedArticles()
  const now = Date.now()
  const cutoff = now - hours * 60 * 60 * 1000
  const bucketSize = 60 * 60 * 1000 // 1 hour

  const buckets = new Map<number, TemporalBucket>()

  // Initialize empty buckets
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
  weight: number   // severity-weighted count
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
  // actorId format: "actor-apt-29" → "apt 29"
  const actorName = actorId.replace(/^actor-/, '').replace(/-/g, ' ')
  const targetName = targetId.replace(/^target-/, '').replace(/-/g, ' ')

  return articles.filter(a =>
    a.sourceActor?.toLowerCase() === actorName &&
    a.target?.toLowerCase() === targetName
  ).sort((a, b) => b.timestamp - a.timestamp)
}
```

- [ ] **Step 3: Add aggregation endpoints to `server/index.ts`**

Add import:
```typescript
import { getThreatStats, getMitreHeatmap, getCampaigns, getActorProfile, getTemporalData, getGeoHeatmap, getEdgeArticles } from './cyberAggregations'
```

Add routes (after existing cyber routes):
```typescript
app.get('/api/cyber/stats', (c) => c.json(getThreatStats()))
app.get('/api/cyber/mitre/heatmap', (c) => c.json(getMitreHeatmap()))
app.get('/api/cyber/campaigns', (c) => c.json(getCampaigns()))
app.get('/api/cyber/actor/:name', (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const profile = getActorProfile(name)
  if (!profile) return c.json({ error: 'Actor not found' }, 404)
  return c.json(profile)
})
app.get('/api/cyber/temporal', (c) => {
  const hours = parseInt(c.req.query('hours') ?? '') || 168
  return c.json(getTemporalData(hours))
})
app.get('/api/cyber/heatmap', (c) => c.json(getGeoHeatmap()))
app.get('/api/cyber/edge-articles', (c) => {
  const actorId = c.req.query('actorId') ?? ''
  const targetId = c.req.query('targetId') ?? ''
  if (!actorId || !targetId) return c.json({ error: 'Missing actorId or targetId' }, 400)
  return c.json(getEdgeArticles(actorId, targetId))
})
```

- [ ] **Step 4: Commit**

```bash
git add server/cyberAggregations.ts server/cyberNewsCache.ts server/index.ts
git commit -m "feat(cyber): add aggregation endpoints — stats, campaigns, actors, temporal, heatmap, MITRE, edges"
```

---

## Chunk 2: Client Types, Store, and Hooks (Tasks 4-5)

### Task 4: Types and Store Extensions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add new types to `src/types/index.ts`**

Add before the `Entity` interface:

```typescript
// ── Cyber Aggregation Types ─────────────────────────────────────────

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

export interface MitreHeatmapCell {
  tacticId: string
  tacticName: string
  count: number
  severity: string
}

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

export interface TemporalBucket {
  timestamp: number
  total: number
  critical: number
  high: number
  medium: number
  low: number
  attackTypes: Record<string, number>
}

export interface GeoHeatmapPoint {
  lat: number
  lng: number
  weight: number
  type: 'actor' | 'target'
}

export interface CveDetail {
  id: string
  description: string
  cvssScore: number | null
  cvssVector: string | null
  cvssSeverity: string | null
  publishedDate: string
  lastModified: string
  references: string[]
  affectedProducts: string[]
  exploitAvailable: boolean
}

export type CyberPanel = 'graph' | 'heatmap' | 'mitre'
```

Update the `Entity` interface to add `'actorProfile'` and `'edgeDetail'`:
```typescript
export interface Entity {
  type: 'incident' | 'node' | 'satellite' | 'vessel' | 'drone' | 'news' | 'cyberNews' | 'newsCluster' | 'actorProfile' | 'edgeDetail'
  data: GlobalIncident | CyberNode | Satellite | AISVessel | DroneFlight | NewsArticle | CyberNewsArticle | NewsArticle[] | ActorProfile | CyberNewsArticle[]
}
```

- [ ] **Step 2: Extend Zustand store in `src/store/index.ts`**

Add to the `HUDStore` interface:
```typescript
  // Cyber view state
  cyberPanel: CyberPanel
  setCyberPanel: (panel: CyberPanel) => void
  watchlist: Set<string>  // watched actor names, CVE IDs, malware names
  addToWatchlist: (term: string) => void
  removeFromWatchlist: (term: string) => void
```

Add import of `CyberPanel` in the import line:
```typescript
import type { ViewMode, PanelState, Entity, GlobalLayer, CityLayer, MapBounds, CyberPanel } from '../types'
```

Add to the `create` body:
```typescript
  cyberPanel: 'graph',
  setCyberPanel: (panel) => set({ cyberPanel: panel }),
  watchlist: new Set<string>(),
  addToWatchlist: (term) =>
    set((state) => {
      const next = new Set(state.watchlist)
      next.add(term.toLowerCase())
      return { watchlist: next }
    }),
  removeFromWatchlist: (term) =>
    set((state) => {
      const next = new Set(state.watchlist)
      next.delete(term.toLowerCase())
      return { watchlist: next }
    }),
```

- [ ] **Step 3: Persist watchlist to localStorage**

In `src/store/index.ts`, add after the store creation:
```typescript
// Persist watchlist to localStorage
const WATCHLIST_KEY = 'endurion-watchlist'
try {
  const saved = localStorage.getItem(WATCHLIST_KEY)
  if (saved) {
    const terms = JSON.parse(saved) as string[]
    useHUDStore.setState({ watchlist: new Set(terms) })
  }
} catch { /* ignore */ }

useHUDStore.subscribe((state, prev) => {
  if (state.watchlist !== prev.watchlist) {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...state.watchlist]))
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/store/index.ts
git commit -m "feat(cyber): add types and store for threat stats, campaigns, watchlist, MITRE, CVE"
```

---

### Task 5: Client Hooks

**Files:**
- Create: `src/hooks/useCyberAggregations.ts`
- Create: `src/hooks/useCveEnrichment.ts`
- Create: `src/hooks/useMitreData.ts`

- [ ] **Step 1: Create `src/hooks/useCyberAggregations.ts`**

```typescript
// src/hooks/useCyberAggregations.ts — polls cyber aggregation endpoints
import { useState, useEffect } from 'react'
import type { ThreatStats, MitreHeatmapCell, Campaign, TemporalBucket, GeoHeatmapPoint, ActorProfile } from '../types'

export function useThreatStats(enabled = true) {
  const [stats, setStats] = useState<ThreatStats | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/stats')
        if (res.ok && active) setStats(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 30_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return stats
}

export function useMitreHeatmap(enabled = true) {
  const [cells, setCells] = useState<MitreHeatmapCell[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/mitre/heatmap')
        if (res.ok && active) setCells(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return cells
}

export function useCampaigns(enabled = true) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/campaigns')
        if (res.ok && active) setCampaigns(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return campaigns
}

export function useTemporalData(enabled = true, hours = 168) {
  const [buckets, setBuckets] = useState<TemporalBucket[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/cyber/temporal?hours=${hours}`)
        if (res.ok && active) setBuckets(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled, hours])

  return buckets
}

export function useGeoHeatmap(enabled = true) {
  const [points, setPoints] = useState<GeoHeatmapPoint[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/heatmap')
        if (res.ok && active) setPoints(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return points
}

export function useActorProfile(actorName: string | null) {
  const [profile, setProfile] = useState<ActorProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!actorName) { setProfile(null); return }
    let active = true
    setLoading(true)
    fetch(`/api/cyber/actor/${encodeURIComponent(actorName)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (active) setProfile(data) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [actorName])

  return { profile, loading }
}

export function useEdgeArticles(actorId: string | null, targetId: string | null) {
  const [articles, setArticles] = useState<import('../types').CyberNewsArticle[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!actorId || !targetId) { setArticles([]); return }
    let active = true
    setLoading(true)
    fetch(`/api/cyber/edge-articles?actorId=${encodeURIComponent(actorId)}&targetId=${encodeURIComponent(targetId)}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (active) setArticles(data) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [actorId, targetId])

  return { articles, loading }
}
```

- [ ] **Step 2: Create `src/hooks/useCveEnrichment.ts`**

```typescript
// src/hooks/useCveEnrichment.ts — fetches CVE details from server cache
import { useState, useEffect } from 'react'
import type { CveDetail } from '../types'

export function useCveEnrichment(cveIds: string[]) {
  const [cves, setCves] = useState<Record<string, CveDetail>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (cveIds.length === 0) { setCves({}); return }
    let active = true
    setLoading(true)
    const ids = cveIds.slice(0, 10).join(',')
    fetch(`/api/cyber/cve?ids=${encodeURIComponent(ids)}`)
      .then(res => res.ok ? res.json() : {})
      .then(data => { if (active) setCves(data) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [cveIds.join(',')])

  return { cves, loading }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCyberAggregations.ts src/hooks/useCveEnrichment.ts
git commit -m "feat(cyber): add client hooks for stats, campaigns, temporal, heatmap, actors, CVEs"
```

---

## Chunk 3: Cyber Dashboard, Timeline, and IOC Export (Tasks 6-8)

### Task 6: Threat Landscape Dashboard Strip

**Files:**
- Create: `src/views/cyber/CyberDashboard.tsx`
- Modify: `src/App.tsx` — render dashboard in cyber view

- [ ] **Step 1: Create `src/views/cyber/CyberDashboard.tsx`**

A compact horizontal strip at the top of the cyber view showing key threat stats.

```typescript
// src/views/cyber/CyberDashboard.tsx
import { motion } from 'framer-motion'
import { useThreatStats } from '../../hooks/useCyberAggregations'

const SEVERITY_COLORS = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a6080',
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5">
      <span className="font-mono text-xs tabular-nums" style={{ color: color ?? '#e0f0ff' }}>{value}</span>
      <span className="font-mono text-[7px] tracking-widest text-hud-dim">{label}</span>
    </div>
  )
}

export function CyberDashboard() {
  const stats = useThreatStats(true)

  if (!stats) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-12 left-80 right-80 z-30 flex items-center justify-center"
    >
      <div className="flex items-center gap-0 rounded-lg border border-hud-cyan/20 bg-hud-panel/90 backdrop-blur-md divide-x divide-hud-dim/10">
        <StatBox label="ARTICLES" value={stats.totalArticles} />
        <StatBox label="ACTORS" value={stats.activeActors} color="#ff2d2d" />
        <StatBox label="TARGETS" value={stats.activeTargets} color="#00d4ff" />
        <StatBox label="CRIT/24H" value={stats.criticalCount24h} color={stats.criticalCount24h > 0 ? '#ff2d2d' : '#4a6080'} />
        <StatBox label="HIGH/24H" value={stats.highCount24h} color={stats.highCount24h > 0 ? '#ffaa00' : '#4a6080'} />
        {stats.topAttackTypes[0] && (
          <StatBox label="TOP TYPE" value={stats.topAttackTypes[0].type.replace(/_/g, ' ').toUpperCase()} color="#7b2fff" />
        )}
        {stats.topActors[0] && (
          <StatBox
            label="TOP ACTOR"
            value={stats.topActors[0].name}
            color={SEVERITY_COLORS[stats.topActors[0].severity as keyof typeof SEVERITY_COLORS] ?? '#e0f0ff'}
          />
        )}
        {stats.trendingCves[0] && (
          <StatBox label="TOP CVE" value={stats.trendingCves[0].id} color="#ffaa00" />
        )}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Render in `src/App.tsx`**

Add import:
```typescript
import { CyberDashboard } from './views/cyber/CyberDashboard'
```

Add after `{activeView === 'city' && <CityLayerToggles />}`:
```typescript
{activeView === 'cyber' && <CyberDashboard />}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/cyber/CyberDashboard.tsx src/App.tsx
git commit -m "feat(cyber): add threat landscape dashboard strip with live stats"
```

---

### Task 7: Temporal Sparkline Strip

**Files:**
- Create: `src/views/cyber/CyberTimeline.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/views/cyber/CyberTimeline.tsx`**

An SVG sparkline bar chart at the bottom of the cyber view showing threat activity over the last 7 days.

```typescript
// src/views/cyber/CyberTimeline.tsx
import { motion } from 'framer-motion'
import { useTemporalData } from '../../hooks/useCyberAggregations'

const BAR_COLORS = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a608040',
}

export function CyberTimeline() {
  const buckets = useTemporalData(true, 168)

  if (buckets.length === 0) return null

  const maxTotal = Math.max(...buckets.map(b => b.total), 1)
  const barWidth = 100 / buckets.length
  const height = 40

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-14 left-80 right-80 z-30 flex flex-col items-center"
    >
      <div className="w-full max-w-2xl rounded-lg border border-hud-dim/20 bg-hud-panel/80 backdrop-blur-md px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[8px] tracking-widest text-hud-dim">THREAT ACTIVITY — 7 DAYS</span>
          <div className="flex gap-2">
            {(['critical', 'high', 'medium'] as const).map(s => (
              <div key={s} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BAR_COLORS[s] }} />
                <span className="font-mono text-[7px] text-hud-dim">{s.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${buckets.length} ${height}`} preserveAspectRatio="none">
          {buckets.map((bucket, i) => {
            const totalH = (bucket.total / maxTotal) * height
            const critH = (bucket.critical / maxTotal) * height
            const highH = (bucket.high / maxTotal) * height
            const medH = (bucket.medium / maxTotal) * height

            let y = height
            const bars: { y: number; h: number; color: string }[] = []

            // Stack: low (bottom) → medium → high → critical (top)
            const lowH = totalH - critH - highH - medH
            if (lowH > 0) { y -= lowH; bars.push({ y, h: lowH, color: BAR_COLORS.low }) }
            if (medH > 0) { y -= medH; bars.push({ y, h: medH, color: BAR_COLORS.medium }) }
            if (highH > 0) { y -= highH; bars.push({ y, h: highH, color: BAR_COLORS.high }) }
            if (critH > 0) { y -= critH; bars.push({ y, h: critH, color: BAR_COLORS.critical }) }

            return bars.map((bar, j) => (
              <rect
                key={`${i}-${j}`}
                x={i}
                y={bar.y}
                width={0.8}
                height={Math.max(bar.h, 0.3)}
                fill={bar.color}
                rx={0.1}
              />
            ))
          })}
        </svg>
        <div className="flex justify-between mt-0.5">
          <span className="font-mono text-[7px] text-hud-dim/50">7d ago</span>
          <span className="font-mono text-[7px] text-hud-dim/50">now</span>
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Render in `src/App.tsx`**

Add import:
```typescript
import { CyberTimeline } from './views/cyber/CyberTimeline'
```

Add after the `CyberDashboard` render:
```typescript
{activeView === 'cyber' && <CyberTimeline />}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/cyber/CyberTimeline.tsx src/App.tsx
git commit -m "feat(cyber): add temporal sparkline timeline with severity stacking"
```

---

### Task 8: IOC Export Button

**Files:**
- Create: `src/components/IocExport.tsx`
- Modify: `src/components/panels/EntityPanel/index.tsx` — add to CyberNewsDetail

- [ ] **Step 1: Create `src/components/IocExport.tsx`**

```typescript
// src/components/IocExport.tsx — copy/export IOCs from cyber articles
import { useState } from 'react'

interface IocExportProps {
  iocs: string[]
  cves: string[]
  malware: string[]
  actor?: string
  title?: string
}

export function IocExport({ iocs, cves, malware, actor, title }: IocExportProps) {
  const [copied, setCopied] = useState(false)
  const hasData = iocs.length > 0 || cves.length > 0

  if (!hasData) return null

  const buildText = () => {
    const lines: string[] = []
    if (title) lines.push(`# ${title}`, '')
    if (actor) lines.push(`Actor: ${actor}`, '')
    if (iocs.length > 0) {
      lines.push('## IOCs', ...iocs, '')
    }
    if (cves.length > 0) {
      lines.push('## CVEs', ...cves, '')
    }
    if (malware.length > 0) {
      lines.push('## Malware', ...malware, '')
    }
    return lines.join('\n')
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportCsv = () => {
    const rows = [
      ['type', 'value'],
      ...iocs.map(i => ['ioc', i]),
      ...cves.map(c => ['cve', c]),
      ...malware.map(m => ['malware', m]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iocs-${actor?.replace(/\s+/g, '-') ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-1.5 mt-2 mb-1">
      <button
        onClick={handleCopy}
        className="flex-1 px-2 py-1.5 rounded border text-center font-mono text-[9px] tracking-wider transition-colors border-hud-green/30 text-hud-green hover:bg-hud-green/10"
      >
        {copied ? 'COPIED' : 'COPY IOCs'}
      </button>
      <button
        onClick={handleExportCsv}
        className="flex-1 px-2 py-1.5 rounded border text-center font-mono text-[9px] tracking-wider transition-colors border-hud-dim/30 text-hud-dim hover:bg-hud-dim/10"
      >
        EXPORT CSV
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add IocExport to CyberNewsDetail in `src/components/panels/EntityPanel/index.tsx`**

Add import at the top:
```typescript
import { IocExport } from '../IocExport'
```

Inside the `CyberNewsDetail` component, add the `IocExport` component just before the description section (before `{data.description && (`):
```typescript
      <IocExport
        iocs={data.iocs}
        cves={data.cves}
        malware={data.malwareFamily}
        actor={data.sourceActor}
        title={data.title}
      />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/IocExport.tsx src/components/panels/EntityPanel/index.tsx
git commit -m "feat(cyber): add IOC copy/export buttons to entity detail"
```

---

## Chunk 4: CVE Enrichment, MITRE Heatmap, and Actor Profiles (Tasks 9-11)

### Task 9: CVE Enrichment in Entity Panel

**Files:**
- Create: `src/components/panels/CveDetail.tsx`
- Modify: `src/components/panels/EntityPanel/index.tsx` — replace static CVE tags with enriched display

- [ ] **Step 1: Create `src/components/panels/CveDetail.tsx`**

```typescript
// src/components/panels/CveDetail.tsx — enriched CVE display with CVSS scores
import { useCveEnrichment } from '../../hooks/useCveEnrichment'
import type { CveDetail as CveDetailType } from '../../types'

function CveCard({ cve }: { cve: CveDetailType }) {
  const scoreColor = cve.cvssScore === null ? '#4a6080'
    : cve.cvssScore >= 9.0 ? '#ff2d2d'
    : cve.cvssScore >= 7.0 ? '#ffaa00'
    : cve.cvssScore >= 4.0 ? '#00d4ff'
    : '#00ff88'

  return (
    <div className="px-2 py-1.5 rounded border border-hud-amber/20 bg-hud-amber/5 mb-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-hud-amber">{cve.id}</span>
        {cve.cvssScore !== null && (
          <span className="font-mono text-[9px] font-bold" style={{ color: scoreColor }}>
            {cve.cvssScore.toFixed(1)} {cve.cvssSeverity ?? ''}
          </span>
        )}
      </div>
      {cve.exploitAvailable && (
        <span className="inline-block mt-0.5 px-1 py-0.5 rounded text-[7px] font-mono bg-hud-red/20 text-hud-red border border-hud-red/30">
          EXPLOIT AVAILABLE
        </span>
      )}
      {cve.description && (
        <p className="font-mono text-[8px] text-hud-dim leading-snug mt-1 line-clamp-2">
          {cve.description}
        </p>
      )}
      {cve.affectedProducts.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {cve.affectedProducts.slice(0, 3).map(p => (
            <span key={p} className="px-1 py-0.5 rounded text-[7px] font-mono bg-hud-dim/10 text-hud-dim border border-hud-dim/20">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CveFallbackTag({ id }: { id: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-amber/10 text-hud-amber border border-hud-amber/20">
      {id}
    </span>
  )
}

export function EnrichedCveSection({ cveIds }: { cveIds: string[] }) {
  const { cves, loading } = useCveEnrichment(cveIds)

  if (cveIds.length === 0) return null

  return (
    <div className="mb-2">
      {cveIds.map(id => {
        const enriched = cves[id]
        return enriched ? (
          <CveCard key={id} cve={enriched} />
        ) : (
          <div key={id} className="mb-1">
            <CveFallbackTag id={id} />
            {loading && <span className="font-mono text-[7px] text-hud-dim ml-1 animate-pulse">enriching...</span>}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Replace static CVE tags in CyberNewsDetail**

In `src/components/panels/EntityPanel/index.tsx`, add import:
```typescript
import { EnrichedCveSection } from './CveDetail'
```

Replace the existing CVE section in `CyberNewsDetail` (the block with `SectionHeader label="CVEs"`) with:
```typescript
      {data.cves.length > 0 && (
        <>
          <SectionHeader label="CVEs" color="#ffaa00" />
          <EnrichedCveSection cveIds={data.cves} />
        </>
      )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/CveDetail.tsx src/components/panels/EntityPanel/index.tsx
git commit -m "feat(cyber): enriched CVE display with CVSS scores and exploit status"
```

---

### Task 10: MITRE ATT&CK Heatmap Panel

**Files:**
- Create: `src/views/cyber/MitreHeatmap.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/views/cyber/MitreHeatmap.tsx`**

A compact 14-cell grid showing MITRE tactic coverage heatmapped by article count.

```typescript
// src/views/cyber/MitreHeatmap.tsx
import { motion } from 'framer-motion'
import { useMitreHeatmap } from '../../hooks/useCyberAggregations'
import { useHUDStore } from '../../store'

const SEVERITY_HEAT = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a6080',
}

export function MitreHeatmap() {
  const cyberPanel = useHUDStore((s) => s.cyberPanel)
  const cells = useMitreHeatmap(cyberPanel === 'mitre')

  if (cyberPanel !== 'mitre' || cells.length === 0) return null

  const maxCount = Math.max(...cells.map(c => c.count), 1)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-30 w-[700px] rounded-lg border border-hud-cyan/20 bg-hud-panel/95 backdrop-blur-md p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-hud-cyan rounded-full" />
        <span className="font-mono text-[10px] tracking-widest text-hud-cyan">MITRE ATT&CK — TACTIC COVERAGE</span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const intensity = cell.count / maxCount
          const color = SEVERITY_HEAT[cell.severity as keyof typeof SEVERITY_HEAT] ?? '#4a6080'

          return (
            <div
              key={cell.tacticId}
              className="flex flex-col items-center justify-center p-2 rounded border transition-all hover:scale-105"
              style={{
                borderColor: `${color}${Math.round(intensity * 80 + 20).toString(16).padStart(2, '0')}`,
                backgroundColor: `${color}${Math.round(intensity * 30).toString(16).padStart(2, '0')}`,
              }}
              title={`${cell.tacticName}: ${cell.count} articles (worst: ${cell.severity})`}
            >
              <span className="font-mono text-[8px] text-center leading-tight text-hud-text" style={{ color }}>
                {cell.tacticName.split(' ').slice(0, 2).join(' ')}
              </span>
              <span className="font-mono text-sm tabular-nums mt-1" style={{ color }}>
                {cell.count}
              </span>
              <span className="font-mono text-[7px] text-hud-dim">{cell.tacticId}</span>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Add cyber view toggle buttons and render MitreHeatmap in `src/App.tsx`**

Add import:
```typescript
import { MitreHeatmap } from './views/cyber/MitreHeatmap'
```

Add a `CyberViewToggles` component directly in `App.tsx` (or create inline). Add after the `<CyberDashboard />` render:
```typescript
{activeView === 'cyber' && <CyberViewToggles />}
{activeView === 'cyber' && <MitreHeatmap />}
```

Create the toggle component at the top of `App.tsx` (after imports, before `BootScreen`):
```typescript
function CyberViewToggles() {
  const cyberPanel = useHUDStore((s) => s.cyberPanel)
  const setCyberPanel = useHUDStore((s) => s.setCyberPanel)

  const toggles: { key: import('./types').CyberPanel; label: string }[] = [
    { key: 'graph', label: 'GRAPH' },
    { key: 'heatmap', label: 'GEO HEAT' },
    { key: 'mitre', label: 'ATT&CK' },
  ]

  return (
    <div className="fixed bottom-16 right-6 z-40 flex gap-2">
      {toggles.map(({ key, label }) => {
        const active = cyberPanel === key
        return (
          <button
            key={key}
            onClick={() => setCyberPanel(key)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[10px] tracking-widest border transition-all"
            style={{
              borderColor: active ? '#ff2d2d' : '#4a6080',
              color: active ? '#ff2d2d' : '#4a6080',
              backgroundColor: active ? '#ff2d2d15' : 'transparent',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/cyber/MitreHeatmap.tsx src/App.tsx
git commit -m "feat(cyber): add MITRE ATT&CK tactic heatmap with view toggle"
```

---

### Task 11: Threat Actor Profile Panel

**Files:**
- Create: `src/components/panels/ActorProfilePanel.tsx`
- Modify: `src/components/panels/EntityPanel/index.tsx` — render actor profile
- Modify: `src/views/cyber/CyberLayer.tsx` — actor node click opens profile instead of first article

- [ ] **Step 1: Create `src/components/panels/ActorProfilePanel.tsx`**

```typescript
// src/components/panels/ActorProfilePanel.tsx — aggregated threat actor detail
import { useActorProfile } from '../../hooks/useCyberAggregations'
import { useCveEnrichment } from '../../hooks/useCveEnrichment'
import { useHUDStore } from '../../store'
import { IocExport } from '../IocExport'
import type { ActorProfile } from '../../types'

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1">
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
      <span className="font-mono text-[8px] tracking-[0.2em]" style={{ color }}>{label}</span>
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
    </div>
  )
}

function DataRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
      <span className="font-mono text-[10px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-xs text-right max-w-[60%]" style={{ color: color ?? '#e0f0ff' }}>{value}</span>
    </div>
  )
}

export function ActorProfileDetail({ profile }: { profile: ActorProfile }) {
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const addToWatchlist = useHUDStore((s) => s.addToWatchlist)
  const watchlist = useHUDStore((s) => s.watchlist)
  const isWatched = watchlist.has(profile.name.toLowerCase())

  const scoreColor = profile.threatScore > 80 ? '#ff2d2d' : profile.threatScore > 50 ? '#ffaa00' : '#00d4ff'

  const ago = (ts: number) => {
    const d = Date.now() - ts
    return d < 3600_000 ? `${Math.round(d / 60_000)}m ago`
      : d < 86400_000 ? `${Math.round(d / 3600_000)}h ago`
      : `${Math.round(d / 86400_000)}d ago`
  }

  return (
    <div className="px-3 pt-2">
      {/* Header */}
      <div className="mb-2 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30">
        THREAT ACTOR — {profile.name}
      </div>

      {/* Watch button */}
      <button
        onClick={() => addToWatchlist(profile.name)}
        className="w-full mb-2 px-2 py-1 rounded border text-center font-mono text-[9px] tracking-wider transition-colors"
        style={{
          borderColor: isWatched ? '#00ff8840' : '#4a608040',
          color: isWatched ? '#00ff88' : '#4a6080',
          backgroundColor: isWatched ? '#00ff8810' : 'transparent',
        }}
      >
        {isWatched ? 'WATCHING' : 'ADD TO WATCHLIST'}
      </button>

      {/* Stats */}
      {profile.country && <DataRow label="ORIGIN" value={profile.country.toUpperCase()} color="#ff2d2d" />}
      <DataRow label="THREAT SCORE" value={`${profile.threatScore}/100`} color={scoreColor} />
      <DataRow label="ARTICLES" value={profile.articleCount} />
      <DataRow label="FIRST SEEN" value={ago(profile.firstSeen)} />
      <DataRow label="LAST SEEN" value={ago(profile.lastSeen)} />

      {/* Attack types */}
      <SectionHeader label="ATTACK METHODS" color="#ff2d2d" />
      <div className="flex flex-wrap gap-1 mb-2">
        {profile.attackTypes.map(t => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-red/10 text-hud-red border border-hud-red/20">
            {t.replace(/_/g, ' ').toUpperCase()}
          </span>
        ))}
      </div>

      {/* Targets */}
      {profile.targets.length > 0 && (
        <>
          <SectionHeader label="TARGETS" color="#00d4ff" />
          <div className="space-y-1 mb-2">
            {profile.targets.slice(0, 8).map(t => (
              <div key={t.name} className="flex justify-between items-center">
                <span className="font-mono text-[9px] text-hud-cyan truncate">{t.name}</span>
                {t.country && <span className="font-mono text-[8px] text-hud-dim">{t.country}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Malware */}
      {profile.malware.length > 0 && (
        <>
          <SectionHeader label="MALWARE / TOOLS" color="#ff2d2d" />
          <div className="flex flex-wrap gap-1 mb-2">
            {profile.malware.map(m => (
              <span key={m} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-red/10 text-hud-red border border-hud-red/20">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {/* CVEs */}
      {profile.cves.length > 0 && (
        <>
          <SectionHeader label="CVEs" color="#ffaa00" />
          <div className="flex flex-wrap gap-1 mb-2">
            {profile.cves.map(c => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-amber/10 text-hud-amber border border-hud-amber/20">
                {c}
              </span>
            ))}
          </div>
        </>
      )}

      {/* MITRE Tactics */}
      {profile.mitreTactics.length > 0 && (
        <>
          <SectionHeader label="MITRE ATT&CK" color="#00d4ff" />
          <div className="flex flex-wrap gap-1 mb-2">
            {profile.mitreTactics.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-cyan/10 text-hud-cyan border border-hud-cyan/20">
                {t}
              </span>
            ))}
          </div>
        </>
      )}

      {/* IOC Export */}
      <IocExport
        iocs={[]}
        cves={profile.cves}
        malware={profile.malware}
        actor={profile.name}
      />

      {/* Recent articles */}
      <SectionHeader label="RECENT ARTICLES" color="#7b2fff" />
      <div className="space-y-0 mb-2">
        {profile.recentArticles.map(a => (
          <button
            key={a.id}
            onClick={() => {
              // Fetch full article from feed endpoint would be ideal,
              // but for now we show the title as a lightweight link
            }}
            className="w-full text-left px-1 py-1.5 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors"
          >
            <div className="font-mono text-[9px] text-hud-text leading-snug line-clamp-2">{a.title}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-[7px]" style={{
                color: a.severity === 'critical' ? '#ff2d2d' : a.severity === 'high' ? '#ffaa00' : '#00d4ff'
              }}>
                {a.severity.toUpperCase()}
              </span>
              <span className="font-mono text-[7px] text-hud-dim">{ago(a.timestamp)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add actor profile rendering to EntityPanel**

In `src/components/panels/EntityPanel/index.tsx`, add import:
```typescript
import { ActorProfileDetail } from './ActorProfilePanel'
import type { ActorProfile } from '../../../types'
```

Add rendering case after the `newsCluster` case:
```typescript
              {selectedEntity.type === 'actorProfile' && (
                <ActorProfileDetail profile={selectedEntity.data as ActorProfile} />
              )}
```

- [ ] **Step 3: Update CyberLayer actor node click to fetch profile**

In `src/views/cyber/CyberLayer.tsx`, the node click handler currently looks up a matching article. For **actor** nodes, change to fetch the profile instead. Modify the `onClick` handler:

```typescript
              onClick={() => {
                if (node.type === 'actor') {
                  // Fetch actor profile
                  fetch(`/api/cyber/actor/${encodeURIComponent(node.label)}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(profile => {
                      if (profile) {
                        setSelectedEntity({ type: 'actorProfile', data: profile })
                        setPanelVisible('entity', true)
                      }
                    })
                    .catch(() => {})
                } else {
                  const article = nodeArticleMap.get(node.id)
                  if (article) {
                    setSelectedEntity({ type: 'cyberNews', data: article })
                    setPanelVisible('entity', true)
                  }
                }
              }}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/ActorProfilePanel.tsx src/components/panels/EntityPanel/index.tsx src/views/cyber/CyberLayer.tsx
git commit -m "feat(cyber): add aggregated threat actor profile panel with watchlist"
```

---

## Chunk 5: Geographic Heatmap, Edge Detail, Campaign Grouping, and Watchlist (Tasks 12-15)

### Task 12: Geographic Attack Heatmap

**Files:**
- Create: `src/views/cyber/CyberHeatmap.tsx`
- Modify: `src/views/cyber/CyberLayer.tsx` — conditionally show heatmap vs graph

- [ ] **Step 1: Create `src/views/cyber/CyberHeatmap.tsx`**

Uses Mapbox GL `heatmap` layer type for geographic density visualization.

```typescript
// src/views/cyber/CyberHeatmap.tsx — geographic attack density heatmap
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import { useGeoHeatmap } from '../../hooks/useCyberAggregations'
import { useHUDStore } from '../../store'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function CyberHeatmap() {
  const cyberPanel = useHUDStore((s) => s.cyberPanel)
  const points = useGeoHeatmap(cyberPanel === 'heatmap')

  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (points.length === 0) return EMPTY_GEOJSON
    return {
      type: 'FeatureCollection',
      features: points.map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { weight: p.weight, type: p.type },
      })),
    }
  }, [points])

  if (cyberPanel !== 'heatmap') return null

  return (
    <Source id="cyber-heatmap" type="geojson" data={geojson}>
      <Layer
        id="cyber-heat-layer"
        type="heatmap"
        paint={{
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 40],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.1, 'rgba(0,212,255,0.2)',
            0.3, 'rgba(123,47,255,0.4)',
            0.5, 'rgba(255,170,0,0.6)',
            0.7, 'rgba(255,45,45,0.7)',
            1, 'rgba(255,45,45,1)',
          ],
          'heatmap-opacity': 0.8,
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 2: Conditionally render in CyberLayer**

In `src/views/cyber/CyberLayer.tsx`, add import:
```typescript
import { CyberHeatmap } from './CyberHeatmap'
import { useHUDStore as useStore } from '../../store'
```

At the top of the `CyberLayer` component, add:
```typescript
  const cyberPanel = useStore((s) => s.cyberPanel)
```

In the return JSX, wrap the existing graph rendering (canvas + markers) in a conditional, and add heatmap:
```typescript
  return (
    <>
      {cyberPanel === 'heatmap' && <CyberHeatmap />}

      {cyberPanel === 'graph' && (
        <>
          <canvas ... />
          {graph.nodes.map((node) => { ... })}
        </>
      )}
    </>
  )
```

Also conditionally skip the `useAnimatedEdges` call when not in graph mode by passing `cyberPanel === 'graph' ? graph : null` as the graph argument.

- [ ] **Step 3: Commit**

```bash
git add src/views/cyber/CyberHeatmap.tsx src/views/cyber/CyberLayer.tsx
git commit -m "feat(cyber): add geographic attack density heatmap with view toggle"
```

---

### Task 13: Edge Detail (Attack Path Drill-Down)

**Files:**
- Modify: `src/views/cyber/CyberLayer.tsx` — add edge click detection on canvas
- Modify: `src/components/panels/EntityPanel/index.tsx` — add edge detail rendering

- [ ] **Step 1: Add edge click handler to CyberLayer**

In the `CyberLayer` component, add a click handler on the canvas. Add a new `handleCanvasClick` callback that checks if the click is near any edge line, and if so, fetches the edge articles:

```typescript
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!graph || cyberPanel !== 'graph') return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))

    for (const edge of graph.edges) {
      const src = nodeMap.get(edge.sourceId)
      const dst = nodeMap.get(edge.targetId)
      if (!src || !dst) continue

      const srcPx = getPixel(src.lng, src.lat)
      const dstPx = getPixel(dst.lng, dst.lat)
      if (!srcPx || !dstPx) continue

      // Distance from point to line segment
      const dx = dstPx[0] - srcPx[0]
      const dy = dstPx[1] - srcPx[1]
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) continue

      const t = Math.max(0, Math.min(1, ((mx - srcPx[0]) * dx + (my - srcPx[1]) * dy) / lenSq))
      const projX = srcPx[0] + t * dx
      const projY = srcPx[1] + t * dy
      const dist = Math.sqrt((mx - projX) ** 2 + (my - projY) ** 2)

      if (dist < 8) {
        // Fetch articles for this edge
        fetch(`/api/cyber/edge-articles?actorId=${encodeURIComponent(edge.sourceId)}&targetId=${encodeURIComponent(edge.targetId)}`)
          .then(res => res.ok ? res.json() : [])
          .then(articles => {
            if (articles.length > 0) {
              setSelectedEntity({ type: 'edgeDetail', data: articles })
              setPanelVisible('entity', true)
            }
          })
          .catch(() => {})
        return
      }
    }
  }, [graph, cyberPanel, getPixel, setSelectedEntity, setPanelVisible])
```

Update the canvas element to add `onClick` and change `pointerEvents`:
```typescript
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: cyberPanel === 'graph' ? 'auto' : 'none', zIndex: 10, cursor: 'crosshair' }}
      />
```

- [ ] **Step 2: Add edge detail rendering to EntityPanel**

In `src/components/panels/EntityPanel/index.tsx`, add an `EdgeDetail` component and render case.

Add the component (reuses the cluster-style article list pattern):
```typescript
function EdgeDetail({ articles, onSelectArticle }: { articles: CyberNewsArticle[]; onSelectArticle: (a: CyberNewsArticle) => void }) {
  if (articles.length === 0) return null

  const actor = articles[0]?.sourceActor ?? 'Unknown'
  const target = articles[0]?.target ?? 'Unknown'

  return (
    <div className="px-3 pt-2">
      <div className="mb-2 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30">
        ATTACK PATH — {articles.length} ARTICLES
      </div>
      <div className="flex items-center justify-between py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-red">{actor}</span>
        <span className="font-mono text-[10px] text-hud-dim">→</span>
        <span className="font-mono text-[10px] text-hud-cyan">{target}</span>
      </div>

      <div className="space-y-0 mt-2">
        {articles.map(a => {
          const ago = Date.now() - a.timestamp
          const timeStr = ago < 3600_000 ? `${Math.round(ago / 60_000)}m`
            : ago < 86400_000 ? `${Math.round(ago / 3600_000)}h`
            : `${Math.round(ago / 86400_000)}d`
          return (
            <button
              key={a.id}
              onClick={() => onSelectArticle(a)}
              className="w-full text-left px-2 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors"
            >
              <div className="font-mono text-[10px] text-hud-text leading-snug line-clamp-2">{a.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[8px]" style={{
                  color: a.severity === 'critical' ? '#ff2d2d' : a.severity === 'high' ? '#ffaa00' : '#00d4ff'
                }}>
                  {a.severity.toUpperCase()}
                </span>
                <span className="font-mono text-[8px] text-hud-dim">{a.attackType.replace(/_/g, ' ')}</span>
                <span className="font-mono text-[8px] text-hud-dim/50 ml-auto">{timeStr}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

Add render case:
```typescript
              {selectedEntity.type === 'edgeDetail' && (
                <EdgeDetail
                  articles={selectedEntity.data as CyberNewsArticle[]}
                  onSelectArticle={(a) => setSelectedEntity({ type: 'cyberNews', data: a })}
                />
              )}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/cyber/CyberLayer.tsx src/components/panels/EntityPanel/index.tsx
git commit -m "feat(cyber): add edge click drill-down showing attack path articles"
```

---

### Task 14: Campaign Clustering in Event Feed

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx` — add campaign grouping toggle

- [ ] **Step 1: Add campaigns data and toggle**

In `EventFeedPanel`, add imports:
```typescript
import { useCampaigns } from '../../../hooks/useCyberAggregations'
```

Add state and data:
```typescript
  const [showCampaigns, setShowCampaigns] = useState(false)
  const campaigns = useCampaigns(activeView === 'cyber')
```

Add a campaign toggle button in the cyber tab area (after `TabBar` for cyber):
```typescript
          {activeView === 'cyber' && campaigns.length > 0 && (
            <button
              onClick={() => setShowCampaigns(!showCampaigns)}
              className="mx-2 mb-1 px-2 py-1 rounded border font-mono text-[8px] tracking-wider transition-all"
              style={{
                borderColor: showCampaigns ? '#7b2fff' : '#4a608030',
                color: showCampaigns ? '#7b2fff' : '#4a6080',
                backgroundColor: showCampaigns ? '#7b2fff15' : 'transparent',
              }}
            >
              CAMPAIGNS ({campaigns.length})
            </button>
          )}
```

When `showCampaigns` is true and `activeView === 'cyber'`, render campaigns instead of individual articles. Add a campaign section in the scroll area:
```typescript
          {activeView === 'cyber' && showCampaigns && (
            <div className="border-t border-hud-purple/20">
              {campaigns.map(c => {
                const sevColor = c.severity === 'critical' ? '#ff2d2d' : c.severity === 'high' ? '#ffaa00' : '#00d4ff'
                const ago = Date.now() - c.lastSeen
                const timeStr = ago < 3600_000 ? `${Math.round(ago / 60_000)}m`
                  : ago < 86400_000 ? `${Math.round(ago / 3600_000)}h`
                  : `${Math.round(ago / 86400_000)}d`
                return (
                  <div key={c.id} className="px-3 py-2 border-b border-hud-dim/10">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-hud-red">{c.actor}</span>
                      <span className="font-mono text-[8px]" style={{ color: sevColor }}>{c.severity.toUpperCase()}</span>
                    </div>
                    <div className="font-mono text-[9px] text-hud-dim mt-0.5">
                      {c.attackType.replace(/_/g, ' ')} → {c.targets.slice(0, 3).join(', ')}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[8px] text-hud-purple">{c.articleCount} articles</span>
                      {c.malware.length > 0 && <span className="font-mono text-[8px] text-hud-red">{c.malware[0]}</span>}
                      <span className="font-mono text-[8px] text-hud-dim/50 ml-auto">{timeStr}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/panels/EventFeedPanel/index.tsx
git commit -m "feat(cyber): add campaign clustering toggle in threat feed"
```

---

### Task 15: Watchlist Highlighting

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx` — highlight watched items
- Modify: `src/components/panels/EntityPanel/index.tsx` — add watchlist button to CyberNewsDetail

- [ ] **Step 1: Add watchlist highlighting to cyber feed items**

In `EventFeedPanel`, read the watchlist:
```typescript
  const watchlist = useHUDStore((s) => s.watchlist)
```

In the `allCyberItems` mapping, add a `watched` flag:
```typescript
          watched: watchlist.has(a.sourceActor?.toLowerCase() ?? '') ||
                   watchlist.has(a.target?.toLowerCase() ?? '') ||
                   a.malwareFamily.some(m => watchlist.has(m.toLowerCase())) ||
                   a.cves.some(c => watchlist.has(c.toLowerCase())),
```

In the item rendering, add a visual indicator for watched items. In the `motion.button` for each item, add a left-border glow:
```typescript
                  style={item.watched ? { borderLeft: '2px solid #00ff88' } : undefined}
```

- [ ] **Step 2: Add watch button to CyberNewsDetail in EntityPanel**

In `CyberNewsDetail`, read watchlist state:
```typescript
  const addToWatchlist = useHUDStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useHUDStore((s) => s.removeFromWatchlist)
  const watchlist = useHUDStore((s) => s.watchlist)
```

Add watch buttons for the actor and malware. After the severity badge, add:
```typescript
      {data.sourceActor && (
        <button
          onClick={() => {
            const key = data.sourceActor!.toLowerCase()
            watchlist.has(key) ? removeFromWatchlist(key) : addToWatchlist(key)
          }}
          className="w-full mb-1 px-2 py-1 rounded border text-center font-mono text-[9px] tracking-wider transition-colors"
          style={{
            borderColor: watchlist.has(data.sourceActor!.toLowerCase()) ? '#00ff8840' : '#4a608040',
            color: watchlist.has(data.sourceActor!.toLowerCase()) ? '#00ff88' : '#4a6080',
          }}
        >
          {watchlist.has(data.sourceActor!.toLowerCase()) ? `WATCHING: ${data.sourceActor}` : `WATCH: ${data.sourceActor}`}
        </button>
      )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/EventFeedPanel/index.tsx src/components/panels/EntityPanel/index.tsx
git commit -m "feat(cyber): add watchlist highlighting and watch/unwatch buttons"
```

---

## Final Task: Integration Verification

### Task 16: Verify Build and Integration

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 2: Run Vite build**

```bash
npx vite build
```
Expected: Build succeeds, bundle sizes remain reasonable (main chunk < 500KB)

- [ ] **Step 3: Start dev server and verify endpoints**

```bash
npm run dev
```

Verify these endpoints return data:
- `GET /api/cyber/stats`
- `GET /api/cyber/mitre/heatmap`
- `GET /api/cyber/campaigns`
- `GET /api/cyber/temporal?hours=168`
- `GET /api/cyber/heatmap`
- `GET /api/cyber/mitre/tactics`
- `GET /api/cyber/cve?ids=CVE-2024-0001` (may return empty if CVE not in NVD)

- [ ] **Step 4: Commit final integration**

```bash
git add -A
git commit -m "feat(cyber): complete threat intelligence upgrade — 10 features integrated"
```
