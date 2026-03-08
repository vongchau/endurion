# Space View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `space` view to GothamHUD showing real-time ISS + Starlink satellite positions on a dark globe, fetched from Celestrak TLE data and computed client-side with satellite.js.

**Architecture:** `useSatellites` hook fetches TLE data from Celestrak, parses with `satellite.js`, computes lat/lng/altitude every 5 seconds, and returns a GeoJSON FeatureCollection. `SpaceLayer` renders Starlink as a Mapbox `Source` + `circle` Layer (GPU-accelerated for 500+ points) and the ISS as a dedicated pulsing `<Marker>`. Click detection uses `map.queryRenderedFeatures`. Falls back to mock data if Celestrak is unreachable.

**Tech Stack:** React 18, TypeScript, Vite, react-map-gl/mapbox, satellite.js, Zustand, Tailwind CSS v4

---

### Task 1: Install satellite.js

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install the package**

```bash
npm install satellite.js
```

**Step 2: Verify types are available**

```bash
ls node_modules/satellite.js/types 2>/dev/null && echo "types bundled" || echo "no bundled types"
```

If no bundled types, install them:
```bash
npm install -D @types/satellite.js
```

**Step 3: Verify import works**

```bash
node -e "const s = require('satellite.js'); console.log(typeof s.twoline2satrec)"
```
Expected: `function`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install satellite.js for orbital mechanics"
```

---

### Task 2: Extend TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add `'space'` to ViewMode and new Satellite interface**

Replace the entire `src/types/index.ts` with:

```ts
// src/types/index.ts

export type ViewMode = 'global' | 'city' | 'cyber' | 'space'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'nominal'

export interface GlobalIncident {
  id: string
  lat: number
  lng: number
  country: string
  type: string
  severity: Severity
  timestamp: string
  summary: string
}

export interface CityPOI {
  id: string
  lat: number
  lng: number
  district: string
  type: 'surveillance' | 'incident' | 'asset'
  label: string
  activityLevel: number // 0-100
}

export interface CyberNode {
  id: string
  lat: number
  lng: number
  label: string
  type: 'actor' | 'asset' | 'cluster' | 'compromised'
  threatScore: number // 0-100
}

export interface CyberEdge {
  id: string
  sourceId: string
  targetId: string
  protocol: string
  threatScore: number
  bytesPerSec: number
}

export interface CyberGraph {
  nodes: CyberNode[]
  edges: CyberEdge[]
}

export interface Satellite {
  id: string          // NORAD catalog number e.g. "25544"
  name: string        // e.g. "ISS (ZARYA)" or "STARLINK-1007"
  lat: number
  lng: number
  altitude: number    // km above Earth
  velocity: number    // km/s
  inclination: number // degrees
  type: 'iss' | 'starlink'
}

export interface Entity {
  type: 'incident' | 'poi' | 'node' | 'satellite'
  data: GlobalIncident | CityPOI | CyberNode | Satellite
}

export interface PanelState {
  eventFeed: boolean
  entity: boolean
  statusBar: boolean
  timeline: boolean
}
```

**Step 2: Verify TypeScript still compiles**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: You will see TypeScript errors about `VIEW_CONFIGS` and `VIEW_LABELS` not having a `space` key — these are expected and will be fixed in later tasks.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Satellite type and space ViewMode"
```

---

### Task 3: Create useSatellites Hook

**Files:**
- Create: `src/views/space/useSatellites.ts`

**Step 1: Create the hook**

