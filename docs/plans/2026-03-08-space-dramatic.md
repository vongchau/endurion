# Space View — Mission Control Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three dramatic mission-control overlays to the space view: ISS ground track (predicted 90-min orbit path), orbital shell rings (SVG overlays at ISS + Starlink altitudes), and a live ISS telemetry ticker panel that updates every second.

**Architecture:** `useSatellites` gains a `computeGroundTrack` function (90 propagations at 1-min intervals, antimeridian-split into segments) and exposes `issRec` so consumers can run their own compute loops. `SpaceLayer` renders the track as a Mapbox `line` layer. `OrbitalRings` is a fixed SVG overlay (screen-space, not geo-space). `IssTelemetryPanel` uses `issRec` with a 1-second `setInterval` to display live lat/lng/altitude/velocity. All three are gated to `activeView === 'space'` in `MapCanvas`.

**Tech Stack:** React 18, TypeScript, Vite, react-map-gl/mapbox, satellite.js, Zustand, Tailwind CSS v4, Vitest

---

### Task 1: Extend useSatellites — ground track + issRec

**Files:**
- Modify: `src/views/space/useSatellites.ts`

**Step 1: Add `computeGroundTrack` and `buildGroundTrackGeoJSON` after the existing `buildGeoJSON` function**

The ground track computes 90 future ISS positions (one per minute). When longitude jumps more than 180° between consecutive points the satellite has crossed the antimeridian, so we start a new segment — otherwise Mapbox draws a line straight across the globe.

```ts
export function computeGroundTrack(satrec: satellite.SatRec): [number, number][][] {
  const segments: [number, number][][] = []
  let segment: [number, number][] = []
  let prevLng: number | null = null

  for (let i = 0; i <= 90; i++) {
    const t = new Date(Date.now() + i * 60 * 1000)
    const gmst = satellite.gstime(t)
    const pv = satellite.propagate(satrec, t)
    if (!pv || !pv.position || typeof pv.position === 'boolean') continue

    const geodetic = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst)
    const lat = satellite.degreesLat(geodetic.latitude)
    const lng = satellite.degreesLong(geodetic.longitude)

    if (prevLng !== null && Math.abs(lng - prevLng) > 180) {
      if (segment.length > 1) segments.push(segment)
      segment = []
    }

    segment.push([lng, lat])
    prevLng = lng
  }

  if (segment.length > 1) segments.push(segment)
  return segments
}

export function buildGroundTrackGeoJSON(segments: [number, number][][]) {
  return {
    type: 'FeatureCollection' as const,
    features: segments.map(coords => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: coords },
    })),
  }
}
```

**Step 2: Update the `UseSatellitesReturn` interface and hook return**

Replace the existing interface and the `return` statement at the bottom of `useSatellites`:

```ts
interface UseSatellitesReturn {
  satellites: Satellite[]
  iss: Satellite | null
  issRec: satellite.SatRec | null
  geojson: ReturnType<typeof buildGeoJSON>
  groundTrack: ReturnType<typeof buildGroundTrackGeoJSON>
  loading: boolean
  usingMockData: boolean
}
```

Add `issRec` state and ground track computation — replace the three lines at the bottom of the hook body (`const iss = ...`, `const geojson = ...`, `return { ... }`):

```ts
  const issEntry = entries.find(e => e.type === 'iss') ?? null
  const iss = positions.find(s => s.type === 'iss') ?? null
  const geojson = buildGeoJSON(positions)
  const groundTrack = issEntry
    ? buildGroundTrackGeoJSON(computeGroundTrack(issEntry.satrec))
    : buildGroundTrackGeoJSON([])

  return { satellites: positions, iss, issRec: issEntry?.satrec ?? null, geojson, groundTrack, loading, usingMockData }
```

**Step 3: Write a unit test for `computeGroundTrack` and `buildGroundTrackGeoJSON`**

Create `src/views/space/useSatellites.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildGroundTrackGeoJSON } from './useSatellites'

describe('buildGroundTrackGeoJSON', () => {
  it('returns a FeatureCollection with one LineString per segment', () => {
    const segments: [number, number][][] = [
      [[0, 0], [10, 5], [20, 10]],
      [[170, 20], [180, 25]],
    ]
    const result = buildGroundTrackGeoJSON(segments)
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(2)
    expect(result.features[0].geometry.type).toBe('LineString')
    expect(result.features[0].geometry.coordinates).toEqual([[0, 0], [10, 5], [20, 10]])
  })

  it('returns empty FeatureCollection for no segments', () => {
    const result = buildGroundTrackGeoJSON([])
    expect(result.features).toHaveLength(0)
  })
})
```

**Step 4: Run the tests**

```bash
npx vitest run src/views/space/useSatellites.test.ts 2>&1 | tail -8
```

