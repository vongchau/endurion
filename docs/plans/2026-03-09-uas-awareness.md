# UAS Awareness Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live drone tracking to the city view using the Dronetag API, rendered as purple markers with a toggleable UAS layer.

**Architecture:** Server-side polling cache (`droneCache.ts`) fetches Dronetag telemetry on-demand when the frontend requests drones for a viewport. Frontend `useDrones` hook polls every 10s, `DroneLayer` renders purple triangles on the Mapbox map, `DroneDetail` in EntityPanel shows telemetry on click. A `CityLayerToggles` component controls visibility.

**Tech Stack:** Hono (server routes), Dronetag REST API v2 (Bearer auth), react-map-gl Mapbox layers, Zustand (city layer state)

---

### Task 1: Add DroneFlight type and CityLayer to types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add the DroneFlight interface after AISVessel**

Add after the `AISVessel` interface (~line 55):

```typescript
export interface DroneFlight {
  id: string              // operation_id
  sensorId: string
  lat: number
  lng: number
  altitude: number        // meters MSL
  speed: number           // m/s horizontal
  verticalSpeed: number   // m/s
  heading: number         // degrees 0-360
  state: string           // 'grounded' | 'airborne' | etc.
  timestamp: number
}
```

**Step 2: Add CityLayer type after GlobalLayer**

Add after `export type GlobalLayer = ...` (~line 32):

```typescript
export type CityLayer = 'uas'
```

**Step 3: Add 'drone' to the Entity union**

Change the Entity interface:

```typescript
export interface Entity {
  type: 'incident' | 'poi' | 'node' | 'satellite' | 'vessel' | 'drone'
  data: GlobalIncident | CityPOI | CyberNode | Satellite | AISVessel | DroneFlight
}
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean (no errors)

**Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add DroneFlight type and CityLayer to types"
```

---

### Task 2: Add cityLayers to Zustand store

**Files:**
- Modify: `src/store/index.ts`

**Step 1: Import CityLayer**

Change the import line:

```typescript
import type { ViewMode, PanelState, Entity, GlobalLayer, CityLayer, CityProfile, MapBounds } from '../types'
```

**Step 2: Add cityLayers state and toggle to the interface**

Add to the `HUDStore` interface after the `globalLayers` lines:

```typescript
  cityLayers: Set<CityLayer>
  toggleCityLayer: (layer: CityLayer) => void
```

**Step 3: Add the implementation to the store**

Add after the `toggleGlobalLayer` implementation:

```typescript
  cityLayers: new Set<CityLayer>(['uas']),
  toggleCityLayer: (layer) =>
    set((state) => {
      const next = new Set(state.cityLayers)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return { cityLayers: next }
    }),
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add cityLayers state to Zustand store"
```

---

### Task 3: Create server/sources/dronetag.ts

**Files:**
- Create: `server/sources/dronetag.ts`

**Step 1: Write the Dronetag API client**

```typescript
// server/sources/dronetag.ts

const BASE_URL = 'https://api.dronetag.com/v2/airspace/telemetry'

interface GlobalUAResponse {
  operation_id: string
  timestamp: string
  sensor_id: string
  latitude: number
  longitude: number
}

interface UATelemResponse {
  timestamp: string
  sensor_id: string
  operation_id: string
  operational_state?: string
  location?: { latitude: number; longitude: number; accuracy?: number }
  altitudes?: Array<{ type: string; value: number; accuracy?: number }>
  velocity?: {
    heading?: number
    horizontal_speed?: number
    vertical_speed?: number
  }
}

export interface RawDrone {
  operationId: string
  sensorId: string
  lat: number
  lng: number
  altitude: number
  speed: number
  verticalSpeed: number
  heading: number
  state: string
  timestamp: number
}

export async function fetchDronetag(
  apiKey: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<RawDrone[]> {
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }

  // Fetch latest positions (lightweight)
  const globalRes = await fetch(
    `${BASE_URL}/global-ua?bbox=${bbox}&max_age=5`,
    { headers },
  )
  if (!globalRes.ok) {
    console.error(`[dronetag] global-ua failed: ${globalRes.status}`)
    return []
  }
  const globalData: GlobalUAResponse[] = await globalRes.json()
  if (globalData.length === 0) return []

  // Fetch richer telemetry for the same bbox
  const telemRes = await fetch(
    `${BASE_URL}/ua?bbox=${bbox}&from=-PT5M&limit=1000&order=-time`,
    { headers },
  )
  const telemData: UATelemResponse[] = telemRes.ok ? await telemRes.json() : []

  // Index telemetry by operation_id (most recent wins)
  const telemByOp = new Map<string, UATelemResponse>()
  for (const t of telemData) {
    if (!telemByOp.has(t.operation_id)) telemByOp.set(t.operation_id, t)
  }

  // Merge global positions with detailed telemetry
  return globalData.map((g) => {
    const detail = telemByOp.get(g.operation_id)
    return {
      operationId: g.operation_id,
      sensorId: g.sensor_id,
      lat: g.latitude,
      lng: g.longitude,
      altitude: detail?.altitudes?.[0]?.value ?? 0,
      speed: detail?.velocity?.horizontal_speed ?? 0,
      verticalSpeed: detail?.velocity?.vertical_speed ?? 0,
      heading: detail?.velocity?.heading ?? 0,
      state: detail?.operational_state ?? 'unknown',
      timestamp: new Date(g.timestamp).getTime(),
    }
  })
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add server/sources/dronetag.ts
git commit -m "feat: add Dronetag API client (sources/dronetag.ts)"
```