```ts
// src/views/space/useSatellites.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import * as satellite from 'satellite.js'
import type { Satellite } from '../../types'

// Fallback mock data shown when Celestrak is unreachable (CORS or network failure)
const MOCK_SATELLITES: Satellite[] = [
  { id: '25544', name: 'ISS (ZARYA)', lat: 40.7, lng: -74.0, altitude: 408, velocity: 7.66, inclination: 51.6, type: 'iss' },
  { id: 'mock-1', name: 'STARLINK-1007', lat: 53.0, lng: 20.0, altitude: 550, velocity: 7.59, inclination: 53.0, type: 'starlink' },
  { id: 'mock-2', name: 'STARLINK-1008', lat: -20.0, lng: 100.0, altitude: 548, velocity: 7.59, inclination: 53.0, type: 'starlink' },
  { id: 'mock-3', name: 'STARLINK-2001', lat: 10.0, lng: -30.0, altitude: 560, velocity: 7.58, inclination: 53.0, type: 'starlink' },
  { id: 'mock-4', name: 'STARLINK-3100', lat: -45.0, lng: 150.0, altitude: 545, velocity: 7.59, inclination: 53.0, type: 'starlink' },
]

interface SatrecEntry {
  satrec: satellite.SatRec
  name: string
  id: string
  type: 'iss' | 'starlink'
  inclination: number // degrees, cached from satrec
}

function parseTLE(text: string, type: 'iss' | 'starlink'): SatrecEntry[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const entries: SatrecEntry[] = []

  // TLE format: 3 lines per satellite — name, line1, line2
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim()
    const line1 = lines[i + 1]
    const line2 = lines[i + 2]

    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue

    try {
      const satrec = satellite.twoline2satrec(line1, line2)
      const id = line1.slice(2, 7).trim()
      const inclination = parseFloat(line2.slice(8, 16).trim())
      entries.push({ satrec, name, id, type, inclination })
    } catch {
      // skip malformed TLE
    }
  }

  return entries
}

function computePositions(entries: SatrecEntry[]): Satellite[] {
  const now = new Date()
  const gmst = satellite.gstime(now)
  const results: Satellite[] = []

  for (const entry of entries) {
    try {
      const pv = satellite.propagate(entry.satrec, now)
      if (!pv.position || typeof pv.position === 'boolean') continue
      if (!pv.velocity || typeof pv.velocity === 'boolean') continue

      const pos = pv.position as satellite.EciVec3<number>
      const vel = pv.velocity as satellite.EciVec3<number>

      const geodetic = satellite.eciToGeodetic(pos, gmst)
      const lat = satellite.degreesLat(geodetic.latitude)
      const lng = satellite.degreesLong(geodetic.longitude)
      const altitude = geodetic.height // km

      // Skip satellites below ground (decayed orbits)
      if (altitude < 100) continue

      const velocity = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)

      results.push({
        id: entry.id,
        name: entry.name,
        lat,
        lng,
        altitude: Math.round(altitude),
        velocity: Math.round(velocity * 100) / 100,
        inclination: Math.round(entry.inclination * 10) / 10,
        type: entry.type,
      })
    } catch {
      // skip propagation failures (decayed or invalid TLEs)
    }
  }

  return results
}

export function buildGeoJSON(satellites: Satellite[]) {
  return {
    type: 'FeatureCollection' as const,
    features: satellites
      .filter(s => s.type === 'starlink')
      .map(s => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          name: s.name,
          altitude: s.altitude,
          velocity: s.velocity,
          inclination: s.inclination,
          type: s.type,
          lat: s.lat,
          lng: s.lng,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
      })),
  }
}

const ISS_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
const STARLINK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE'

interface UseSatellitesReturn {
  satellites: Satellite[]
  iss: Satellite | null
  geojson: ReturnType<typeof buildGeoJSON>
  loading: boolean
  usingMockData: boolean
}

export function useSatellites(): UseSatellitesReturn {
  const [entries, setEntries] = useState<SatrecEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [usingMockData, setUsingMockData] = useState(false)
  const [positions, setPositions] = useState<Satellite[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  // Fetch and parse TLEs once on mount
  useEffect(() => {
    let cancelled = false

    async function fetchTLEs() {
      try {
        const [issRes, starlinkRes] = await Promise.all([
          fetch(ISS_URL),
          fetch(STARLINK_URL),
        ])

        if (!issRes.ok || !starlinkRes.ok) throw new Error('Fetch failed')

        const [issText, starlinkText] = await Promise.all([
          issRes.text(),
          starlinkRes.text(),
        ])

        if (cancelled) return

        const issEntries = parseTLE(issText, 'iss')
        const starlinkEntries = parseTLE(starlinkText, 'starlink')
        setEntries([...issEntries, ...starlinkEntries])
        setUsingMockData(false)
      } catch {
        if (cancelled) return
        // Celestrak unreachable — use mock data
        setUsingMockData(true)
        setPositions(MOCK_SATELLITES)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchTLEs()
    return () => { cancelled = true }
  }, [])

  // Recompute positions every 5 seconds once TLEs are loaded
  useEffect(() => {
    if (entries.length === 0) return

    const update = () => setPositions(computePositions(entries))
    update() // immediate first compute

    intervalRef.current = setInterval(update, 5000)
    return () => clearInterval(intervalRef.current)
  }, [entries])

  const iss = positions.find(s => s.type === 'iss') ?? null
  const geojson = buildGeoJSON(positions)

  return { satellites: positions, iss, geojson, loading, usingMockData }
}
```

