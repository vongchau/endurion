# Cloudflare Threat Events — Cyber View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static mock cyber graph with live Cloudflare Cloudforce One threat events, showing attackers as primary nodes, target industries as assets, and individual events as burst clusters.

**Architecture:** Server-side poller (30s) fetches Cloudflare threat events and attackers APIs, transforms into CyberGraph (nodes + edges), caches in memory, serves via REST endpoint. Frontend hook polls the endpoint and feeds CyberLayer.

**Tech Stack:** Hono (server), React 18, react-map-gl, Zustand, Framer Motion, Tailwind CSS

**Design Doc:** `docs/plans/2026-03-09-cloudflare-cyber-threats-design.md`

---

### Task 1: Add environment variables and country centroid lookup

**Files:**
- Modify: `.env.local` (add CF_API_KEY and CF_ACCOUNT_ID)
- Create: `server/data/countryCentroids.ts`

**Step 1: Add Cloudflare credentials to .env.local**

Add these two lines to the existing `.env.local`:
```
CF_API_KEY=LSoToyVJuOb9Temy0qcjRMDH9tos_-MkJZvXu--0
CF_ACCOUNT_ID=13005af7341639f0919e4f42759002e8
```

**Step 2: Create the country centroid lookup**

Create `server/data/countryCentroids.ts` — a map of ISO 3166-1 alpha-2 country codes to `[lat, lng]` centroids. Include the top ~50 countries likely to appear in threat data (US, RU, CN, IR, KP, DE, GB, FR, UA, IN, BR, etc.). Export as:

```typescript
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [39.8283, -98.5795],
  RU: [61.5240, 105.3188],
  CN: [35.8617, 104.1954],
  IR: [32.4279, 53.6880],
  KP: [40.3399, 127.5101],
  DE: [51.1657, 10.4515],
  GB: [55.3781, -3.4360],
  FR: [46.6034, 1.8883],
  UA: [48.3794, 31.1656],
  IN: [20.5937, 78.9629],
  BR: [-14.2350, -51.9253],
  // ... ~40 more
}

export const UNKNOWN_ORIGIN: [number, number] = [0, -30]  // Atlantic, for unknowns
```

**Step 3: Commit**

```bash
git add server/data/countryCentroids.ts
git commit -m "feat: add country centroid lookup for cyber graph geo-positioning"
```

---

### Task 2: Create Cloudflare API source module

**Files:**
- Create: `server/sources/cloudflare.ts`

**Step 1: Create the Cloudflare fetcher**

Create `server/sources/cloudflare.ts`. This module calls two Cloudflare endpoints and returns raw typed data. Follow the pattern from `server/sources/noaaSwpc.ts`.

```typescript
// server/sources/cloudflare.ts
// Cloudflare Cloudforce One — Threat Events API

const BASE = 'https://api.cloudflare.com/client/v4/accounts'

export interface CloudflareThreatEvent {
  id: string
  attacker: string
  attackerCountry: string
  category: string
  categoryId: string
  date: string
  targetIndustry: string
  tags: string[]
  tlp: string
  accountability: string
  // severity derived from category/tags
}

export interface CloudflareAttacker {
  id: string
  name: string
  // additional fields as returned by API
}

export async function fetchThreatEvents(
  accountId: string,
  apiKey: string
): Promise<CloudflareThreatEvent[]> {
  const url = `${BASE}/${accountId}/cloudforce-one/events`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Cloudflare events API ${res.status}: ${await res.text()}`)
  }
  const json = await res.json()
  // API returns array directly or envelope — handle both
  return Array.isArray(json) ? json : (json.result ?? json.data ?? [])
}

export async function fetchAttackers(
  accountId: string,
  apiKey: string
): Promise<CloudflareAttacker[]> {
  const url = `${BASE}/${accountId}/cloudforce-one/events/attackers`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Cloudflare attackers API ${res.status}: ${await res.text()}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : (json.result ?? json.data ?? [])
}
```

**Step 2: Commit**

```bash
git add server/sources/cloudflare.ts
git commit -m "feat: add Cloudflare Cloudforce One threat events API source"
```

---

### Task 3: Extend CyberNode type with Cloudflare metadata

**Files:**
- Modify: `src/types/index.ts:118-139`

**Step 1: Add optional Cloudflare fields to CyberNode**

In `src/types/index.ts`, extend the `CyberNode` interface (line 118) with optional fields:

```typescript
export interface CyberNode {
  id: string
  lat: number
  lng: number
  label: string
  type: 'actor' | 'asset' | 'cluster' | 'compromised'
  threatScore: number // 0-100
  // Cloudflare enrichment
  country?: string
  category?: string
  targetIndustry?: string
  eventCount?: number
  tags?: string[]
  parentId?: string  // for burst nodes — links back to actor node
}
```

The `parentId` field lets burst nodes reference their parent attacker for micro-edge rendering.

**Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend CyberNode with Cloudflare threat metadata"
```

