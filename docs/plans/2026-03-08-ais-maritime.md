# AISStream Maritime Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate AISStream.io real-time AIS data into the global view — vessel density heatmap, military candidate markers, chokepoint status panel, and disruption alerts in EventFeedPanel.

**Architecture:** A persistent WebSocket client in `server/ais.ts` connects to AISStream.io and writes to `server/aisCache.ts` (vessel store, density grid, military candidates, disruption logic). Five new Hono routes serve cached data to the React frontend, which adds a fourth `'maritime'` layer toggle, a Mapbox heatmap layer, directional military vessel markers, a chokepoint status panel, and `[AIS]` items in the EventFeedPanel.

**Tech Stack:** React 18, TypeScript, Hono, native WebSocket (Node 22+), Mapbox GL via react-map-gl, Zustand, Vitest. No new npm dependencies required — Node 22's built-in `WebSocket` is used server-side.

**Design doc:** `docs/plans/2026-03-08-ais-maritime-design.md`

---

### Task 1: Add AIS types and extend `GlobalLayer`

**Files:**
- Modify: `src/types/index.ts`

**Context:** `src/types/index.ts` currently ends with `PanelState`. `GlobalLayer` is currently `'conflict' | 'disaster' | 'military'`. Add five new interfaces and add `'maritime'` to `GlobalLayer`. This is a breaking change — the store and LayerToggles will be updated in later tasks.

**Step 1: Append new types to `src/types/index.ts`**

```ts
export type GlobalLayer = 'conflict' | 'disaster' | 'military' | 'maritime'

export interface AISVessel {
  mmsi: number
  name: string
  lat: number
  lng: number
  speed: number       // knots
  heading: number     // degrees 0–360
  shipType: number    // AIS numeric ship type
  shipTypeName: string
  timestamp: number
}

export interface VesselDensityZone {
  lat: number
  lng: number
  intensity: number   // 0.0–1.0 log-normalized
  vesselCount: number
}

export interface MilitaryCandidate {
  mmsi: number
  name: string
  lat: number
  lng: number
  heading: number
  speed: number
  shipType: number
  reason: string      // human-readable detection reason
  timestamp: number
}

export interface Chokepoint {
  name: string
  lat: number
  lng: number
  radius: number      // degrees, search radius
  vesselCount: number // live count from aisCache
}

export interface AISDisruption {
  id: string
  name: string
  type: 'chokepoint_congestion' | 'dark_ship'
  lat: number
  lng: number
  severity: 'low' | 'elevated' | 'high'
  vesselCount: number
  description: string
}
```

**⚠️ Note:** Replace the existing `export type GlobalLayer = ...` line. Do not add a second declaration.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add AIS maritime types and extend GlobalLayer"
```

---

### Task 2: Create `server/aisCache.ts` — pure intelligence logic

**Files:**
- Create: `server/aisCache.ts`
- Create: `server/aisCache.test.ts`

**Context:** All vessel intelligence logic lives here as pure, testable functions. The WebSocket client (`ais.ts`, Task 3) calls `processVesselMessage()`. Routes call `getDensityZones()`, `getMilitaryCandidates()`, etc. No side effects except mutation of the module-level Maps.

**Step 1: Write failing tests**

```ts
// server/aisCache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  processVesselMessage,
  getDensityZones,
  getMilitaryCandidates,
  getChokepoints,
  getDisruptions,
  getStats,
  isLikelyMilitary,
  cleanupStaleVessels,
  _resetForTest,
} from './aisCache'

beforeEach(() => { _resetForTest() })

describe('isLikelyMilitary', () => {
  it('detects ship type 35', () => {
    const r = isLikelyMilitary(123456789, 35, 'VESSEL')
    expect(r.isMilitary).toBe(true)
    expect(r.reason).toMatch(/35/)
  })

  it('detects ship type 55', () => {
    expect(isLikelyMilitary(123456789, 55, 'VESSEL').isMilitary).toBe(true)
  })

  it('detects naval name prefix USS', () => {
    const r = isLikelyMilitary(123456789, 0, 'USS IOWA')
    expect(r.isMilitary).toBe(true)
    expect(r.reason).toMatch(/USS IOWA/)
  })

  it('detects HMS prefix', () => {
    expect(isLikelyMilitary(123456789, 0, 'HMS DRAGON').isMilitary).toBe(true)
  })

  it('returns false for civilian vessel', () => {
    expect(isLikelyMilitary(123456789, 70, 'MAERSK BERLIN').isMilitary).toBe(false)
  })
})