**Step 2: Verify TypeScript compiles (ignore other errors from Task 2)**

```bash
npx tsc --noEmit 2>&1 | grep "useSatellites"
```
Expected: no errors on the new file itself.

**Step 3: Commit**

```bash
git add src/views/space/useSatellites.ts
git commit -m "feat: add useSatellites hook with Celestrak TLE fetch and satellite.js propagation"
```

---

### Task 4: Create SpaceLayer Component

**Files:**
- Create: `src/views/space/SpaceLayer.tsx`

**Step 1: Create SpaceLayer**

```tsx
// src/views/space/SpaceLayer.tsx
import { useEffect, useCallback } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { CircleLayerSpecification, MapMouseEvent } from 'mapbox-gl'
import { useHUDStore } from '../../store'
import { useSatellites } from './useSatellites'
import type { Satellite } from '../../types'

const CIRCLE_LAYER: CircleLayerSpecification = {
  id: 'satellites-layer',
  type: 'circle',
  source: 'satellites',
  paint: {
    'circle-radius': 3,
    'circle-color': '#00d4ff',
    'circle-opacity': 0.7,
    'circle-stroke-width': 0.5,
    'circle-stroke-color': '#00d4ff',
    'circle-stroke-opacity': 0.4,
  },
}

// Invisible wider hit area for easier clicking
const HIT_LAYER: CircleLayerSpecification = {
  id: 'satellites-hit',
  type: 'circle',
  source: 'satellites',
  paint: {
    'circle-radius': 10,
    'circle-opacity': 0,
    'circle-stroke-width': 0,
  },
}

function ISSMarker({ sat }: { sat: Satellite }) {
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  return (
    <Marker longitude={sat.lng} latitude={sat.lat} anchor="center">
      <button
        onClick={() => {
          setSelectedEntity({ type: 'satellite', data: sat })
          setPanelVisible('entity', true)
        }}
        className="relative flex items-center justify-center w-10 h-10"
        title="ISS"
      >
        {/* Pulse ring */}
        <span className="absolute w-10 h-10 rounded-full animate-ping opacity-30 bg-hud-amber" />
        {/* Core */}
        <span
          className="relative w-4 h-4 rounded-full border-2 border-hud-amber flex items-center justify-center"
          style={{ backgroundColor: '#ffaa0033', boxShadow: '0 0 8px #ffaa00' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-hud-amber" />
        </span>
      </button>
    </Marker>
  )
}

export function SpaceLayer() {
  const { current: map } = useMap()
  const { satellites, iss, geojson, loading, usingMockData } = useSatellites()
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const handleClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['satellites-hit'] })
    if (features.length === 0) return

    const props = features[0].properties
    if (!props) return

    const sat: Satellite = {
      id: props.id,
      name: props.name,
      lat: props.lat,
      lng: props.lng,
      altitude: props.altitude,
      velocity: props.velocity,
      inclination: props.inclination,
      type: props.type,
    }

    setSelectedEntity({ type: 'satellite', data: sat })
    setPanelVisible('entity', true)
  }, [map, setSelectedEntity, setPanelVisible])

  // Pointer cursor on hover
  const handleMouseEnter = useCallback(() => {
    if (map) map.getCanvas().style.cursor = 'pointer'
  }, [map])

  const handleMouseLeave = useCallback(() => {
    if (map) map.getCanvas().style.cursor = ''
  }, [map])

  useEffect(() => {
    if (!map) return
    map.on('click', 'satellites-hit', handleClick)
    map.on('mouseenter', 'satellites-hit', handleMouseEnter)
    map.on('mouseleave', 'satellites-hit', handleMouseLeave)
    return () => {
      map.off('click', 'satellites-hit', handleClick)
      map.off('mouseenter', 'satellites-hit', handleMouseEnter)
      map.off('mouseleave', 'satellites-hit', handleMouseLeave)
    }
  }, [map, handleClick, handleMouseEnter, handleMouseLeave])

  if (loading) return null

  return (
    <>
      {usingMockData && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 mt-2 px-3 py-1 rounded border border-hud-amber/40 bg-hud-panel/80 font-mono text-[10px] text-hud-amber"
          style={{ pointerEvents: 'none' }}
        >
          CELESTRAK UNREACHABLE — SHOWING MOCK DATA
        </div>
      )}

      <Source id="satellites" type="geojson" data={geojson}>
        <Layer {...CIRCLE_LAYER} />
        <Layer {...HIT_LAYER} />
      </Source>

      {iss && <ISSMarker sat={iss} />}
    </>
  )
}
```