---

### Task 4: Create server/droneCache.ts

**Files:**
- Create: `server/droneCache.ts`

**Step 1: Write the drone cache**

```typescript
// server/droneCache.ts
import type { DroneFlight } from '../src/types'
import { fetchDronetag } from './sources/dronetag'

const STALE_MS       = 5 * 60 * 1000   // 5 min
const MIN_FETCH_GAP  = 10_000          // 10s between fetches

let droneCache  = new Map<string, DroneFlight>()
let lastFetchAt = 0
let lastBbox    = ''

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

export async function getDrones(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<DroneFlight[]> {
  const apiKey = process.env.DRONETAG_API_KEY
  if (!apiKey) return []

  const now = Date.now()
  const key = bboxKey(minLng, minLat, maxLng, maxLat)

  // Refetch if cache is stale or bbox changed significantly
  if (now - lastFetchAt > MIN_FETCH_GAP || key !== lastBbox) {
    try {
      const raw = await fetchDronetag(apiKey, minLng, minLat, maxLng, maxLat)
      // Replace cache with fresh data
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
      lastFetchAt = now
      lastBbox = key
    } catch (e) {
      console.error('[droneCache] fetch failed:', e)
    }
  }

  // Clean stale entries and return
  const cutoff = now - STALE_MS
  const results: DroneFlight[] = []
  for (const [id, d] of droneCache) {
    if (d.timestamp < cutoff) {
      droneCache.delete(id)
    } else {
      results.push(d)
    }
  }
  return results
}

// Test helper
export function _resetForTest(): void {
  droneCache = new Map()
  lastFetchAt = 0
  lastBbox = ''
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add server/droneCache.ts
git commit -m "feat: add drone polling cache (droneCache.ts)"
```

---

### Task 5: Add drone route to server/index.ts

**Files:**
- Modify: `server/index.ts`

**Step 1: Import getDrones**

Add to the imports:

```typescript
import { getDrones } from './droneCache'
```

**Step 2: Add the route**

Add after the vessels snapshot route:

```typescript
app.get('/api/drones/viewport', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json([])
  }
  const drones = await getDrones(minLng, minLat, maxLng, maxLat)
  return c.json(drones)
})
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/drones/viewport route"
```

---

### Task 6: Create useDrones hook

**Files:**
- Create: `src/hooks/useDrones.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useDrones.ts
import { useState, useEffect, useMemo } from 'react'
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

    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        const params = new URLSearchParams({
          minLng: String(stableBounds.minLng),
          minLat: String(stableBounds.minLat),
          maxLng: String(stableBounds.maxLng),
          maxLat: String(stableBounds.maxLat),
        })
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
  }, [enabled, stableBounds])

  return { drones: enabled ? drones : [], loading }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/hooks/useDrones.ts
git commit -m "feat: add useDrones hook with viewport polling"
```

---

### Task 7: Create DroneLayer component

**Files:**
- Create: `src/views/city/DroneLayer.tsx`