describe('processVesselMessage', () => {
  it('adds vessel to cache', () => {
    processVesselMessage(123456789, 51.5, -0.1, 0, 'TEST', 10, 90, 90)
    const candidates = getMilitaryCandidates()
    const stats = getStats()
    expect(stats.vessels).toBe(1)
  })

  it('adds military vessel to candidates', () => {
    processVesselMessage(111000001, 26.5, 56.5, 35, 'WARSHIP', 15, 180, 180)
    const candidates = getMilitaryCandidates()
    expect(candidates.some(c => c.mmsi === 111000001)).toBe(true)
  })
})

describe('getDensityZones', () => {
  it('returns empty array when no vessels', () => {
    expect(getDensityZones()).toEqual([])
  })

  it('groups vessels into 2-degree grid cells', () => {
    processVesselMessage(1, 26.1, 56.1, 0, 'A', 0, 0, 0)
    processVesselMessage(2, 26.9, 56.9, 0, 'B', 0, 0, 0)
    processVesselMessage(3, 28.0, 58.0, 0, 'C', 0, 0, 0)
    const zones = getDensityZones()
    // First two vessels share same 2° cell (26-28, 56-58)
    const cell = zones.find(z => z.vesselCount >= 2)
    expect(cell).toBeDefined()
  })
})

describe('getChokepoints', () => {
  it('returns all 12 chokepoints', () => {
    expect(getChokepoints()).toHaveLength(12)
  })

  it('counts vessels near Strait of Hormuz', () => {
    // Hormuz center: lat 26.5, lon 56.5
    processVesselMessage(1, 26.5, 56.5, 0, 'TANKER', 12, 90, 90)
    const chokepoints = getChokepoints()
    const hormuz = chokepoints.find(c => c.name === 'Strait of Hormuz')
    expect(hormuz?.vesselCount).toBeGreaterThanOrEqual(1)
  })
})