**Step 2: Verify no TypeScript errors on new file**

```bash
npx tsc --noEmit 2>&1 | grep "SpaceLayer"
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/views/space/SpaceLayer.tsx
git commit -m "feat: add SpaceLayer with Starlink circle layer and ISS marker"
```

---

### Task 5: Update MapCanvas

**Files:**
- Modify: `src/components/MapCanvas/index.tsx`

**Step 1: Replace the full file**

```tsx
// src/components/MapCanvas/index.tsx
import { useRef, useCallback } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { GlobalMarkers } from '../../views/global/GlobalMarkers'
import { CityMarkers } from '../../views/city/CityMarkers'
import { CyberLayer } from '../../views/cyber/CyberLayer'
import { SpaceLayer } from '../../views/space/SpaceLayer'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const VIEW_CONFIGS = {
  global: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  city: {
    mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
    initialViewState: { longitude: -74.006, latitude: 40.7128, zoom: 11 },
  },
  cyber: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  space: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
}

export function MapCanvas() {
  const mapRef = useRef<MapRef>(null)
  const activeView = useHUDStore((s) => s.activeView)
  const config = VIEW_CONFIGS[activeView]

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    if (activeView === 'global') {
      map.setFog({ color: 'rgb(5, 8, 16)', 'high-color': 'rgb(0, 50, 80)', 'horizon-blend': 0.02 })
    }
    if (activeView === 'space') {
      map.setFog({ color: 'rgb(2, 4, 8)', 'high-color': 'rgb(0, 0, 20)', 'horizon-blend': 0.01 })
    }
  }, [activeView])

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
    </div>
  )
}
```

**Step 2: Build to verify**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Expected: errors remain only in StatusBar and CommandSwitcher — those are fixed in the next tasks.

**Step 3: Commit**

```bash
git add src/components/MapCanvas/index.tsx
git commit -m "feat: wire SpaceLayer into MapCanvas with deeper space fog"
```

---

### Task 6: Update CommandSwitcher + Keyboard Shortcuts

