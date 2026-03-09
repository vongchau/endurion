# Vessel Click — Entity Details Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Click any vessel on the global map to open its details in the EntityPanel.

**Architecture:** A new Mapbox `circle` GL layer renders all vessels as WebGL points (handles 50k). `interactiveLayerIds` on the `<Map>` component causes `onClick` to populate `event.features` when a vessel point is hit. `MapCanvas` dispatches the clicked vessel to the Zustand store as a `'vessel'` entity. `EntityPanel` renders a new `VesselDetail` view.

**Tech Stack:** React 18, TypeScript, react-map-gl/mapbox, Zustand, Hono, Vitest. No new dependencies.

---

### Task 1: Add `getAllVessels()` to `server/aisCache.ts`

**Files:**
- Modify: `server/aisCache.ts`
- Modify: `server/aisCache.test.ts`

**Context:** `vesselCache` is a `Map<number, AISVessel>`. `getAllVessels()` returns all cached vessels sorted by timestamp descending, capped at 5,000. This cap prevents sending tens of thousands of features to the browser on every poll.

**Step 1: Add failing test**

In `server/aisCache.test.ts`, add inside `describe('processVesselMessage', ...)`:

```ts
it('getAllVessels returns all processed vessels', () => {
  processVesselMessage(1, 10, 20, 70, 'CARGO A', 12, 90, 90)
  processVesselMessage(2, 11, 21, 80, 'TANKER B', 8, 45, 45)
  const all = getAllVessels()
  expect(all).toHaveLength(2)
  expect(all.some(v => v.mmsi === 1)).toBe(true)
})
```

Also add `getAllVessels` to the import at the top of the test file.

**Step 2: Run to verify it fails**

Run: `npx vitest run server/aisCache.test.ts 2>&1 | tail -8`
Expected: FAIL — `getAllVessels` not exported

**Step 3: Implement in `server/aisCache.ts`**

Add after `getStats()`:

```ts
export function getAllVessels(): AISVessel[] {
  return Array.from(vesselCache.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5_000)
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run server/aisCache.test.ts 2>&1 | tail -8`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add server/aisCache.ts server/aisCache.test.ts
git commit -m "feat: add getAllVessels() to aisCache"
```

---

### Task 2: Add `/api/vessels/all` route

**Files:**
- Modify: `server/index.ts`

**Context:** One new route. Add it alongside the other `/api/vessels/*` routes. Import `getAllVessels` from the existing `aisCache` import line.

**Step 1: Update import**

In `server/index.ts`, change:
```ts
// BEFORE
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats } from './aisCache'

// AFTER
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats, getAllVessels } from './aisCache'
```

**Step 2: Add route**

After the existing vessel routes, add:
```ts
app.get('/api/vessels/all', (c) => c.json(getAllVessels()))
```

**Step 3: Smoke test**

Run the server (`npm run dev`) and hit the endpoint:
```bash
curl -s http://localhost:3001/api/vessels/all | head -c 200
```
Expected: JSON array (may be `[]` if no AIS data yet, or array of vessel objects)

**Step 4: Verify no regressions**

Run: `npx vitest run 2>&1 | tail -8`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/vessels/all route"
```

---

### Task 3: Add `'vessel'` to `Entity` type

**Files:**
- Modify: `src/types/index.ts`

**Context:** `Entity` is currently `type: 'incident' | 'poi' | 'node' | 'satellite'`. Adding `'vessel'` with `AISVessel` data. This is a pure type change — no logic.

**Step 1: Update `Entity`**

In `src/types/index.ts`, change:
```ts
// BEFORE
export interface Entity {
  type: 'incident' | 'poi' | 'node' | 'satellite'
  data: GlobalIncident | CityPOI | CyberNode | Satellite
}

// AFTER
export interface Entity {
  type: 'incident' | 'poi' | 'node' | 'satellite' | 'vessel'
  data: GlobalIncident | CityPOI | CyberNode | Satellite | AISVessel
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add vessel to Entity type"
```

---

### Task 4: Create `useAllVessels` hook — TDD

**Files:**
- Create: `src/hooks/useAllVessels.ts`
- Create: `src/hooks/useAllVessels.test.ts`

**Context:** Polls `/api/vessels/all` every 10 seconds. Returns `{ vessels, loading }`. Identical pattern to `useVessels.ts` — one endpoint, no parallel fetch.

**Step 1: Write failing test**

```ts
// src/hooks/useAllVessels.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAllVessels } from './useAllVessels'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

const mockVessels = [
  { mmsi: 1, name: 'TEST', lat: 10, lng: 20, speed: 5, heading: 90,
    shipType: 70, shipTypeName: 'Cargo', timestamp: Date.now() },
]

describe('useAllVessels', () => {
  it('starts with loading true and empty vessels', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAllVessels())
    expect(result.current.loading).toBe(true)
    expect(result.current.vessels).toEqual([])
  })

  it('populates vessels after fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mockVessels } as Response)
    const { result } = renderHook(() => useAllVessels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.vessels).toHaveLength(1)
    expect(result.current.vessels[0].mmsi).toBe(1)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useAllVessels.test.ts 2>&1 | tail -6`
Expected: FAIL — module not found

**Step 3: Implement**

```ts
// src/hooks/useAllVessels.ts
import { useState, useEffect } from 'react'
import type { AISVessel } from '../types'

export function useAllVessels() {
  const [vessels, setVessels] = useState<AISVessel[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/vessels/all')
      if (res.ok) setVessels(await res.json())
    } catch (e) {
      console.error('[useAllVessels]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => clearInterval(id)
  }, [])

  return { vessels, loading }
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useAllVessels.test.ts 2>&1 | tail -6`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/hooks/useAllVessels.ts src/hooks/useAllVessels.test.ts
git commit -m "feat: add useAllVessels hook"
```

---

### Task 5: Create `VesselLayer` — Mapbox circle layer

**Files:**
- Create: `src/views/global/VesselLayer.tsx`

**Context:** Renders all vessels as a Mapbox GL `circle` layer (WebGL — not DOM `<Marker>` elements). All vessel fields are stored as GeoJSON `properties` so `queryRenderedFeatures` can reconstruct the `AISVessel` object on click. The layer id `'vessel-points'` is used in Task 6 to set `interactiveLayerIds`.

Military candidates (type 35/55 or naval prefix) get a larger, brighter green circle. All others get a small cyan dot.

**Step 1: Implement**

```tsx
// src/views/global/VesselLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { AISVessel } from '../../types'

interface VesselLayerProps {
  vessels: AISVessel[]
}

export function VesselLayer({ vessels }: VesselLayerProps) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: vessels.map((v) => ({
      type: 'Feature' as const,
      properties: {
        mmsi:         v.mmsi,
        name:         v.name,
        speed:        v.speed,
        heading:      v.heading,
        shipType:     v.shipType,
        shipTypeName: v.shipTypeName,
        timestamp:    v.timestamp,
        isMilitary:   v.shipType === 35 || v.shipType === 55,
      },
      geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] },
    })),
  }

  return (
    <Source id="vessel-all" type="geojson" data={geojson}>
      <Layer
        id="vessel-points"
        type="circle"
        paint={{
          'circle-radius': [
            'case', ['get', 'isMilitary'], 5, 3,
          ],
          'circle-color': [
            'case', ['get', 'isMilitary'], '#00ff88', '#00d4ff',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-width': ['case', ['get', 'isMilitary'], 1, 0],
          'circle-stroke-color': '#00ff88',
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
git add src/views/global/VesselLayer.tsx
git commit -m "feat: add VesselLayer Mapbox circle layer"
```

---

### Task 6: Wire `VesselLayer` into `GlobalMarkers`

**Files:**
- Modify: `src/views/global/GlobalMarkers.tsx`

**Context:** Import `useAllVessels` and `VesselLayer`. Render `VesselLayer` when maritime layer is active, alongside the existing `VesselDensityLayer`. The existing `VesselMarker` (green arrows for military) can stay — `VesselLayer` circles will overlap them but they serve different roles (circles = clickable, arrows = directional).

**Step 1: Add imports**

```ts
import { useAllVessels } from '../../hooks/useAllVessels'
import { VesselLayer } from './VesselLayer'
```

**Step 2: Add hook call inside `GlobalMarkers()`**

```ts
const { vessels } = useAllVessels()
```

**Step 3: Add to JSX, after `VesselDensityLayer`**

```tsx
{showMaritime && <VesselLayer vessels={vessels} />}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 5: Commit**

```bash
git add src/views/global/GlobalMarkers.tsx
git commit -m "feat: render VesselLayer circle points in GlobalMarkers"
```

---

### Task 7: Wire vessel click in `MapCanvas`

**Files:**
- Modify: `src/components/MapCanvas/index.tsx`

**Context:** `react-map-gl`'s `<Map>` has two props that work together for layer clicks:
- `interactiveLayerIds`: array of layer IDs where mouse events populate `event.features`
- `onClick`: `(event: MapLayerMouseEvent) => void`

When the user clicks a point on the `'vessel-points'` layer, `event.features[0].properties` contains all the vessel fields stored in Task 5. We reconstruct the `AISVessel` and dispatch it to the store.

**Step 1: Add imports to `MapCanvas/index.tsx`**

```ts
import type { MapLayerMouseEvent } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import type { AISVessel } from '../../types'
```

**Step 2: Add store hooks inside `MapCanvas()`**

```ts
const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
const setPanelVisible   = useHUDStore((s) => s.setPanelVisible)
```

**Step 3: Add click handler inside `MapCanvas()`**

```ts
const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
  const feature = event.features?.[0]
  if (!feature || feature.layer?.id !== 'vessel-points') return
  const p = feature.properties as Record<string, unknown>
  const vessel: AISVessel = {
    mmsi:         Number(p.mmsi),
    name:         String(p.name ?? ''),
    lat:          event.lngLat.lat,
    lng:          event.lngLat.lng,
    speed:        Number(p.speed ?? 0),
    heading:      Number(p.heading ?? 0),
    shipType:     Number(p.shipType ?? 0),
    shipTypeName: String(p.shipTypeName ?? ''),
    timestamp:    Number(p.timestamp ?? 0),
  }
  setSelectedEntity({ type: 'vessel', data: vessel })
  setPanelVisible('entity', true)
}, [setSelectedEntity, setPanelVisible])
```

**Step 4: Add `onClick` and `interactiveLayerIds` to `<Map>`**

```tsx
<Map
  ref={mapRef}
  key={activeView}
  mapboxAccessToken={MAPBOX_TOKEN}
  mapStyle={config.mapStyle}
  initialViewState={config.initialViewState}
  onLoad={handleMapLoad}
  onClick={handleMapClick}
  interactiveLayerIds={activeView === 'global' ? ['vessel-points'] : []}
  projection={activeView === 'global' || activeView === 'space' ? 'globe' : 'mercator'}
  style={{ width: '100%', height: '100%' }}
  attributionControl={false}
>
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 6: Commit**

```bash
git add src/components/MapCanvas/index.tsx
git commit -m "feat: wire vessel click handler in MapCanvas"
```

---

### Task 8: Add `VesselDetail` to `EntityPanel`

**Files:**
- Modify: `src/components/panels/EntityPanel/index.tsx`

**Context:** Add a `VesselDetail` component matching the style of `IncidentDetail`, `POIDetail`, etc. Then add a `type === 'vessel'` branch in the render. Military vessels (type 35/55 or name prefix) get a green HIGH badge; all others get a nominal/low badge.

**Step 1: Add import**

```ts
import type { GlobalIncident, CityPOI, CyberNode, Satellite, AISVessel, Severity } from '../../../types'
```

**Step 2: Add `VesselDetail` component before `EntityPanel`**

```tsx
function VesselDetail({ data }: { data: AISVessel }) {
  const isMilitary = data.shipType === 35 || data.shipType === 55
  const badge = isMilitary ? SEVERITY_BG.high : SEVERITY_BG.nominal
  const badgeLabel = isMilitary ? 'MILITARY' : data.shipTypeName.toUpperCase()
  const speedColor = data.speed > 20 ? 'text-hud-red' : data.speed > 10 ? 'text-hud-amber' : 'text-hud-green'

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {badgeLabel} — MMSI {data.mmsi}
      </div>
      <DataRow label="NAME"      value={data.name || '—'} />
      <DataRow label="TYPE"      value={`${data.shipTypeName} (${data.shipType})`} />
      <DataRow label="LAT/LNG"   value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="HEADING"   value={`${data.heading}°`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${speedColor}`}>{data.speed.toFixed(1)} kn</span>
      </div>
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
    </div>
  )
}
```

**Step 3: Add vessel branch to render**

In `EntityPanel`, inside the `<div className="flex-1 overflow-y-auto">` block, add:

```tsx
{selectedEntity.type === 'vessel' && <VesselDetail data={selectedEntity.data as AISVessel} />}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 5: Commit**

```bash
git add src/components/panels/EntityPanel/index.tsx
git commit -m "feat: add VesselDetail to EntityPanel"
```

---

### Task 9: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`
Expected: all tests pass — count higher than before (new `useAllVessels` tests)

**Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

**Step 3: Lint**

Run: `npm run lint 2>&1 | grep -E "useAllVessels|VesselLayer|VesselDetail|MapCanvas" | head -10`
Expected: no errors from new files

**Step 4: Manual smoke test**

- Run `npm run dev`
- Switch to Global view, enable MARITIME layer
- Wait ~30s for vessels to populate (cyan dots appear on the map)
- Click a cyan dot — EntityPanel slides open on the right showing vessel name, MMSI, type, heading, speed, position
- Military vessels (green, type 35/55) show a green HIGH badge
- Civilian vessels show a NOMINAL badge with ship type name

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix any lint/type issues from vessel click feature"
```