describe('cleanupStaleVessels', () => {
  it('removes vessels older than threshold', () => {
    vi.useFakeTimers()
    processVesselMessage(1, 10, 20, 0, 'OLD', 0, 0, 0)
    expect(getStats().vessels).toBe(1)
    vi.advanceTimersByTime(31 * 60 * 1000) // 31 minutes
    cleanupStaleVessels()
    expect(getStats().vessels).toBe(0)
    vi.useRealTimers()
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run server/aisCache.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Implement `server/aisCache.ts`**

```ts
// server/aisCache.ts
import type {
  AISVessel, VesselDensityZone, MilitaryCandidate, Chokepoint, AISDisruption,
} from '../src/types'

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_VESSELS       = 50_000
const STALE_MS          = 30 * 60 * 1000   // 30 min
const CANDIDATE_TTL_MS  = 2 * 60 * 60 * 1000
const DENSITY_WINDOW_MS = 30 * 60 * 1000
const GAP_THRESHOLD_MS  = 60 * 60 * 1000
const GRID_SIZE         = 2                 // degrees
const MAX_ZONES         = 200

const NAVAL_RE = /^(USS|USNS|HMS|HMAS|HMCS|INS|JS|ROKS|TCG|FS|BNS|RFS|CGC|PNS|KRI|ITS|SNS)\b/i

export const CHOKEPOINT_DEFS = [
  { name: 'Strait of Hormuz',     lat: 26.5, lng: 56.5,  radius: 2   },
  { name: 'Suez Canal',           lat: 30.0, lng: 32.5,  radius: 1   },
  { name: 'Strait of Malacca',    lat:  2.5, lng: 101.5, radius: 2   },
  { name: 'Bab el-Mandeb',        lat: 12.5, lng: 43.5,  radius: 1.5 },
  { name: 'Panama Canal',         lat:  9.0, lng: -79.5, radius: 1   },
  { name: 'Taiwan Strait',        lat: 24.5, lng: 119.5, radius: 2   },
  { name: 'South China Sea',      lat: 15.0, lng: 115.0, radius: 5   },
  { name: 'Black Sea',            lat: 43.5, lng: 34.0,  radius: 3   },
  { name: 'Gibraltar',            lat: 35.9, lng: -5.5,  radius: 1   },
  { name: 'English Channel',      lat: 50.5, lng:  1.0,  radius: 1.5 },
  { name: 'Dardanelles',          lat: 40.2, lng: 26.4,  radius: 0.5 },
  { name: 'Mozambique Channel',   lat: -17.0, lng: 42.0, radius: 3   },
]

// ── In-memory stores ─────────────────────────────────────────────────────────
let vesselCache        = new Map<number, AISVessel>()
let vesselHistory      = new Map<number, number[]>()   // mmsi → [timestamps]
let densityGrid        = new Map<string, Set<number>>() // gridKey → mmsi set
let candidateStore     = new Map<number, MilitaryCandidate>()
let messageCount       = 0

// ── Helpers ──────────────────────────────────────────────────────────────────
export function getShipTypeName(type: number): string {
  if (type === 35 || type === 55) return 'Military'
  if (type >= 70 && type <= 79) return 'Cargo'
  if (type >= 80 && type <= 89) return 'Tanker'
  if (type >= 60 && type <= 69) return 'Passenger'
  if (type >= 40 && type <= 49) return 'High Speed'
  if (type >= 50 && type <= 59) return 'Special Craft'
  if (type >= 30 && type <= 39) return 'Fishing'
  if (type === 0) return 'Unknown'
  return 'Other'
}

function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_SIZE) * GRID_SIZE},${Math.floor(lng / GRID_SIZE) * GRID_SIZE}`
}

export function isLikelyMilitary(
  mmsi: number, shipType: number, name: string,
): { isMilitary: boolean; reason: string } {
  if (shipType === 35 || shipType === 55)
    return { isMilitary: true, reason: `Ship type ${shipType} (military)` }
  if (shipType >= 50 && shipType <= 59)
    return { isMilitary: true, reason: `Ship type ${shipType} (special craft)` }
  if (name && NAVAL_RE.test(name))
    return { isMilitary: true, reason: `Naval prefix: ${name}` }
  const s = String(mmsi)
  if (s.length >= 9) {
    const suffix = s.slice(3)
    if (suffix.startsWith('00') || suffix.startsWith('99'))
      return { isMilitary: true, reason: `MMSI pattern: ${mmsi}` }
  }
  return { isMilitary: false, reason: '' }
}

// ── Core processing ───────────────────────────────────────────────────────────
export function processVesselMessage(
  mmsi: number, lat: number, lng: number, shipType: number,
  name: string, speed: number, course: number, heading: number,
): void {
  const now = Date.now()
  const existing = vesselCache.get(mmsi)

  const vessel: AISVessel = {
    mmsi, lat, lng, speed, heading, shipType,
    shipTypeName: getShipTypeName(shipType),
    name: name || existing?.name || '',
    timestamp: now,
  }
  vesselCache.set(mmsi, vessel)
  messageCount++

  // Density grid
  const key = gridKey(lat, lng)
  if (!densityGrid.has(key)) densityGrid.set(key, new Set())
  densityGrid.get(key)!.add(mmsi)

  // Vessel history for dark-ship detection
  const hist = vesselHistory.get(mmsi) ?? []
  hist.push(now)
  if (hist.length > 10) hist.shift()
  vesselHistory.set(mmsi, hist)

  // Military candidate
  const { isMilitary, reason } = isLikelyMilitary(mmsi, shipType, name)
  if (isMilitary) {
    candidateStore.set(mmsi, { mmsi, name: vessel.name, lat, lng, heading, speed, shipType, reason, timestamp: now })
  }

  // Evict oldest when at capacity
  if (vesselCache.size > MAX_VESSELS) {
    let oldestMmsi = 0, oldestTime = Infinity
    for (const [m, v] of vesselCache) {
      if (v.timestamp < oldestTime) { oldestTime = v.timestamp; oldestMmsi = m }
    }
    if (oldestMmsi) vesselCache.delete(oldestMmsi)
  }
}

// ── Getters (called by routes) ────────────────────────────────────────────────
export function getDensityZones(): VesselDensityZone[] {
  const cells = Array.from(densityGrid.entries())
    .map(([key, mmsiSet]) => {
      // Filter out stale vessels from the set
      const cutoff = Date.now() - DENSITY_WINDOW_MS
      for (const mmsi of mmsiSet) {
        const v = vesselCache.get(mmsi)
        if (!v || v.timestamp < cutoff) mmsiSet.delete(mmsi)
      }
      const [latStr, lngStr] = key.split(',')
      return {
        lat: parseFloat(latStr) + GRID_SIZE / 2,
        lng: parseFloat(lngStr) + GRID_SIZE / 2,
        vesselCount: mmsiSet.size,
      }
    })
    .filter(c => c.vesselCount >= 2)

  if (cells.length === 0) return []

  const max = Math.max(...cells.map(c => c.vesselCount))
  const min = Math.min(...cells.map(c => c.vesselCount))
  const logMax = Math.log(max + 1)
  const logMin = Math.log(min + 1)

  return cells
    .map(c => ({
      lat: c.lat,
      lng: c.lng,
      vesselCount: c.vesselCount,
      intensity: logMax > logMin
        ? 0.2 + 0.8 * (Math.log(c.vesselCount + 1) - logMin) / (logMax - logMin)
        : 0.5,
    }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, MAX_ZONES)
}

export function getMilitaryCandidates(): MilitaryCandidate[] {
  const now = Date.now()
  return Array.from(candidateStore.values())
    .filter(c => now - c.timestamp < CANDIDATE_TTL_MS)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500)
}

export function getChokepoints(): Chokepoint[] {
  return CHOKEPOINT_DEFS.map(cp => {
    let count = 0
    for (const v of vesselCache.values()) {
      const dist = Math.sqrt(Math.pow(v.lat - cp.lat, 2) + Math.pow(v.lng - cp.lng, 2))
      if (dist <= cp.radius) count++
    }
    return { name: cp.name, lat: cp.lat, lng: cp.lng, radius: cp.radius, vesselCount: count }
  })
}

export function getDisruptions(): AISDisruption[] {
  const disruptions: AISDisruption[] = []
  const now = Date.now()

  // Chokepoint congestion
  for (const cp of CHOKEPOINT_DEFS) {
    let count = 0
    for (const v of vesselCache.values()) {
      const dist = Math.sqrt(Math.pow(v.lat - cp.lat, 2) + Math.pow(v.lng - cp.lng, 2))
      if (dist <= cp.radius) count++
    }
    if (count < 3) continue
    const normalTraffic = cp.radius * 10
    const severity: AISDisruption['severity'] =
      count > normalTraffic * 1.5 ? 'high' : count > normalTraffic ? 'elevated' : 'low'
    disruptions.push({
      id: `chokepoint-${cp.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: cp.name,
      type: 'chokepoint_congestion',
      lat: cp.lat, lng: cp.lng, severity, vesselCount: count,
      description: `${count} vessels in ${cp.name}`,
    })
  }

  // Dark ship — AIS gap spike
  let darkCount = 0
  for (const hist of vesselHistory.values()) {
    if (hist.length >= 2) {
      const last = hist[hist.length - 1]
      const prev = hist[hist.length - 2]
      if (last - prev > GAP_THRESHOLD_MS && now - last < 10 * 60 * 1000) darkCount++
    }
  }
  if (darkCount >= 1) {
    disruptions.push({
      id: 'global-dark-ship',
      name: 'AIS Gap Spike',
      type: 'dark_ship',
      lat: 0, lng: 0,
      severity: darkCount > 20 ? 'high' : darkCount > 10 ? 'elevated' : 'low',
      vesselCount: darkCount,
      description: `${darkCount} vessel${darkCount > 1 ? 's' : ''} reappeared after AIS silence >1h`,
    })
  }

  return disruptions
}

export function getStats() {
  return { vessels: vesselCache.size, messages: messageCount }
}

export function cleanupStaleVessels(): void {
  const cutoff = Date.now() - STALE_MS
  let removed = 0
  for (const [mmsi, v] of vesselCache) {
    if (v.timestamp < cutoff) { vesselCache.delete(mmsi); removed++ }
  }
  // Prune empty density cells
  for (const [key, mmsiSet] of densityGrid) {
    for (const mmsi of mmsiSet) {
      if (!vesselCache.has(mmsi)) mmsiSet.delete(mmsi)
    }
    if (mmsiSet.size === 0) densityGrid.delete(key)
  }
  // Prune stale candidates
  const candCutoff = Date.now() - CANDIDATE_TTL_MS
  for (const [mmsi, c] of candidateStore) {
    if (c.timestamp < candCutoff) candidateStore.delete(mmsi)
  }
  if (removed > 0) console.log(`[aisCache] cleaned ${removed} stale vessels, ${vesselCache.size} remaining`)
}

// ── Test helper — resets all state ───────────────────────────────────────────
export function _resetForTest(): void {
  vesselCache = new Map()
  vesselHistory = new Map()
  densityGrid = new Map()
  candidateStore = new Map()
  messageCount = 0
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/aisCache.test.ts 2>&1 | tail -15`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add server/aisCache.ts server/aisCache.test.ts
git commit -m "feat: add AIS vessel cache and maritime intelligence logic"
```

---

### Task 3: Create `server/ais.ts` — WebSocket client

**Files:**
- Create: `server/ais.ts`

**Context:** Manages the persistent WebSocket connection to AISStream.io. Node 22+ has `WebSocket` as a global — no `ws` package needed. The `startAis()` function is called from `server/index.ts`. If `AISSTREAM_API_KEY` is not set, it logs a warning and returns without connecting (graceful no-op).

**Step 1: Implement**

```ts
// server/ais.ts
import { processVesselMessage, cleanupStaleVessels, getShipTypeName } from './aisCache'

const WS_URL         = 'wss://stream.aisstream.io/v0/stream'
const RECONNECT_MS   = 10_000
const CLEANUP_MS     = 5 * 60 * 1000

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
export let isConnected = false

function connect(apiKey: string): void {
  if (ws) { try { ws.close() } catch {} }

  console.log('[ais] connecting to AISStream…')
  ws = new WebSocket(WS_URL)

  ws.addEventListener('open', () => {
    isConnected = true
    console.log('[ais] connected — subscribing global coverage')
    ws!.send(JSON.stringify({
      APIKey: apiKey,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'],
    }))
  })

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string)
      const meta = msg.MetaData
      if (!meta) return

      const mmsi = meta.MMSI
      if (!mmsi || mmsi <= 0) return

      const lat = meta.latitude
      const lng = meta.longitude
      if (lat == null || lng == null || lat === 0 || lng === 0) return
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return

      let speed = 0, course = 0, heading = 0
      let shipType = 0, name = (meta.ShipName?.trim() ?? '') as string

      if (msg.MessageType === 'PositionReport' && msg.Message?.PositionReport) {
        const pr = msg.Message.PositionReport
        speed = pr.Sog ?? 0; course = pr.Cog ?? 0; heading = pr.TrueHeading ?? 0
      } else if (msg.MessageType === 'StandardClassBPositionReport' && msg.Message?.StandardClassBPositionReport) {
        const pr = msg.Message.StandardClassBPositionReport
        speed = pr.Sog ?? 0; course = pr.Cog ?? 0; heading = pr.TrueHeading ?? 0
      } else if (msg.MessageType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
        const sd = msg.Message.ShipStaticData
        shipType = sd.Type ?? 0
        name = sd.ShipName?.trim() ?? name
      }

      processVesselMessage(mmsi, lat, lng, shipType, name, speed, course, heading)
    } catch {}
  })

  ws.addEventListener('error', (e) => {
    console.error('[ais] WebSocket error:', (e as ErrorEvent).message ?? e)
  })

  ws.addEventListener('close', (e) => {
    isConnected = false
    console.log(`[ais] disconnected (code=${e.code}), reconnecting in ${RECONNECT_MS / 1000}s`)
    scheduleReconnect(apiKey)
  })
}

function scheduleReconnect(apiKey: string): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => connect(apiKey), RECONNECT_MS)
}

export function startAis(): void {
  const apiKey = process.env.AISSTREAM_API_KEY
  if (!apiKey) {
    console.log('[ais] AISSTREAM_API_KEY not set — maritime layer disabled')
    return
  }
  connect(apiKey)
  setInterval(cleanupStaleVessels, CLEANUP_MS)
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add server/ais.ts
git commit -m "feat: add AISStream WebSocket client"
```

---

### Task 4: Register vessel routes in `server/index.ts`

**Files:**
- Modify: `server/index.ts`
- Modify: `.env.example`

**Context:** Add five new routes reading directly from `aisCache`. Register them on the existing Hono app (no sub-app needed — routes are simple). Call `startAis()` alongside `startPoller()`. The existing Vite proxy (`/api → localhost:3001`) already covers `/api/vessels/*`.

**Step 1: Update `server/index.ts`**

Add imports after the existing imports:
```ts
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats } from './aisCache'
import { startAis, isConnected as aisConnected } from './ais'
```

Add routes before the `serve(...)` call:
```ts
app.get('/api/vessels/density',     (c) => c.json(getDensityZones()))
app.get('/api/vessels/military',    (c) => c.json(getMilitaryCandidates()))
app.get('/api/vessels/chokepoints', (c) => c.json(getChokepoints()))
app.get('/api/vessels/disruptions', (c) => c.json(getDisruptions()))
app.get('/api/vessels/stats',       (c) => c.json({ ...getStats(), connected: aisConnected }))
```

Add after `startPoller()...`:
```ts
startAis()
```

**Step 2: Append to `.env.example`**

```
AISSTREAM_API_KEY=    # from aisstream.io — server-side only, WebSocket auth
```

**Step 3: Run all existing tests**

Run: `npx vitest run 2>&1 | tail -15`
Expected: all tests PASS (no regressions)

**Step 4: Commit**

```bash
git add server/index.ts .env.example
git commit -m "feat: register vessel routes and start AIS client on boot"
```

---

### Task 5: Update Zustand store — add `'maritime'` to default layers

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/store.test.ts`

**Context:** `globalLayers` is initialized as `new Set<GlobalLayer>(['conflict', 'disaster', 'military'])`. Add `'maritime'` to the default set. The type already accepts `'maritime'` after Task 1.

**Step 1: Add test**

In `src/store/store.test.ts`, add:
```ts
it("globalLayers includes 'maritime' by default", () => {
  expect(useHUDStore.getState().globalLayers.has('maritime')).toBe(true)
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/store/store.test.ts 2>&1 | tail -10`
Expected: FAIL — `'maritime'` not in set

**Step 3: Update store**

In `src/store/index.ts`, change:
```ts
// BEFORE
globalLayers: new Set<GlobalLayer>(['conflict', 'disaster', 'military']),

// AFTER
globalLayers: new Set<GlobalLayer>(['conflict', 'disaster', 'military', 'maritime']),
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/store/store.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/store/index.ts src/store/store.test.ts
git commit -m "feat: add maritime to default global layers"
```

---

### Task 6: Add `MARITIME` toggle to `LayerToggles`

**Files:**
- Modify: `src/views/global/LayerToggles.tsx`

**Context:** `LayerToggles` renders LAYERS as an array. Add `'maritime'` with green color (`#00ff88`). No logic changes — the component is driven entirely by the LAYERS array.

**Step 1: Add to the LAYERS array**

In `src/views/global/LayerToggles.tsx`, add to the `LAYERS` array:
```ts
{ key: 'maritime', label: 'MARITIME', color: '#00ff88' },
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors (type already accepts `'maritime'`)

**Step 3: Commit**

```bash
git add src/views/global/LayerToggles.tsx
git commit -m "feat: add MARITIME layer toggle pill"
```

---

### Task 7: Create `useVessels` hook

**Files:**
- Create: `src/hooks/useVessels.ts`
- Create: `src/hooks/useVessels.test.ts`

**Context:** Polls `/api/vessels/density` and `/api/vessels/military` in parallel every 10 seconds. Returns `{ density, military, loading }`. Pattern identical to `useFlights.ts` — shorter poll interval because vessel positions change faster than global incidents.

**Step 1: Write the failing test**

```ts
// src/hooks/useVessels.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useVessels } from './useVessels'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

const mockDensity = [{ lat: 10, lng: 20, intensity: 0.5, vesselCount: 5 }]
const mockMilitary = [{ mmsi: 123, name: 'USS TEST', lat: 10, lng: 20, heading: 90, speed: 12, shipType: 35, reason: 'Ship type 35', timestamp: Date.now() }]

describe('useVessels', () => {
  it('starts loading with empty data', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useVessels())
    expect(result.current.loading).toBe(true)
    expect(result.current.density).toEqual([])
    expect(result.current.military).toEqual([])
  })

  it('populates data after fetch', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => mockDensity } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockMilitary } as Response)
    const { result } = renderHook(() => useVessels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.density).toEqual(mockDensity)
    expect(result.current.military).toEqual(mockMilitary)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useVessels.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Implement**

```ts
// src/hooks/useVessels.ts
import { useState, useEffect } from 'react'
import type { VesselDensityZone, MilitaryCandidate } from '../types'

export function useVessels() {
  const [density,  setDensity]  = useState<VesselDensityZone[]>([])
  const [military, setMilitary] = useState<MilitaryCandidate[]>([])
  const [loading,  setLoading]  = useState(true)

  const fetchData = async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        fetch('/api/vessels/density'),
        fetch('/api/vessels/military'),
      ])
      if (dRes.ok) setDensity(await dRes.json())
      if (mRes.ok) setMilitary(await mRes.json())
    } catch (e) {
      console.error('[useVessels]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => clearInterval(id)
  }, [])

  return { density, military, loading }
}
```

**Step 4: Run to verify tests pass**

Run: `npx vitest run src/hooks/useVessels.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/hooks/useVessels.ts src/hooks/useVessels.test.ts
git commit -m "feat: add useVessels hook (density + military candidates)"
```

---

### Task 8: Create `useDisruptions` hook

**Files:**
- Create: `src/hooks/useDisruptions.ts`
- Create: `src/hooks/useDisruptions.test.ts`

**Context:** Polls `/api/vessels/disruptions` every 30 seconds. Simpler than `useVessels` — one endpoint, same pattern as `useGlobalData.ts`.

**Step 1: Write failing test**

```ts
// src/hooks/useDisruptions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDisruptions } from './useDisruptions'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

describe('useDisruptions', () => {
  it('starts with empty data', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDisruptions())
    expect(result.current.disruptions).toEqual([])
  })

  it('returns disruptions after fetch', async () => {
    const mock = [{ id: 'test', name: 'Hormuz', type: 'chokepoint_congestion',
      lat: 26.5, lng: 56.5, severity: 'elevated', vesselCount: 42, description: '42 vessels' }]
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mock } as Response)
    const { result } = renderHook(() => useDisruptions())
    await waitFor(() => expect(result.current.disruptions).toHaveLength(1))
    expect(result.current.disruptions[0].name).toBe('Hormuz')
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useDisruptions.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Implement**

```ts
// src/hooks/useDisruptions.ts
import { useState, useEffect } from 'react'
import type { AISDisruption } from '../types'

export function useDisruptions() {
  const [disruptions, setDisruptions] = useState<AISDisruption[]>([])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/vessels/disruptions')
      if (res.ok) setDisruptions(await res.json())
    } catch (e) {
      console.error('[useDisruptions]', e)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [])

  return { disruptions }
}
```

**Step 4: Run to verify tests pass**

Run: `npx vitest run src/hooks/useDisruptions.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/hooks/useDisruptions.ts src/hooks/useDisruptions.test.ts
git commit -m "feat: add useDisruptions hook"
```

---

### Task 9: Create `VesselDensityLayer` — Mapbox heatmap

**Files:**
- Create: `src/views/global/VesselDensityLayer.tsx`

**Context:** Uses `<Source>` and `<Layer>` from `react-map-gl/mapbox` — the same imports used in `src/views/city/CityMarkers.tsx`. Converts `VesselDensityZone[]` to a GeoJSON FeatureCollection with `intensity` as a feature property, then renders a Mapbox `heatmap` layer type. Color ramp: transparent → green → amber → red.

**Step 1: Implement**

```tsx
// src/views/global/VesselDensityLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { VesselDensityZone } from '../../types'

interface VesselDensityLayerProps {
  zones: VesselDensityZone[]
}

export function VesselDensityLayer({ zones }: VesselDensityLayerProps) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: zones.map((z) => ({
      type: 'Feature' as const,
      properties: { intensity: z.intensity, count: z.vesselCount },
      geometry: { type: 'Point' as const, coordinates: [z.lng, z.lat] },
    })),
  }

  return (
    <Source id="vessel-density" type="geojson" data={geojson}>
      <Layer
        id="vessel-density-heat"
        type="heatmap"
        paint={{
          'heatmap-weight':     ['get', 'intensity'],
          'heatmap-intensity':  1.5,
          'heatmap-radius':     40,
          'heatmap-opacity':    0.65,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.3, 'rgba(0,255,136,0.5)',
            0.6, 'rgba(255,170,0,0.8)',
            1.0, 'rgba(255,45,45,1)',
          ],
        }}
      />
    </Source>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/global/VesselDensityLayer.tsx
git commit -m "feat: add VesselDensityLayer Mapbox heatmap component"
```

---

### Task 10: Update `GlobalMarkers` — add vessel density + military markers

**Files:**
- Modify: `src/views/global/GlobalMarkers.tsx`

**Context:** `GlobalMarkers` already renders `PulseMarker` (incidents) and `FlightMarker` (OpenSky). Add `VesselDensityLayer` and a new `VesselMarker` component. Both only render when `'maritime'` layer is active. `VesselMarker` uses the same `<Marker>` pattern as `FlightMarker` — a small `▲` SVG rotated by heading, green.

**Step 1: Add `VesselMarker` component and wire everything**

Add import at top of `GlobalMarkers.tsx`:
```ts
import { useVessels } from '../../hooks/useVessels'
import { VesselDensityLayer } from './VesselDensityLayer'
import type { MilitaryCandidate } from '../../types'
```

Add `VesselMarker` function before `GlobalMarkers`:
```tsx
function VesselMarker({ candidate }: { candidate: MilitaryCandidate }) {
  return (
    <Marker longitude={candidate.lng} latitude={candidate.lat} anchor="center">
      <div
        style={{ transform: `rotate(${candidate.heading}deg)` }}
        title={`${candidate.name || `MMSI ${candidate.mmsi}`} — ${candidate.reason}`}
        className="w-4 h-4 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 0L9 10L5 7L1 10L5 0Z" fill="#00ff88" />
        </svg>
      </div>
    </Marker>
  )
}
```

Inside `GlobalMarkers()`, add after existing hooks:
```ts
const { density, military } = useVessels()
const showMaritime = globalLayers.has('maritime')
```

Add to the returned JSX (after the existing `FlightMarker` block):
```tsx
{showMaritime && <VesselDensityLayer zones={density} />}
{showMaritime && military.map((c) => (
  <VesselMarker key={c.mmsi} candidate={c} />
))}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/global/GlobalMarkers.tsx
git commit -m "feat: add vessel density heatmap and military candidate markers to GlobalMarkers"
```

---

### Task 11: Create `ChokepointPanel` — live chokepoint status overlay

**Files:**
- Create: `src/views/global/ChokepointPanel.tsx`

**Context:** Fixed overlay, bottom-left, above the LayerToggles row (`bottom-24`). Only rendered when `'maritime'` layer is active (gated in `App.tsx`). Polls `/api/vessels/chokepoints` every 30s (simple fetch, no custom hook needed — inline `useEffect`). Shows 12 chokepoints with a proportional bar and color-coded vessel count.

**Step 1: Implement**

```tsx
// src/views/global/ChokepointPanel.tsx
import { useState, useEffect } from 'react'
import type { Chokepoint } from '../../types'

export function ChokepointPanel() {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([])

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/vessels/chokepoints')
        if (res.ok) setChokepoints(await res.json())
      } catch {}
    }
    fetch_()
    const id = setInterval(fetch_, 30_000)
    return () => clearInterval(id)
  }, [])

  const max = Math.max(...chokepoints.map((c) => c.vesselCount), 1)

  return (
    <div className="fixed bottom-24 left-4 z-30 w-56 bg-hud-panel/90 backdrop-blur-sm
      border border-hud-cyan/20 rounded font-mono overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-cyan/20">
        <span className="text-hud-cyan text-xs">◈</span>
        <span className="text-[10px] tracking-widest text-hud-cyan">CHOKEPOINTS</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {chokepoints.map((cp) => {
          const pct = cp.vesselCount / max
          const color = cp.vesselCount > 50 ? '#ff2d2d'
            : cp.vesselCount > 20 ? '#ffaa00'
            : '#00ff88'
          return (
            <div key={cp.name} className="px-3 py-1.5 border-b border-hud-dim/10 last:border-0">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[9px] text-hud-dim truncate pr-2 flex-1">{cp.name}</span>
                <span className="text-[9px] shrink-0" style={{ color }}>{cp.vesselCount}</span>
              </div>
              <div className="h-0.5 bg-hud-dim/20 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct * 100}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/global/ChokepointPanel.tsx
git commit -m "feat: add ChokepointPanel live vessel count overlay"
```

---

### Task 12: Mount `ChokepointPanel` in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Context:** `ChokepointPanel` is a regular DOM overlay (not inside `<Map>`), like `LayerToggles`. Show it only when `activeView === 'global'` and `'maritime'` layer is active.

**Step 1: Update `App.tsx`**

Add import:
```ts
import { ChokepointPanel } from './views/global/ChokepointPanel'
```

Add to the JSX (alongside `<LayerToggles />`):
```tsx
{activeView === 'global' && globalLayers.has('maritime') && <ChokepointPanel />}
```

Also add at top of `App()`:
```ts
const globalLayers = useHUDStore((s) => s.globalLayers)
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount ChokepointPanel in global view when maritime layer active"
```

---

### Task 13: Update `EventFeedPanel` — add `[AIS]` disruption items

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx`

**Context:** The global view branch of `EventFeedPanel` currently maps `liveIncidents` + `liveFlights` into items. Add `useDisruptions()` and spread disruptions into the global items list with `[AIS]` source badge. Map `AISDisruption.severity` (`'low'|'elevated'|'high'`) to the HUD `Severity` type (`'low'|'medium'|'high'`).

**Step 1: Update `EventFeedPanel/index.tsx`**

Add import:
```ts
import { useDisruptions } from '../../../hooks/useDisruptions'
```

Inside `EventFeedPanel()`, add after existing hooks:
```ts
const { disruptions } = useDisruptions()
```

In the global view items array, add after the `liveFlights` spread:
```ts
...(globalLayers.has('maritime')
  ? disruptions.map((d) => ({
      id: d.id,
      label: d.name,
      sublabel: d.description,
      severity: (d.severity === 'high' ? 'high'
        : d.severity === 'elevated' ? 'medium'
        : 'low') as Severity,
      time: d.vesselCount > 0 ? `${d.vesselCount}v` : '--',
      source: 'AIS',
      onClick: () => {},
    }))
  : []),
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/panels/EventFeedPanel/index.tsx
git commit -m "feat: add AIS disruption events to EventFeedPanel"
```

---

### Task 14: Final verification

**Files:** none (verification only)

**Step 1: Run full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: all tests pass — count should be higher than before

**Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

**Step 3: Lint**

Run: `npm run lint 2>&1 | head -20`
Expected: no errors

**Step 4: Add `AISSTREAM_API_KEY` to `.env.local` and smoke-test**

```
AISSTREAM_API_KEY=your_key_here
```

Run: `npm run dev`

- Server log should show: `[ais] connecting to AISStream…` then `[ais] connected — subscribing global coverage`
- After ~30s: `[AISStream] X messages, Y vessels, Z zones`
- Switch to Global view → toggle MARITIME → density heatmap appears over oceans
- ChokepointPanel appears bottom-left with live vessel counts
- EventFeedPanel shows `[AIS]` items for any active disruptions

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix any lint/type issues from AIS maritime feature"
```