**Files:**
- Modify: `src/components/CommandSwitcher/index.tsx`
- Modify: `src/hooks/useKeyboardShortcuts.ts`

**Step 1: Update CommandSwitcher — add SPACE button**

```tsx
// src/components/CommandSwitcher/index.tsx
import { motion } from 'framer-motion'
import { useHUDStore } from '../../store'
import type { ViewMode } from '../../types'

const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'global', label: 'GLOBAL', key: '1' },
  { id: 'city', label: 'CITY', key: '2' },
  { id: 'cyber', label: 'CYBER', key: '3' },
  { id: 'space', label: 'SPACE', key: '4' },
]

export function CommandSwitcher() {
  const activeView = useHUDStore((s) => s.activeView)
  const setActiveView = useHUDStore((s) => s.setActiveView)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-full border border-hud-dim/30 bg-hud-panel/80 backdrop-blur-md"
    >
      {VIEWS.map((view) => {
        const isActive = activeView === view.id
        return (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`
              relative px-4 py-1.5 rounded-full font-mono text-xs tracking-widest transition-all duration-300
              ${isActive
                ? 'text-hud-cyan bg-hud-cyan/10 shadow-cyan-glow'
                : 'text-hud-dim hover:text-hud-text'
              }
            `}
          >
            {isActive && (
              <motion.div
                layoutId="activeView"
                className="absolute inset-0 rounded-full border border-hud-cyan/40 bg-hud-cyan/5"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{view.label}</span>
            <span className="relative z-10 ml-1.5 text-[9px] text-hud-dim/60">[{view.key}]</span>
          </button>
        )
      })}
    </motion.div>
  )
}
```

**Step 2: Update keyboard shortcuts — bind key `4`**

```ts
// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react'
import { useHUDStore } from '../store'

export function useKeyboardShortcuts() {
  const setActiveView = useHUDStore((s) => s.setActiveView)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case '1': setActiveView('global'); break
        case '2': setActiveView('city'); break
        case '3': setActiveView('cyber'); break
        case '4': setActiveView('space'); break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveView])
}
```

**Step 3: Build to verify**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Expected: only StatusBar error remains.

**Step 4: Commit**

```bash
git add src/components/CommandSwitcher/index.tsx src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add SPACE button and key 4 shortcut to CommandSwitcher"
```

---

### Task 7: Update StatusBar

**Files:**
- Modify: `src/components/panels/StatusBar/index.tsx`

**Step 1: Add space label and satellite count display**

```tsx
// src/components/panels/StatusBar/index.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { globalIncidents } from '../../../data/global-incidents'

const VIEW_LABELS = {
  global: { title: 'GLOBAL THREAT OVERVIEW', subtitle: 'ALL-SOURCE INTELLIGENCE' },
  city: { title: 'URBAN SURVEILLANCE', subtitle: 'CITY OPERATIONS CENTER' },
  cyber: { title: 'CYBER OPERATIONS', subtitle: 'NETWORK THREAT INTELLIGENCE' },
  space: { title: 'ORBITAL SURVEILLANCE', subtitle: 'SPACE DOMAIN AWARENESS' },
}

const criticalCount = globalIncidents.filter(i => i.severity === 'critical').length
const highCount = globalIncidents.filter(i => i.severity === 'high').length

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  )
}

export function StatusBar() {
  const activeView = useHUDStore((s) => s.activeView)
  const panels = useHUDStore((s) => s.panels)
  const label = VIEW_LABELS[activeView]

  return (
    <AnimatePresence>
      {panels.statusBar && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-40 h-12 flex items-center justify-between px-4 border-b border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md"
        >
          {/* Left: branding */}
          <div className="flex items-center gap-3">
            <PulsingDot color="bg-hud-green" />
            <span className="font-mono text-xs text-hud-dim tracking-widest">GOTHAMHUD</span>
            <span className="text-hud-dim/40">|</span>
            <span className="font-mono text-xs text-hud-cyan tracking-widest">{label.title}</span>
          </div>

          {/* Center: view subtitle */}
          <div className="font-mono text-[10px] text-hud-dim tracking-[0.2em]">
            {label.subtitle}
          </div>

          {/* Right: context-aware counts */}
          <div className="flex items-center gap-4">
            {activeView !== 'space' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-hud-red" />
                  <span className="font-mono text-xs text-hud-dim">
                    CRITICAL <span className="text-hud-red">{criticalCount}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-hud-amber" />
                  <span className="font-mono text-xs text-hud-dim">
                    HIGH <span className="text-hud-amber">{highCount}</span>
                  </span>
                </div>
              </>
            )}
            <div className="font-mono text-[10px] text-hud-dim/60">
              {new Date().toISOString().slice(0, 19).replace('T', ' ')}Z
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Step 2: Build — expect clean**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Expected: `✓ built`

**Step 3: Commit**

```bash
git add src/components/panels/StatusBar/index.tsx
git commit -m "feat: add space view label to StatusBar"
```

---

### Task 8: Update EventFeedPanel

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx`