---

### Task 4: Create the Cloudflare cyber cache with graph transformation

**Files:**
- Create: `server/cyberCache.ts`

**Step 1: Create the cache module**

Create `server/cyberCache.ts`. This is the core transformation logic — it takes raw Cloudflare events and produces a `CyberGraph`. Follow the cache pattern from `server/spaceWeatherCache.ts` but with a poller like `server/poller.ts`.

```typescript
// server/cyberCache.ts
import { fetchThreatEvents, fetchAttackers } from './sources/cloudflare'
import { COUNTRY_CENTROIDS, UNKNOWN_ORIGIN } from './data/countryCentroids'
import type { CyberGraph, CyberNode, CyberEdge } from '../src/types'

const POLL_INTERVAL = 30_000
let cache: CyberGraph = { nodes: [], edges: [] }

export function getCyberGraph(): CyberGraph {
  return cache
}

function getCountryCoords(country: string): [number, number] {
  // Try exact match, then uppercase 2-letter code
  const code = country?.toUpperCase().slice(0, 2)
  return COUNTRY_CENTROIDS[code] ?? UNKNOWN_ORIGIN
}

function spreadAroundPoint(
  center: [number, number],
  index: number,
  total: number,
  radius: number
): [number, number] {
  if (total <= 1) return center
  const angle = (2 * Math.PI * index) / total
  return [
    center[0] + radius * Math.cos(angle),
    center[1] + radius * Math.sin(angle),
  ]
}

function deriveThreatScore(event: { category?: string; tags?: string[] }): number {
  // Heuristic: certain categories and tags indicate higher severity
  const cat = (event.category ?? '').toLowerCase()
  const highThreat = ['ransomware', 'apt', 'zero-day', 'exploit', 'backdoor']
  const medThreat = ['phishing', 'malware', 'c2', 'credential']
  if (highThreat.some(t => cat.includes(t))) return 80 + Math.floor(Math.random() * 20)
  if (medThreat.some(t => cat.includes(t))) return 60 + Math.floor(Math.random() * 20)
  return 30 + Math.floor(Math.random() * 30)
}

function buildGraph(events: Awaited<ReturnType<typeof fetchThreatEvents>>): CyberGraph {
  const nodes: CyberNode[] = []
  const edges: CyberEdge[] = []

  // Group events by attacker
  const attackerMap = new Map<string, typeof events>()
  for (const evt of events) {
    const key = evt.attacker || 'UNKNOWN'
    if (!attackerMap.has(key)) attackerMap.set(key, [])
    attackerMap.get(key)!.push(evt)
  }

  // Group events by target industry
  const industrySet = new Set<string>()
  for (const evt of events) {
    if (evt.targetIndustry) industrySet.add(evt.targetIndustry)
  }

  // Create actor nodes (primary)
  const attackerEntries = [...attackerMap.entries()]
  const countryGroups = new Map<string, number>()

  for (const [attacker, evts] of attackerEntries) {
    const country = evts[0]?.attackerCountry ?? ''
    const countryCount = countryGroups.get(country) ?? 0
    countryGroups.set(country, countryCount + 1)

    const center = getCountryCoords(country)
    const pos = spreadAroundPoint(center, countryCount, attackerEntries.filter(([, e]) => (e[0]?.attackerCountry ?? '') === country).length, 2)
    const avgThreat = Math.round(evts.reduce((s, e) => s + deriveThreatScore(e), 0) / evts.length)

    const actorNode: CyberNode = {
      id: `actor-${attacker}`,
      lat: pos[0],
      lng: pos[1],
      label: attacker.toUpperCase(),
      type: 'actor',
      threatScore: avgThreat,
      country,
      eventCount: evts.length,
      tags: [...new Set(evts.flatMap(e => e.tags ?? []))].slice(0, 5),
    }
    nodes.push(actorNode)

    // Create burst nodes (individual events) clustered around this actor
    evts.forEach((evt, i) => {
      const offset: [number, number] = [
        pos[0] + (Math.random() - 0.5) * 1.0,
        pos[1] + (Math.random() - 0.5) * 1.0,
      ]
      const burstNode: CyberNode = {
        id: `evt-${evt.id}`,
        lat: offset[0],
        lng: offset[1],
        label: (evt.category ?? 'EVENT').toUpperCase().slice(0, 12),
        type: 'cluster',
        threatScore: deriveThreatScore(evt),
        category: evt.category,
        tags: evt.tags,
        parentId: actorNode.id,
      }
      nodes.push(burstNode)

      // Micro-edge: actor → burst
      edges.push({
        id: `me-${evt.id}`,
        sourceId: actorNode.id,
        targetId: burstNode.id,
        protocol: evt.category ?? 'UNKNOWN',
        threatScore: burstNode.threatScore,
        bytesPerSec: 0,  // not applicable for threat events
      })
    })
  }

  // Create asset nodes (target industries) in a ring
  const industries = [...industrySet]
  const centerLat = nodes.length > 0 ? nodes.reduce((s, n) => s + n.lat, 0) / nodes.length : 0
  const centerLng = nodes.length > 0 ? nodes.reduce((s, n) => s + n.lng, 0) / nodes.length : 0

  industries.forEach((industry, i) => {
    const angle = (2 * Math.PI * i) / industries.length
    const assetNode: CyberNode = {
      id: `target-${industry.replace(/\s+/g, '-').toLowerCase()}`,
      lat: centerLat + 15 * Math.cos(angle),
      lng: centerLng + 15 * Math.sin(angle),
      label: industry.toUpperCase(),
      type: 'asset',
      threatScore: 0,  // computed below
      targetIndustry: industry,
    }

    // Count targeting actors and compute threat score
    let targetingActors = 0
    for (const [attacker, evts] of attackerEntries) {
      const targets = evts.some(e => e.targetIndustry === industry)
      if (targets) {
        targetingActors++
        // Create edge: actor → target industry
        edges.push({
          id: `edge-${attacker}-${industry}`.replace(/\s+/g, '-'),
          sourceId: `actor-${attacker}`,
          targetId: assetNode.id,
          protocol: evts.find(e => e.targetIndustry === industry)?.category ?? 'THREAT',
          threatScore: Math.round(evts.filter(e => e.targetIndustry === industry).reduce((s, e) => s + deriveThreatScore(e), 0) / evts.filter(e => e.targetIndustry === industry).length),
          bytesPerSec: 0,
        })
      }
    }
    assetNode.threatScore = Math.min(100, targetingActors * 20)
    assetNode.eventCount = targetingActors
    nodes.push(assetNode)
  })

  return { nodes, edges }
}

async function pollCyberGraph() {
  const accountId = process.env.CF_ACCOUNT_ID
  const apiKey = process.env.CF_API_KEY
  if (!accountId || !apiKey) {
    console.warn('[cyberCache] CF_ACCOUNT_ID or CF_API_KEY not set — skipping')
    return
  }

  try {
    const events = await fetchThreatEvents(accountId, apiKey)
    cache = buildGraph(events)
    console.log(`[cyberCache] OK — ${cache.nodes.length} nodes, ${cache.edges.length} edges`)
  } catch (e) {
    console.error(`[cyberCache] ${e instanceof Error ? e.message : e}`)
  }
}

export function startCyberPoller() {
  console.log('[cyberCache] initial fetch…')
  pollCyberGraph()
  setInterval(pollCyberGraph, POLL_INTERVAL)
}
```