Expected: 2 tests passing.

**Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "useSatellites"
```

Expected: no errors.

**Step 6: Commit**

```bash
git add src/views/space/useSatellites.ts src/views/space/useSatellites.test.ts
git commit -m "feat: add ground track computation and issRec to useSatellites"
```

---

### Task 2: Add ground track line to SpaceLayer

**Files:**
- Modify: `src/views/space/SpaceLayer.tsx`

**Step 1: Import `LineLayerSpecification` and `buildGroundTrackGeoJSON`**

Replace the existing import block at the top of the file:

```tsx
import { useEffect, useCallback } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { CircleLayerSpecification, LineLayerSpecification, MapMouseEvent } from 'mapbox-gl'
import { useHUDStore } from '../../store'
import { useSatellites } from './useSatellites'
import type { Satellite } from '../../types'
```

**Step 2: Add the ground track layer spec after the existing `HIT_LAYER` constant**

```tsx
const GROUND_TRACK_LAYER: LineLayerSpecification = {
  id: 'ground-track',
  type: 'line',
  source: 'ground-track',
  paint: {
    'line-color': '#00d4ff',
    'line-width': 1.5,
    'line-opacity': 0.3,
    'line-dasharray': [4, 3],
  },
}
```

**Step 3: Destructure `groundTrack` from `useSatellites` in the `SpaceLayer` component**

Change the existing destructure line:

```tsx
  const { iss, geojson, groundTrack, loading, usingMockData } = useSatellites()
```

**Step 4: Add the ground track `<Source>` + `<Layer>` to the JSX return, after the satellites Source block**

```tsx
      <Source id="ground-track" type="geojson" data={groundTrack}>
        <Layer {...GROUND_TRACK_LAYER} />
      </Source>
```

**Step 5: Build to verify**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built`

**Step 6: Commit**

```bash
git add src/views/space/SpaceLayer.tsx
git commit -m "feat: render ISS ground track as dashed line on globe"
```

---

### Task 3: Create OrbitalRings component

**Files:**
- Create: `src/views/space/OrbitalRings.tsx`

**Step 1: Create the component**

Two SVG ellipses centered on the viewport — screen-space, not geo-space. The ellipses are slightly wider than tall because the globe projection squashes the vertical axis. Labels sit at the right edge of each ring.

```tsx
// src/views/space/OrbitalRings.tsx

export function OrbitalRings() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-10"
      style={{ overflow: 'hidden' }}
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', inset: 0 }}
      >
        {/* ISS shell — 408 km */}
        <ellipse
          cx="50%"
          cy="50%"
          rx="37%"
          ry="34%"
          fill="none"
          stroke="#00d4ff"
          strokeOpacity="0.14"
          strokeWidth="1"
          strokeDasharray="6 4"
        />
        {/* Starlink shell — 550 km */}
        <ellipse
          cx="50%"
          cy="50%"
          rx="42%"
          ry="39%"
          fill="none"
          stroke="#7b2fff"
          strokeOpacity="0.12"
          strokeWidth="1"
          strokeDasharray="6 4"
        />

        {/* ISS label — right edge of inner ring */}
        <text
          x="87%"
          y="50%"
          fill="#00d4ff"
          fillOpacity="0.45"
          fontSize="9"
          fontFamily="monospace"
          dominantBaseline="middle"
          dx="6"
        >
          ISS · 408 km
        </text>

        {/* Starlink label — right edge of outer ring */}
        <text
          x="92%"
          y="51.5%"
          fill="#7b2fff"
          fillOpacity="0.40"
          fontSize="9"
          fontFamily="monospace"
          dominantBaseline="middle"
          dx="6"
        >
          STARLINK · 550 km
        </text>
      </svg>
    </div>
  )
}
```

**Step 2: Build to verify**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built`

**Step 3: Commit**

```bash
git add src/views/space/OrbitalRings.tsx
git commit -m "feat: add OrbitalRings SVG overlay for ISS and Starlink shells"
```

---

### Task 4: Create IssTelemetryPanel

**Files:**
- Create: `src/views/space/IssTelemetryPanel.tsx`

**Step 1: Create the component**

Calls `useSatellites()` to get `issRec`, then runs its own 1-second interval to compute the current ISS position with higher time resolution than the 5s hook. Renders as a horizontal strip just below the StatusBar.

```tsx
// src/views/space/IssTelemetryPanel.tsx
import { useState, useEffect, useRef } from 'react'
import * as satellite from 'satellite.js'
import { motion, AnimatePresence } from 'framer-motion'
import { useSatellites } from './useSatellites'

interface TelemetryState {
  lat: number
  lng: number
  altitude: number
  velocity: number
}