**Step 1: Write the drone layer**

```typescript
// src/views/city/DroneLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { DroneFlight } from '../../types'

interface DroneLayerProps {
  drones: DroneFlight[]
}

export function DroneLayer({ drones }: DroneLayerProps) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: drones.map((d) => ({
      type: 'Feature' as const,
      properties: {
        id:            d.id,
        sensorId:      d.sensorId,
        altitude:      d.altitude,
        speed:         d.speed,
        verticalSpeed: d.verticalSpeed,
        heading:       d.heading,
        state:         d.state,
        timestamp:     d.timestamp,
        altLabel:      `${Math.round(d.altitude)}m`,
      },
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] },
    })),
  }

  return (
    <Source id="drone-all" type="geojson" data={geojson}>
      {/* Drone dots — purple, radius scales with zoom */}
      <Layer
        id="drone-points"
        type="circle"
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 4,
            13, 6,
            16, 10,
          ],
          'circle-color': '#7b2fff',
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#7b2fff',
        }}
      />
      {/* Altitude labels — only at high zoom */}
      <Layer
        id="drone-labels"
        type="symbol"
        minzoom={13}
        layout={{
          'text-field': ['get', 'altLabel'],
          'text-size': 9,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#7b2fff',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/views/city/DroneLayer.tsx
git commit -m "feat: add DroneLayer Mapbox circle + label layer"
```

---

### Task 8: Wire DroneLayer into CityMarkers

**Files:**
- Modify: `src/views/city/CityMarkers.tsx`

**Step 1: Import dependencies**

Add imports at top:

```typescript
import { useHUDStore } from '../../store'
import { useDrones } from '../../hooks/useDrones'
import { DroneLayer } from './DroneLayer'
```

Note: `useHUDStore` is already imported — just add `useDrones` and `DroneLayer`.

**Step 2: Add drone data fetching and rendering inside CityMarkers**

After the `if (!selectedCity) return null` line, add:

```typescript
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const showUAS    = cityLayers.has('uas')
  const { drones } = useDrones(showUAS, mapBounds)
```

And inside the return JSX, add after the POI markers `{cityPOIs.map(...)}` block:

```tsx
      {showUAS && <DroneLayer drones={drones} />}
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/views/city/CityMarkers.tsx
git commit -m "feat: wire DroneLayer into CityMarkers"
```

---

### Task 9: Add drone click handler to MapCanvas

**Files:**
- Modify: `src/components/MapCanvas/index.tsx`

**Step 1: Import DroneFlight type**

Change the import:

```typescript
import type { AISVessel, DroneFlight } from '../../types'
```

**Step 2: Update interactiveLayerIds**

Change the `interactiveLayerIds` prop on `<Map>`:

```typescript
interactiveLayerIds={
  activeView === 'global' ? ['vessel-points'] :
  activeView === 'city' ? ['drone-points'] :
  []
}
```

**Step 3: Update handleMapClick to handle drone clicks**

In the `handleMapClick` callback, add a drone handler before the vessel handler:

```typescript
  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return

    if (feature.layer?.id === 'drone-points') {
      const p = feature.properties as Record<string, unknown>
      const drone: DroneFlight = {
        id:            String(p.id ?? ''),
        sensorId:      String(p.sensorId ?? ''),
        lat:           event.lngLat.lat,
        lng:           event.lngLat.lng,
        altitude:      Number(p.altitude ?? 0),
        speed:         Number(p.speed ?? 0),
        verticalSpeed: Number(p.verticalSpeed ?? 0),
        heading:       Number(p.heading ?? 0),
        state:         String(p.state ?? 'unknown'),
        timestamp:     Number(p.timestamp ?? 0),
      }
      setSelectedEntity({ type: 'drone', data: drone })
      setPanelVisible('entity', true)
      return
    }

    if (feature.layer?.id !== 'vessel-points') return
    // ... existing vessel click code unchanged
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/MapCanvas/index.tsx
git commit -m "feat: add drone click handler to MapCanvas"
```

---

### Task 10: Add DroneDetail to EntityPanel

**Files:**
- Modify: `src/components/panels/EntityPanel/index.tsx`

**Step 1: Import DroneFlight type**

Add `DroneFlight` to the type import:

