# SSE Drone Streaming & FAA Airspace Zones — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace REST polling with SSE push for drone telemetry, and add FAA airspace zone polygons to the city map.

**Architecture:** Server polls Dronetag REST every 5s and pushes updates to browsers via SSE. FAA ArcGIS provides airspace zone polygons fetched on viewport change with 10min cache. Both features are independent and add new CityLayer toggles.

**Tech Stack:** Hono (SSE streaming via `c.body()`), native `EventSource` on client, FAA ArcGIS Feature Service (GeoJSON), react-map-gl `Source`/`Layer` for zone rendering.

---

### Task 1: Server-side SSE drone emitter

**Files:**
- Modify: `server/droneCache.ts`

Replace the on-demand fetch pattern with a self-polling loop that emits events. The cache polls Dronetag every 5s and notifies listeners.

**Step 1: Rewrite droneCache.ts with EventEmitter**

```typescript
// server/droneCache.ts
import { EventEmitter } from 'events'
import type { DroneFlight } from '../src/types'
import { fetchDronetag } from './sources/dronetag'

const POLL_INTERVAL = 5_000
const STALE_MS      = 5 * 60 * 1000

let droneCache = new Map<string, DroneFlight>()
let lastBbox   = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

export const droneEvents = new EventEmitter()

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  const apiKey = process.env.DRONETAG_API_KEY
  if (!apiKey || !lastBbox) return

  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  try {
    const raw = await fetchDronetag(apiKey, minLng, minLat, maxLng, maxLat)
    const now = Date.now()
    droneCache = new Map()
    for (const d of raw) {
      droneCache.set(d.operationId, {
        id: d.operationId,
        sensorId: d.sensorId,
        lat: d.lat,
        lng: d.lng,
        altitude: d.altitude,
        speed: d.speed,
        verticalSpeed: d.verticalSpeed,
        heading: d.heading,
        state: d.state,
        timestamp: d.timestamp,
      })
    }
    // Clean stale
    const cutoff = now - STALE_MS
    for (const [id, d] of droneCache) {
      if (d.timestamp < cutoff) droneCache.delete(id)
    }
    droneEvents.emit('update', Array.from(droneCache.values()))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[droneCache] fetch failed: ${msg}`)
  }
}

export function setDroneBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  // Immediate poll on bbox change
  poll()
}

export function startDronePoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[droneCache] poller started (5s)')
}

export function getDrones(): DroneFlight[] {
  return Array.from(droneCache.values())
}
```

**Step 2: Verify server compiles**

Run: `cd /Users/vongchau/gothamhud && npx tsc --noEmit --skipLibCheck`
Expected: No errors in droneCache.ts

**Step 3: Commit**

```bash
git add server/droneCache.ts
git commit -m "refactor: droneCache to self-polling with EventEmitter"
```

---

### Task 2: SSE endpoint in Hono

**Files:**
- Modify: `server/index.ts`

Add `GET /api/drones/stream` SSE endpoint. Keep the existing `/api/drones/viewport` REST endpoint as fallback.

**Step 1: Add SSE endpoint and start drone poller**

In `server/index.ts`, update the droneCache import and add the SSE route:

```typescript
// Replace the droneCache import:
import { getDrones, setDroneBbox, startDronePoller, droneEvents } from './droneCache'

// Add SSE endpoint BEFORE the existing /api/drones/viewport route:
app.get('/api/drones/stream', (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json({ error: 'Missing bounds' }, 400)
  }

  setDroneBbox(minLng, minLat, maxLng, maxLat)

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* client disconnected */ }
      }

      // Send current state immediately
      send(getDrones())

      // Forward updates
      const onUpdate = (drones: unknown) => send(drones)
      droneEvents.on('update', onUpdate)

      // Cleanup when client disconnects — check via abort signal
      c.req.raw.signal.addEventListener('abort', () => {
        droneEvents.off('update', onUpdate)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

// Update the existing /api/drones/viewport to use the new getDrones():
app.get('/api/drones/viewport', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json([])
  }
  setDroneBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getDrones())
})

// At the bottom, after startPoller() and startAis(), add:
startDronePoller()
```

**Step 2: Verify server compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add SSE /api/drones/stream endpoint"
```

---

### Task 3: Client-side SSE hook

**Files:**
- Modify: `src/hooks/useDrones.ts`

Replace `fetch` + `setInterval` with `EventSource`. Falls back to polling if SSE fails.

**Step 1: Rewrite useDrones.ts**