function TelemetryField({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 border-r border-hud-cyan/10 last:border-r-0">
      <span className="font-mono text-[9px] text-hud-dim tracking-widest">{label}</span>
      <span className="font-mono text-xs text-hud-cyan tabular-nums">
        {value}
        {unit && <span className="text-hud-dim text-[9px] ml-0.5">{unit}</span>}
      </span>
    </div>
  )
}

export function IssTelemetryPanel() {
  const { issRec, loading } = useSatellites()
  const [telem, setTelem] = useState<TelemetryState | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (!issRec) return

    const compute = () => {
      const now = new Date()
      const gmst = satellite.gstime(now)
      const pv = satellite.propagate(issRec, now)
      if (!pv || !pv.position || typeof pv.position === 'boolean') return
      if (!pv.velocity || typeof pv.velocity === 'boolean') return

      const pos = pv.position as satellite.EciVec3<number>
      const vel = pv.velocity as satellite.EciVec3<number>
      const geo = satellite.eciToGeodetic(pos, gmst)

      setTelem({
        lat: satellite.degreesLat(geo.latitude),
        lng: satellite.degreesLong(geo.longitude),
        altitude: Math.round(geo.height),
        velocity: Math.round(Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2) * 100) / 100,
      })
    }

    compute()
    intervalRef.current = setInterval(compute, 1000)
    return () => clearInterval(intervalRef.current)
  }, [issRec])

  const show = !loading && telem !== null

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed top-12 left-1/2 -translate-x-1/2 z-40 flex items-center rounded-b border border-t-0 border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md px-2 py-1"
          style={{ pointerEvents: 'none' }}
        >
          <span className="font-mono text-[9px] text-hud-amber tracking-widest pr-4 border-r border-hud-cyan/10 mr-2">
            ISS
          </span>
          <TelemetryField label="ALT" value={String(telem!.altitude)} unit="km" />
          <TelemetryField label="VEL" value={String(telem!.velocity)} unit="km/s" />
          <TelemetryField
            label="LAT"
            value={`${telem!.lat >= 0 ? '+' : ''}${telem!.lat.toFixed(3)}°`}
          />
          <TelemetryField
            label="LNG"
            value={`${telem!.lng >= 0 ? '+' : ''}${telem!.lng.toFixed(3)}°`}
          />
          <TelemetryField label="PERIOD" value="92:09" unit="min" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Step 2: Build to verify**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built`

**Step 3: Commit**

```bash
git add src/views/space/IssTelemetryPanel.tsx
git commit -m "feat: add IssTelemetryPanel with 1s ISS position ticker"
```

---

### Task 5: Wire OrbitalRings and IssTelemetryPanel into MapCanvas

**Files:**
- Modify: `src/components/MapCanvas/index.tsx`

**Step 1: Add imports**

Add the two new imports after the existing `SpaceLayer` import:

```tsx
import { OrbitalRings } from '../../views/space/OrbitalRings'
import { IssTelemetryPanel } from '../../views/space/IssTelemetryPanel'
```

**Step 2: Render both components outside the `<Map>` element, after the closing `</Map>` tag**

They are fixed overlays, not Mapbox children:

```tsx
      {activeView === 'space' && <OrbitalRings />}
      {activeView === 'space' && <IssTelemetryPanel />}
```

The full updated `return` in `MapCanvas` should look like:

```tsx
  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        key={activeView}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={config.mapStyle}
        initialViewState={config.initialViewState}
        onLoad={handleMapLoad}
        projection={activeView === 'global' || activeView === 'space' ? 'globe' : 'mercator'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {activeView === 'global' && <GlobalMarkers />}
        {activeView === 'city' && <CityMarkers />}
        {activeView === 'cyber' && <CyberLayer />}
        {activeView === 'space' && <SpaceLayer />}
      </Map>
      {activeView === 'space' && <OrbitalRings />}
      {activeView === 'space' && <IssTelemetryPanel />}
    </div>
  )
```

**Step 3: Full build + tests**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
npx vitest run 2>&1 | tail -6
```

Expected: `✓ built` and all tests passing (at least 6 now).

**Step 4: Final commit**

```bash
git add src/components/MapCanvas/index.tsx
git commit -m "feat: wire OrbitalRings and IssTelemetryPanel into space view"
```

---

## Summary

| Task | What it builds |
|---|---|
| 1 | `computeGroundTrack` + `buildGroundTrackGeoJSON` in useSatellites; exposes `issRec` |
| 2 | Dashed cyan ground track line layer on the globe via SpaceLayer |
| 3 | `OrbitalRings` — fixed SVG ellipses for ISS (408 km, cyan) and Starlink (550 km, purple) shells |
| 4 | `IssTelemetryPanel` — 1s-ticking alt/vel/lat/lng strip below StatusBar |
| 5 | Wire both overlays into MapCanvas outside the Mapbox `<Map>` |