**Step 2: Commit**

```bash
git add server/cyberCache.ts
git commit -m "feat: cyber cache with Cloudflare → CyberGraph transformation"
```

---

### Task 5: Add /api/cyber/graph route and start the poller

**Files:**
- Modify: `server/index.ts:1-129`

**Step 1: Import and wire up the cyber cache**

In `server/index.ts`, add imports at top (after line 13):

```typescript
import { getCyberGraph, startCyberPoller } from './cyberCache'
```

Add the route (after the TLE route, ~line 117):

```typescript
app.get('/api/cyber/graph', (c) => c.json(getCyberGraph()))
```

Start the poller (after line 128, alongside other pollers):

```typescript
startCyberPoller()
```

**Step 2: Verify the server compiles and starts**

Run: `cd /Users/vongchau/gothamhud && npx tsx server/index.ts`

Expected: Server starts, logs `[cyberCache] initial fetch…` followed by either `OK` with node/edge counts or a credential error.

**Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/cyber/graph endpoint and start cyber poller"
```

---

### Task 6: Create useCyberGraph frontend hook

**Files:**
- Create: `src/hooks/useCyberGraph.ts`

**Step 1: Create the hook**

Follow the exact pattern from `src/hooks/useGlobalData.ts`:

```typescript
// src/hooks/useCyberGraph.ts
import { useState, useEffect } from 'react'
import type { CyberGraph } from '../types'