```typescript
// src/hooks/useDrones.ts
import { useState, useEffect, useMemo, useRef } from 'react'
import type { DroneFlight, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 200) / 200  // 0.005° grid (~500m)
  return {
    minLng: q(bounds.minLng),
    minLat: q(bounds.minLat),
    maxLng: q(bounds.maxLng),
    maxLat: q(bounds.maxLat),
  }
}

export function useDrones(enabled: boolean, bounds: MapBounds | null) {
  const [drones, setDrones] = useState<DroneFlight[]>([])
  const [loading, setLoading] = useState(false)
  const fallbackRef = useRef(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized
    ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}`
    : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) {
      setDrones([])
      return
    }

    const params = new URLSearchParams({
      minLng: String(stableBounds.minLng),
      minLat: String(stableBounds.minLat),
      maxLng: String(stableBounds.maxLng),
      maxLat: String(stableBounds.maxLat),
    })

    // Try SSE first
    if (!fallbackRef.current) {
      setLoading(true)
      const es = new EventSource(`/api/drones/stream?${params}`)

      es.onmessage = (event) => {
        try {
          setDrones(JSON.parse(event.data))
          setLoading(false)
        } catch { /* ignore parse errors */ }
      }

      es.onerror = () => {
        es.close()
        console.warn('[useDrones] SSE failed, falling back to polling')
        fallbackRef.current = true
        // Re-trigger effect by setting drones empty
        setDrones([])
        setLoading(false)
      }

      return () => es.close()
    }

    // Fallback: REST polling
    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/drones/viewport?${params}`)
        if (res.ok && !cancelled) setDrones(await res.json())
      } catch (e) {
        console.error('[useDrones]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds, fallbackRef.current])

  return { drones: enabled ? drones : [], loading }
}
```

**Step 2: Verify frontend compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 3: Test manually**

Start the dev server and switch to city view. Open browser DevTools Network tab. Verify:
- An `EventSource` connection opens to `/api/drones/stream?...`
- Events arrive as SSE `data:` frames every ~5s
- Drone dots update on the map without page refresh

**Step 4: Commit**

```bash
git add src/hooks/useDrones.ts
git commit -m "feat: useDrones SSE streaming with REST fallback"
```

---

### Task 4: FAA airspace data source

**Files:**
- Create: `server/sources/faaAirspace.ts`

Fetch prohibited areas and controlled airspace from FAA ArcGIS Feature Service. Returns GeoJSON FeatureCollection.

**Step 1: Create faaAirspace.ts**

```typescript
// server/sources/faaAirspace.ts

const PROHIBITED_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0/query'
const AIRSPACE_URL   = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Airspace/FeatureServer/0/query'

export interface AirspaceZone {
  type: 'Feature'
  properties: {
    name: string
    zoneType: 'prohibited' | 'restricted' | 'controlled'
    upperAlt: number
    lowerAlt: number
    city: string
    state: string
  }
  geometry: GeoJSON.Geometry
}

async function queryFAA(
  url: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
  zoneType: AirspaceZone['properties']['zoneType'],
): Promise<AirspaceZone[]> {
  const params = new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: '200',
  })

  try {
    const res = await fetch(`${url}?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data.features) return []

    return data.features.map((f: any) => ({
      type: 'Feature',
      properties: {
        name: f.properties.NAME ?? f.properties.NAME_TXT ?? '',
        zoneType,
        upperAlt: Number(f.properties.UPPER_VAL ?? f.properties.DISTVERTUPPER_VAL ?? 0),
        lowerAlt: Number(f.properties.LOWER_VAL ?? f.properties.DISTVERTLOWER_VAL ?? 0),
        city: f.properties.CITY ?? '',
        state: f.properties.STATE ?? '',
      },
      geometry: f.geometry,
    }))
  } catch (e) {
    console.error(`[faaAirspace] query failed: ${e instanceof Error ? e.message : e}`)
    return []
  }
}