```typescript
import type { GlobalIncident, CityPOI, CyberNode, Satellite, AISVessel, DroneFlight, Severity } from '../../../types'
```

**Step 2: Add DroneDetail component**

Add before the `EntityPanel` export function:

```typescript
function DroneDetail({ data }: { data: DroneFlight }) {
  const isAirborne = data.state === 'airborne' || data.altitude > 5
  const badge = isAirborne ? SEVERITY_BG.medium : SEVERITY_BG.nominal
  const badgeLabel = isAirborne ? 'AIRBORNE' : 'GROUNDED'
  const speedMs = data.speed.toFixed(1)

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        UAS {badgeLabel} — {data.state.toUpperCase()}
      </div>
      <DataRow label="OP ID"     value={data.id} />
      <DataRow label="SENSOR"    value={data.sensorId} />
      <DataRow label="LAT/LNG"   value={`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`} />
      <DataRow label="ALTITUDE"  value={`${Math.round(data.altitude)} m MSL`} />
      <DataRow label="HEADING"   value={`${Math.round(data.heading)}°`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${data.speed > 20 ? 'text-hud-red' : data.speed > 10 ? 'text-hud-amber' : 'text-hud-text'}`}>
          {speedMs} m/s
        </span>
      </div>
      {data.verticalSpeed !== 0 && (
        <DataRow label="V/S" value={`${data.verticalSpeed > 0 ? '+' : ''}${data.verticalSpeed.toFixed(1)} m/s`} />
      )}
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
    </div>
  )
}
```

**Step 3: Add the drone render branch in EntityPanel**

Inside the entity render block, add after the vessel line:

```tsx
              {selectedEntity.type === 'drone' && <DroneDetail data={selectedEntity.data as DroneFlight} />}
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/panels/EntityPanel/index.tsx
git commit -m "feat: add DroneDetail to EntityPanel"
```

---

### Task 11: Create CityLayerToggles component

**Files:**
- Create: `src/views/city/CityLayerToggles.tsx`

**Step 1: Write the toggle component**

```typescript
// src/views/city/CityLayerToggles.tsx
import { useHUDStore } from '../../store'
import type { CityLayer } from '../../types'

const LAYERS: { key: CityLayer; label: string; color: string }[] = [
  { key: 'uas', label: 'UAS', color: '#7b2fff' },
]

export function CityLayerToggles() {
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const toggleCityLayer = useHUDStore((s) => s.toggleCityLayer)

  return (
    <div className="fixed bottom-16 right-4 z-40 flex gap-2">
      {LAYERS.map(({ key, label, color }) => {
        const active = cityLayers.has(key)
        return (
          <button
            key={key}
            onClick={() => toggleCityLayer(key)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[10px] tracking-widest border transition-all"
            style={{
              borderColor: active ? color : '#4a6080',
              color:       active ? color : '#4a6080',
              backgroundColor: active ? `${color}15` : 'transparent',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ backgroundColor: active ? color : '#4a6080' }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/views/city/CityLayerToggles.tsx
git commit -m "feat: add CityLayerToggles component"
```

---

### Task 12: Wire CityLayerToggles into App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Import CityLayerToggles**

Add to imports:

```typescript
import { CityLayerToggles } from './views/city/CityLayerToggles'
```

**Step 2: Render it when in city view with a selected city**

Add after the `{activeView === 'global' && <LayerToggles />}` line:

```tsx
      {activeView === 'city' && selectedCity && <CityLayerToggles />}
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire CityLayerToggles into App"
```

---

### Task 13: End-to-end verification

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Verify backend**

Open browser or curl: `http://localhost:3001/api/drones/viewport?minLng=-74.1&minLat=40.6&maxLng=-73.9&maxLat=40.8`

Expected: JSON array (empty `[]` is fine if no drones are in NYC airspace; confirms route works)

**Step 3: Verify frontend**

1. Open `http://localhost:5173`
2. Switch to city view (press `2`)
3. Click "New York City" pin to fly in
4. Confirm purple "UAS" toggle appears at bottom-right
5. Toggle UAS on/off — no console errors
6. If drones are present, purple dots should appear on map
7. Click a drone dot — EntityPanel should show DroneDetail with UAS AIRBORNE/GROUNDED badge

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete UAS awareness layer integration"
```