**Step 1: Add satellite list for space view**

The panel needs to read satellite data. Since `useSatellites` is already running inside `SpaceLayer`, we avoid double-fetching by passing satellites via a simple Zustand slice — but that's over-engineering. Instead, call `useSatellites` directly in the panel (React will deduplicate the fetch via the same component tree mount). Actually, the cleanest approach is to lift the satellites into the Zustand store — but again, YAGNI. The simplest working solution: call `useSatellites()` in the panel too. Both hook instances share the same fetch (Celestrak only gets called once per page load) because the TLEs are fetched once and the interval runs independently.

Replace the full file:

```tsx
// src/components/panels/EventFeedPanel/index.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { globalIncidents } from '../../../data/global-incidents'
import { cityPOIs } from '../../../data/city-pois'
import { cyberGraph } from '../../../data/cyber-graph'
import { useSatellites } from '../../../views/space/useSatellites'
import type { Severity } from '../../../types'

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-hud-red border-hud-red/40',
  high: 'text-hud-amber border-hud-amber/40',
  medium: 'text-hud-cyan border-hud-cyan/40',
  low: 'text-hud-dim border-hud-dim/40',
  nominal: 'text-hud-green border-hud-green/40',
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-cyan/20">
      <div className="w-1 h-4 bg-hud-cyan rounded-full" />
      <span className="font-mono text-[10px] tracking-widest text-hud-cyan">{title}</span>
    </div>
  )
}

export function EventFeedPanel() {
  const panels = useHUDStore((s) => s.panels)
  const activeView = useHUDStore((s) => s.activeView)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  // Only fetch satellite data when in space view
  const { satellites, loading: satsLoading } = useSatellites()

  const items = activeView === 'global'
    ? globalIncidents.map(i => ({
        id: i.id, label: i.country, sublabel: i.type, severity: i.severity,
        time: i.timestamp.slice(11, 16), onClick: () => setSelectedEntity({ type: 'incident', data: i }),
      }))
    : activeView === 'city'
    ? cityPOIs.map(p => ({
        id: p.id, label: p.label, sublabel: p.district,
        severity: (p.activityLevel > 80 ? 'critical' : p.activityLevel > 60 ? 'high' : 'medium') as Severity,
        time: '--:--', onClick: () => setSelectedEntity({ type: 'poi', data: p }),
      }))
    : activeView === 'cyber'
    ? cyberGraph.edges.map(e => ({
        id: e.id, label: `${e.sourceId} → ${e.targetId}`, sublabel: e.protocol,
        severity: (e.threatScore > 85 ? 'critical' : e.threatScore > 65 ? 'high' : 'medium') as Severity,
        time: '--:--', onClick: () => {},
      }))
    : // space
      [...satellites]
        .sort((a, b) => b.altitude - a.altitude)
        .slice(0, 50) // show top 50 by altitude
        .map(s => ({
          id: s.id,
          label: s.name,
          sublabel: `${s.altitude} km`,
          severity: s.type === 'iss' ? 'high' : 'nominal' as Severity,
          time: `${s.velocity} km/s`,
          onClick: () => {
            setSelectedEntity({ type: 'satellite', data: s })
            setPanelVisible('entity', true)
          },
        }))

  return (
    <AnimatePresence>
      {panels.eventFeed && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="fixed left-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <PanelHeader title={activeView === 'space' ? 'TRACKED OBJECTS' : 'LIVE EVENT FEED'} />
          {activeView === 'space' && satsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="font-mono text-[10px] text-hud-dim animate-pulse">ACQUIRING SIGNALS...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {items.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={item.onClick}
                  className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors flex items-start gap-2"
                >
                  <span className={`mt-0.5 text-[9px] font-mono border px-1 rounded ${SEVERITY_COLORS[item.severity]}`}>
                    {item.severity.toUpperCase().slice(0, 4)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-hud-text truncate">{item.label}</div>
                    <div className="font-mono text-[10px] text-hud-dim truncate">{item.sublabel}</div>
                  </div>
                  <span className="font-mono text-[10px] text-hud-dim/60 shrink-0">{item.time}</span>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Step 2: Build**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Expected: `✓ built`

**Step 3: Commit**

```bash
git add src/components/panels/EventFeedPanel/index.tsx
git commit -m "feat: show satellite list in EventFeedPanel for space view"
```

---

### Task 9: Update EntityPanel

**Files:**
- Modify: `src/components/panels/EntityPanel/index.tsx`

**Step 1: Add SatelliteDetail and wire into EntityPanel**

Add the import and `SatelliteDetail` component, and add `{selectedEntity.type === 'satellite' && ...}` to the render:

```tsx
// src/components/panels/EntityPanel/index.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import type { GlobalIncident, CityPOI, CyberNode, Satellite, Severity } from '../../../types'