export function useCyberGraph() {
  const [graph, setGraph] = useState<CyberGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const fetchGraph = async () => {
      try {
        const res = await fetch('/api/cyber/graph')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: CyberGraph = await res.json()
        if (active) {
          setGraph(data)
          setError(null)
        }
      } catch (e) {
        console.error('[useCyberGraph]', e)
        if (active) setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchGraph()
    const id = setInterval(fetchGraph, 30_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  return { graph, loading, error }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useCyberGraph.ts
git commit -m "feat: add useCyberGraph hook for live threat data polling"
```

---

### Task 7: Update CyberLayer to use live data

**Files:**
- Modify: `src/views/cyber/CyberLayer.tsx:1-132`

**Step 1: Replace static import with hook**

Replace the entire `CyberLayer.tsx` with the updated version:

Key changes:
1. Replace `import { cyberGraph } from '../../data/cyber-graph'` with `import { useCyberGraph } from '../../hooks/useCyberGraph'`
2. Call `const { graph, loading, error } = useCyberGraph()` inside the component
3. Pass `graph` into `useAnimatedEdges` (which now needs to accept a dynamic graph)
4. Make `useAnimatedEdges` accept `CyberGraph | null` as a parameter instead of referencing the static import
5. Handle loading state: show "SYNCING THREAT FEED..." centered text on canvas
6. Handle empty/null state: show "NO ACTIVE THREATS DETECTED"
7. Differentiate burst nodes (5x5px with `parentId`) from primary nodes (8-10px)
8. Actor nodes get 10x10px, asset nodes 8x8px, burst/cluster nodes 5x5px
9. Actor→Target edges: 2px lineWidth. Actor→Burst micro-edges: 1px lineWidth, lower opacity

The `useAnimatedEdges` hook must be updated to:
- Accept `graph: CyberGraph | null` as a parameter
- Guard against null graph
- Use `graph.edges` and `graph.nodes` instead of static `cyberGraph`
- Re-initialize `progressRef` when graph changes (edges may change count)
- Differentiate edge thickness: check if edge `targetId` starts with `evt-` for micro-edges (1px) vs primary edges (2px)

**Step 2: Verify the component renders**

Run: `cd /Users/vongchau/gothamhud && npm run dev`

Expected: Cyber view shows either live threat nodes (if API works) or "SYNCING THREAT FEED..." / "NO ACTIVE THREATS DETECTED" states.

**Step 3: Commit**

```bash
git add src/views/cyber/CyberLayer.tsx
git commit -m "feat: CyberLayer uses live Cloudflare threat data with loading states"
```

---

### Task 8: Update EventFeedPanel for live cyber data

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx:8,161-166`

**Step 1: Replace static cyberGraph import**

Remove line 8: `import { cyberGraph } from '../../../data/cyber-graph'`

Add: `import { useCyberGraph } from '../../../hooks/useCyberGraph'`

Inside the component, add: `const { graph: cyberGraph } = useCyberGraph()`

**Step 2: Update the cyber feed items (lines 161-166)**

Replace the current cyber items block:

```typescript
: activeView === 'cyber'
? (cyberGraph?.edges ?? [])
    .filter(e => !e.id.startsWith('me-'))  // skip micro-edges, show only actor→target
    .map(e => {
      const srcNode = cyberGraph?.nodes.find(n => n.id === e.sourceId)
      const dstNode = cyberGraph?.nodes.find(n => n.id === e.targetId)
      return {
        id: e.id,
        label: `${srcNode?.label ?? e.sourceId} → ${dstNode?.label ?? e.targetId}`,
        sublabel: e.protocol,
        severity: (e.threatScore > 85 ? 'critical' : e.threatScore > 65 ? 'high' : 'medium') as Severity,
        time: '--:--',
        source: 'CF1',
        onClick: () => {
          if (srcNode) {
            setSelectedEntity({ type: 'node', data: srcNode })
            setPanelVisible('entity', true)
          }
        },
      }
    })
```

**Step 3: Update panel header for cyber view (line 210)**

Change `'LIVE EVENT FEED'` to `\`THREAT FEED · ${items.length}\``

**Step 4: Commit**

```bash
git add src/components/panels/EventFeedPanel/index.tsx
git commit -m "feat: EventFeedPanel shows live Cloudflare threat edges with click-to-select"
```

---

### Task 9: Update EntityPanel with richer cyber node details

**Files:**
- Modify: `src/components/panels/EntityPanel/index.tsx:43-56`

**Step 1: Enhance NodeDetail component**

Replace the `NodeDetail` component (lines 43-56) with an enriched version that uses the new optional fields:

```typescript
function NodeDetail({ data }: { data: CyberNode }) {
  const scoreColor = data.threatScore > 80 ? 'text-hud-red' : data.threatScore > 60 ? 'text-hud-amber' : 'text-hud-green'
  const typeBadge = data.type === 'actor' ? SEVERITY_BG.critical
    : data.type === 'asset' ? SEVERITY_BG.nominal
    : data.type === 'cluster' ? SEVERITY_BG.medium
    : SEVERITY_BG.high

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${typeBadge}`}>
        {data.type.toUpperCase()} — {data.label}
      </div>
      <DataRow label="NODE" value={data.label} />
      <DataRow label="TYPE" value={data.type.toUpperCase()} />
      {data.country && <DataRow label="COUNTRY" value={data.country.toUpperCase()} />}
      {data.category && <DataRow label="CATEGORY" value={data.category.toUpperCase()} />}
      {data.targetIndustry && <DataRow label="INDUSTRY" value={data.targetIndustry.toUpperCase()} />}
      {data.eventCount !== undefined && <DataRow label="EVENTS" value={data.eventCount} />}
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="flex justify-between items-center py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">THREAT SCORE</span>
        <span className={`font-mono text-xs ${scoreColor}`}>{data.threatScore}/100</span>
      </div>
      {data.tags && data.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-purple/10 text-hud-purple border border-hud-purple/20">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/panels/EntityPanel/index.tsx
git commit -m "feat: EntityPanel shows enriched Cloudflare threat node details"
```

---

### Task 10: Delete mock data and final cleanup

**Files:**
- Delete: `src/data/cyber-graph.ts`
- Verify: no remaining imports of `cyber-graph`

**Step 1: Search for remaining references to cyber-graph**

Run: `grep -r "cyber-graph" src/`

Expected: No results (all imports were replaced in Tasks 7 and 8).

**Step 2: Delete the mock data file**

```bash
rm src/data/cyber-graph.ts
```

**Step 3: Check if src/data/ directory is now empty**

Run: `ls src/data/`

If empty, remove the directory: `rmdir src/data/`

**Step 4: Verify the app compiles**

Run: `cd /Users/vongchau/gothamhud && npm run build`

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove static cyber graph mock data"
```

---

### Task 11: End-to-end smoke test

**Files:** None (manual verification)

**Step 1: Start the server and dev server**

Run: `cd /Users/vongchau/gothamhud && npm run dev`

**Step 2: Verify server logs**

Expected in terminal:
```
[cyberCache] initial fetch…
[cyberCache] OK — N nodes, M edges
```

If you see credential errors, verify `.env.local` has the correct `CF_API_KEY` and `CF_ACCOUNT_ID`.

**Step 3: Test the API endpoint directly**

Run: `curl http://localhost:3001/api/cyber/graph | jq '.nodes | length'`

Expected: A number > 0

**Step 4: Test in browser**

1. Open `http://localhost:5173`
2. Press `3` to switch to Cyber view
3. Verify: Nodes appear on the map at geographic positions
4. Verify: Animated edges connect actors to targets and burst clusters
5. Verify: Event feed panel shows threat edges with `[CF1]` source tag
6. Click a node → Verify entity panel shows enriched details (country, category, tags)

**Step 5: Test loading/empty states**

Temporarily set `CF_API_KEY` to an invalid value in `.env.local`, restart server:
- Verify: Cyber view shows "SYNCING THREAT FEED..." then falls back gracefully

**Step 6: Restore valid credentials and commit if any fixes were needed**