export async function fetchAirspaceZones(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<AirspaceZone[]> {
  const [prohibited, controlled] = await Promise.all([
    queryFAA(PROHIBITED_URL, minLng, minLat, maxLng, maxLat, 'prohibited'),
    queryFAA(AIRSPACE_URL, minLng, minLat, maxLng, maxLat, 'controlled'),
  ])
  return [...prohibited, ...controlled]
}
```

**Step 2: Verify compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 3: Commit**

```bash
git add server/sources/faaAirspace.ts
git commit -m "feat: FAA airspace zone data source"
```

---

### Task 5: Zone cache and API endpoint

**Files:**
- Create: `server/zoneCache.ts`
- Modify: `server/index.ts`

**Step 1: Create zoneCache.ts**

```typescript
// server/zoneCache.ts
import { fetchAirspaceZones, type AirspaceZone } from './sources/faaAirspace'

const TTL_MS = 10 * 60 * 1000  // 10 min

interface CacheEntry {
  zones: AirspaceZone[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  // Quantize to 0.1° grid to share cache across small pans
  const q = (n: number) => Math.round(n * 10) / 10
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

export async function getZones(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<AirspaceZone[]> {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  const now = Date.now()
  const cached = cache.get(key)

  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.zones
  }

  const zones = await fetchAirspaceZones(minLng, minLat, maxLng, maxLat)
  cache.set(key, { zones, fetchedAt: now })

  // Evict old entries
  for (const [k, v] of cache) {
    if (now - v.fetchedAt > TTL_MS * 3) cache.delete(k)
  }

  return zones
}
```

**Step 2: Add route to server/index.ts**

Add import at top:
```typescript
import { getZones } from './zoneCache'
```

Add route (after the drones routes):
```typescript
app.get('/api/airspace/zones', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json([])
  }
  const zones = await getZones(minLng, minLat, maxLng, maxLat)
  return c.json(zones)
})
```

**Step 3: Verify compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 4: Commit**

```bash
git add server/zoneCache.ts server/index.ts
git commit -m "feat: add /api/airspace/zones endpoint with caching"
```

---

### Task 6: Client hook for airspace zones

**Files:**
- Create: `src/hooks/useAirspaceZones.ts`

**Step 1: Create useAirspaceZones.ts**

```typescript
// src/hooks/useAirspaceZones.ts
import { useState, useEffect, useMemo } from 'react'
import type { MapBounds } from '../types'

export interface AirspaceZone {
  type: 'Feature'
  properties: {
    name: string
    zoneType: 'prohibited' | 'restricted' | 'controlled'
    upperAlt: number
    lowerAlt: number
    city: string
    state: string
  }
  geometry: GeoJSON.Geometry
}

function quantize(bounds: MapBounds): MapBounds {
  // 0.1° grid — zones are large, don't need fine precision
  const q = (n: number) => Math.round(n * 10) / 10
  return {
    minLng: q(bounds.minLng),
    minLat: q(bounds.minLat),
    maxLng: q(bounds.maxLng),
    maxLat: q(bounds.maxLat),
  }
}

export function useAirspaceZones(enabled: boolean, bounds: MapBounds | null) {
  const [zones, setZones] = useState<AirspaceZone[]>([])

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized
    ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}`
    : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) {
      setZones([])
      return
    }

    let cancelled = false

    const fetchZones = async () => {
      try {
        const params = new URLSearchParams({
          minLng: String(stableBounds.minLng),
          minLat: String(stableBounds.minLat),
          maxLng: String(stableBounds.maxLng),
          maxLat: String(stableBounds.maxLat),
        })
        const res = await fetch(`/api/airspace/zones?${params}`)
        if (res.ok && !cancelled) setZones(await res.json())
      } catch (e) {
        console.error('[useAirspaceZones]', e)
      }
    }

    fetchZones()
    return () => { cancelled = true }
  }, [enabled, stableBounds])

  return { zones: enabled ? zones : [] }
}
```

**Step 2: Verify compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useAirspaceZones.ts
git commit -m "feat: useAirspaceZones client hook"
```

---

### Task 7: Airspace zone map layer

**Files:**
- Create: `src/views/city/AirspaceZoneLayer.tsx`

Renders zone polygons as Mapbox fill + line layers with color coding by zone type.

**Step 1: Create AirspaceZoneLayer.tsx**

```typescript
// src/views/city/AirspaceZoneLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { AirspaceZone } from '../../hooks/useAirspaceZones'

interface Props {
  zones: AirspaceZone[]
}

export function AirspaceZoneLayer({ zones }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: zones.filter((z) => z.geometry),
  }

  return (
    <Source id="airspace-zones" type="geojson" data={geojson}>
      {/* Fill layer */}
      <Layer
        id="airspace-zone-fill"
        type="fill"
        paint={{
          'fill-color': [
            'match', ['get', 'zoneType'],
            'prohibited', '#ff2d2d',
            'restricted', '#ffaa00',
            'controlled', '#00d4ff',
            '#4a6080',
          ],
          'fill-opacity': 0.08,
        }}
      />
      {/* Border layer */}
      <Layer
        id="airspace-zone-line"
        type="line"
        paint={{
          'line-color': [
            'match', ['get', 'zoneType'],
            'prohibited', '#ff2d2d',
            'restricted', '#ffaa00',
            'controlled', '#00d4ff',
            '#4a6080',
          ],
          'line-width': 1,
          'line-opacity': 0.4,
          'line-dasharray': [2, 2],
        }}
      />
      {/* Labels at higher zoom */}
      <Layer
        id="airspace-zone-label"
        type="symbol"
        minzoom={9}
        layout={{
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': [
            'match', ['get', 'zoneType'],
            'prohibited', '#ff2d2d',
            'restricted', '#ffaa00',
            'controlled', '#00d4ff',
            '#4a6080',
          ],
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.6,
        }}
      />
    </Source>
  )
}
```

**Step 2: Verify compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/views/city/AirspaceZoneLayer.tsx
git commit -m "feat: AirspaceZoneLayer Mapbox fill/line rendering"
```