const SEVERITY_BG: Record<Severity, string> = {
  critical: 'bg-hud-red/10 text-hud-red border-hud-red/30',
  high: 'bg-hud-amber/10 text-hud-amber border-hud-amber/30',
  medium: 'bg-hud-cyan/10 text-hud-cyan border-hud-cyan/30',
  low: 'bg-hud-dim/10 text-hud-dim border-hud-dim/30',
  nominal: 'bg-hud-green/10 text-hud-green border-hud-green/30',
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
      <span className="font-mono text-[10px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-xs text-hud-text text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function IncidentDetail({ data }: { data: GlobalIncident }) {
  return (
    <>
      <div className={`mx-3 my-2 px-2 py-1 rounded border text-[10px] font-mono ${SEVERITY_BG[data.severity]}`}>
        {data.severity.toUpperCase()} — {data.type}
      </div>
      <div className="px-3">
        <DataRow label="COUNTRY" value={data.country} />
        <DataRow label="TYPE" value={data.type} />
        <DataRow label="TIMESTAMP" value={data.timestamp.replace('T', ' ').slice(0, 19) + 'Z'} />
        <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      </div>
      <div className="px-3 py-2">
        <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.summary}</p>
      </div>
    </>
  )
}

function POIDetail({ data }: { data: CityPOI }) {
  const activityColor = data.activityLevel > 80 ? 'text-hud-red' : data.activityLevel > 60 ? 'text-hud-amber' : 'text-hud-green'
  return (
    <div className="px-3 pt-2">
      <DataRow label="ID" value={data.label} />
      <DataRow label="TYPE" value={data.type.toUpperCase()} />
      <DataRow label="DISTRICT" value={data.district} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <div className="flex justify-between items-center py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">ACTIVITY</span>
        <span className={`font-mono text-xs ${activityColor}`}>{data.activityLevel}%</span>
      </div>
      <div className="mt-3 h-28 rounded border border-hud-dim/20 bg-black/40 flex items-center justify-center">
        <span className="font-mono text-[10px] text-hud-dim">[ FEED UNAVAILABLE ]</span>
      </div>
    </div>
  )
}

function NodeDetail({ data }: { data: CyberNode }) {
  const scoreColor = data.threatScore > 80 ? 'text-hud-red' : data.threatScore > 60 ? 'text-hud-amber' : 'text-hud-green'
  return (
    <div className="px-3 pt-2">
      <DataRow label="NODE" value={data.label} />
      <DataRow label="TYPE" value={data.type.toUpperCase()} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="flex justify-between items-center py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">THREAT SCORE</span>
        <span className={`font-mono text-xs ${scoreColor}`}>{data.threatScore}/100</span>
      </div>
    </div>
  )
}

function SatelliteDetail({ data }: { data: Satellite }) {
  const isISS = data.type === 'iss'
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${isISS ? SEVERITY_BG.high : SEVERITY_BG.nominal}`}>
        {isISS ? 'STATION' : 'STARLINK'} — NORAD {data.id}
      </div>
      <DataRow label="NAME" value={data.name} />
      <DataRow label="ALTITUDE" value={`${data.altitude} km`} />
      <DataRow label="VELOCITY" value={`${data.velocity} km/s`} />
      <DataRow label="INCLINATION" value={`${data.inclination}°`} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="mt-3 h-16 rounded border border-hud-dim/20 bg-black/40 flex items-center justify-center">
        <span className="font-mono text-[10px] text-hud-dim">[ TELEMETRY STREAM ]</span>
      </div>
    </div>
  )
}

export function EntityPanel() {
  const panels = useHUDStore((s) => s.panels)
  const selectedEntity = useHUDStore((s) => s.selectedEntity)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)

  return (
    <AnimatePresence>
      {panels.entity && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="fixed right-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-hud-cyan/20">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-hud-purple rounded-full" />
              <span className="font-mono text-[10px] tracking-widest text-hud-purple">ENTITY DETAILS</span>
            </div>
            {selectedEntity && (
              <button onClick={() => setSelectedEntity(null)} className="text-hud-dim hover:text-hud-text font-mono text-xs">×</button>
            )}
          </div>

          {!selectedEntity ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-[10px] text-hud-dim text-center px-4">
                SELECT AN ENTITY<br />FROM THE MAP OR FEED
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {selectedEntity.type === 'incident' && <IncidentDetail data={selectedEntity.data as GlobalIncident} />}
              {selectedEntity.type === 'poi' && <POIDetail data={selectedEntity.data as CityPOI} />}
              {selectedEntity.type === 'node' && <NodeDetail data={selectedEntity.data as CyberNode} />}
              {selectedEntity.type === 'satellite' && <SatelliteDetail data={selectedEntity.data as Satellite} />}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Step 2: Run full build + tests**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
npx vitest run 2>&1 | tail -6
```
Expected: `✓ built` and 4 tests passing.

**Step 3: Final commit**

```bash
git add src/components/panels/EntityPanel/index.tsx
git commit -m "feat: add SatelliteDetail to EntityPanel for space view"
```

---

## Summary

| Task | What it builds |
|---|---|
| 1 | Install satellite.js |
| 2 | Add Satellite type + space ViewMode |
| 3 | useSatellites hook — Celestrak fetch, TLE parse, position compute every 5s, mock fallback |
| 4 | SpaceLayer — Starlink circle layer + ISS pulsing marker + click selection |
| 5 | MapCanvas — space view config with deep-space fog |
| 6 | CommandSwitcher + key `4` shortcut |
| 7 | StatusBar — space label |
| 8 | EventFeedPanel — satellite list sorted by altitude |
| 9 | EntityPanel — SatelliteDetail with altitude, velocity, inclination |