---

### Task 8: Wire zones into CityMarkers and add toggle

**Files:**
- Modify: `src/types/index.ts` — add `'zones'` to `CityLayer`
- Modify: `src/views/city/CityMarkers.tsx` — add zone layer
- Modify: `src/views/city/CityLayerToggles.tsx` — add ZONES toggle
- Modify: `src/store/index.ts` — add `'zones'` to default cityLayers

**Step 1: Update CityLayer type**

In `src/types/index.ts`, change line 34:
```typescript
// FROM:
export type CityLayer = 'uas'
// TO:
export type CityLayer = 'uas' | 'zones'
```

**Step 2: Add 'zones' to default cityLayers in store**

In `src/store/index.ts`, change line 54:
```typescript
// FROM:
cityLayers: new Set<CityLayer>(['uas']),
// TO:
cityLayers: new Set<CityLayer>(['uas', 'zones']),
```

**Step 3: Wire AirspaceZoneLayer into CityMarkers**

Replace `src/views/city/CityMarkers.tsx` with:
```typescript
// src/views/city/CityMarkers.tsx
import { useHUDStore } from '../../store'
import { useDrones } from '../../hooks/useDrones'
import { useAirspaceZones } from '../../hooks/useAirspaceZones'
import { DroneLayer } from './DroneLayer'
import { AirspaceZoneLayer } from './AirspaceZoneLayer'

export function CityMarkers() {
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const showUAS    = cityLayers.has('uas')
  const showZones  = cityLayers.has('zones')
  const { drones } = useDrones(showUAS, mapBounds)
  const { zones }  = useAirspaceZones(showZones, mapBounds)

  return (
    <>
      {showZones && <AirspaceZoneLayer zones={zones} />}
      {showUAS && <DroneLayer drones={drones} />}
    </>
  )
}
```

Note: AirspaceZoneLayer renders before DroneLayer so zones appear below drone points.

**Step 4: Add ZONES toggle to CityLayerToggles**

In `src/views/city/CityLayerToggles.tsx`, change the LAYERS array (line 5-7):
```typescript
// FROM:
const LAYERS: { key: CityLayer; label: string; color: string }[] = [
  { key: 'uas', label: 'UAS', color: '#7b2fff' },
]
// TO:
const LAYERS: { key: CityLayer; label: string; color: string }[] = [
  { key: 'uas',   label: 'UAS',   color: '#7b2fff' },
  { key: 'zones', label: 'ZONES', color: '#ffaa00' },
]
```

**Step 5: Verify compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

**Step 6: Commit**

```bash
git add src/types/index.ts src/store/index.ts src/views/city/CityMarkers.tsx src/views/city/CityLayerToggles.tsx
git commit -m "feat: wire airspace zones into city view with toggle"
```

---

### Task 9: Vite proxy SSE support

**Files:**
- Modify: `vite.config.ts`

Vite's default proxy may buffer SSE responses. We need to ensure the `/api/drones/stream` route is not buffered.

**Step 1: Update vite proxy config**

In `vite.config.ts`, update the proxy section:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    // Required for SSE: disable response buffering
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes) => {
        if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
          proxyRes.headers['cache-control'] = 'no-cache'
          proxyRes.headers['x-accel-buffering'] = 'no'
        }
      })
    },
  },
},
```

**Step 2: Verify dev server starts**

Run: `npx vite --open` (or existing dev command)
Expected: No config errors

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "fix: vite proxy SSE buffering support"
```

---

### Task 10: Manual integration test

**Files:** None (testing only)

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test SSE streaming**

1. Open browser, switch to City view
2. Open DevTools → Network tab, filter by "EventStream"
3. Verify `/api/drones/stream` connection is open
4. Verify events arrive every ~5s
5. Pan the map — verify EventSource reconnects with new bbox

**Step 3: Test airspace zones**

1. In City view, verify ZONES toggle appears (amber) next to UAS toggle
2. Toggle ZONES on — zones should appear as semi-transparent polygons
3. Navigate to Washington DC area — verify P-56 prohibited zone appears in red
4. Navigate to any US airport — verify controlled airspace appears in cyan
5. Toggle ZONES off — polygons should disappear

**Step 4: Test fallback**

1. Stop the backend server
2. Verify browser console shows "SSE failed, falling back to polling"
3. Restart backend — verify polling works as before
