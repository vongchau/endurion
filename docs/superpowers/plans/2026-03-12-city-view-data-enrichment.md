# City View Data Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 new data layers (traffic, weather, crime, aircraft, power outages) to the city view, transforming it from a drone-only tracker into a full urban situational awareness dashboard.

**Architecture:** Each layer follows the established source → cache → route → hook → layer component pipeline. Server sources normalize external API responses into typed interfaces. Client hooks poll conditionally based on layer toggles. Map layers render via Mapbox GeoJSON sources or react-map-gl Markers.

**Tech Stack:** Hono (server), React 18, react-map-gl/mapbox, Zustand, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-12-city-view-data-enrichment-design.md`

---

## File Structure

### New Files (Create)
```
server/sources/tomtomTraffic.ts      — TomTom Incidents API fetcher
server/sources/nwsAlerts.ts          — NWS weather alerts fetcher
server/sources/socrataCrime.ts       — Socrata SODA crime data fetcher (multi-city)
server/sources/openSkyCity.ts        — OpenSky bbox fetcher, filter alt < 3000m
server/sources/odinPower.ts          — DOE ODIN power outage fetcher
server/trafficCache.ts               — Traffic polling cache (60s)
server/weatherCache.ts               — Weather polling cache (120s)
server/crimeCache.ts                 — Crime polling cache (300s, multi-city)
server/aircraftCache.ts              — Low-alt aircraft polling cache (15s)
server/powerCache.ts                 — Power outage polling cache (300s)
src/hooks/useTrafficIncidents.ts     — Client hook, 60s poll
src/hooks/useWeatherAlerts.ts        — Client hook, 120s poll
src/hooks/useCrimeIncidents.ts       — Client hook, 300s poll
src/hooks/useLowAltAircraft.ts       — Client hook, 15s poll
src/hooks/usePowerOutages.ts         — Client hook, 300s poll
src/views/city/TrafficLayer.tsx      — Mapbox circle layer by severity
src/views/city/WeatherLayer.tsx      — Mapbox fill layer for alert polygons
src/views/city/CrimeLayer.tsx        — Mapbox circle layer by crime type
src/views/city/AircraftLayer.tsx     — Marker layer with heading arrows
src/views/city/PowerLayer.tsx        — Mapbox fill layer for outage polygons
```

### Modified Files
```
src/types/index.ts                   — Add 5 new interfaces, expand CityLayer & Entity
src/store/index.ts                   — Expand default cityLayers set
server/index.ts                      — Add 5 new routes, import caches, start pollers
src/views/city/CityMarkers.tsx       — Integrate 5 new layers
src/components/panels/StatusBar/index.tsx — Expand CityLayerDropdown to 7 items
src/components/panels/EventFeedPanel/index.tsx — Add city feed items for all layers
src/components/panels/EntityPanel/index.tsx — Add 5 new detail components
.env.example                         — Add TOMTOM_API_KEY, SOCRATA_APP_TOKEN
```

---

## Chunk 1: Types, Store & Environment

### Task 1: Add Type Definitions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add new interfaces and expand CityLayer**

Add after the existing `DroneFlight` interface in `src/types/index.ts`:

```typescript
export type CityLayer = 'uas' | 'zones' | 'traffic' | 'weather' | 'crime' | 'aircraft' | 'power'

export interface TrafficIncident {
  id: string
  lat: number
  lng: number
  category: 'accident' | 'congestion' | 'roadClosed' | 'roadWorks' | 'weather' | 'other'
  severity: 1 | 2 | 3 | 4
  description: string
  delay: number
  startTime: number
  endTime?: number
}

export interface WeatherAlert {
  id: string
  event: string
  severity: 'extreme' | 'severe' | 'moderate' | 'minor'
  urgency: 'immediate' | 'expected' | 'future'
  headline: string
  description: string
  instruction?: string
  onset: number
  expires: number
  geometry: GeoJSON.Geometry | null
}

export interface CrimeIncident {
  id: string
  lat: number
  lng: number
  type: string
  description: string
  timestamp: number
  city: 'chicago' | 'nyc' | 'la'
  severity: 'violent' | 'property' | 'other'
}

export interface LowAltAircraft {
  id: string
  icao24: string
  callsign: string
  lat: number
  lng: number
  altitude: number
  velocity: number
  heading: number
  verticalRate: number
  squawk: string | null
  onGround: boolean
  timestamp: number
}

export interface PowerOutage {
  id: string
  state: string
  county: string
  utility: string
  customersAffected: number
  reportedStart: number
  estimatedRestoration?: number
  cause?: string
  geometry: GeoJSON.Geometry | null
  centroid: { lat: number; lng: number }
}
```

Also expand the `Entity` interface — add to the type union:
```typescript
| 'traffic' | 'weatherAlert' | 'crime' | 'aircraft' | 'powerOutage'
```
And to the data union:
```typescript
| TrafficIncident | WeatherAlert | CrimeIncident | LowAltAircraft | PowerOutage
```

- [ ] **Step 2: Update .env.example**

Add after the `GEMINI_API_KEY` section:

```
# ─── City View: Traffic ──────────────────────────────────────────
# TomTom Developer API — free tier (2,500 req/day)
# Sign up at: https://developer.tomtom.com/
TOMTOM_API_KEY=

# ─── City View: Crime (Optional) ────────────────────────────────
# Socrata App Token — improves rate limits from shared pool to 1,000 req/hr
# Get one at: https://dev.socrata.com/docs/app-tokens.html
SOCRATA_APP_TOKEN=
```

- [ ] **Step 3: Update store default cityLayers**

In `src/store/index.ts`, change:
```typescript
cityLayers: new Set<CityLayer>(['uas', 'zones']),
```
to:
```typescript
cityLayers: new Set<CityLayer>(['uas', 'zones', 'traffic', 'weather', 'aircraft']),
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/index.ts .env.example
git commit -m "feat(city): add type definitions for 5 new city layers"
```

---

## Chunk 2: Traffic Incidents (Server + Client)

### Task 2: TomTom Traffic Source

**Files:**
- Create: `server/sources/tomtomTraffic.ts`

- [ ] **Step 1: Implement the TomTom API fetcher**

```typescript
// server/sources/tomtomTraffic.ts
import type { TrafficIncident } from '../../src/types'

const CATEGORY_MAP: Record<number, TrafficIncident['category']> = {
  0: 'other',       // Unknown
  1: 'accident',    // Accident
  2: 'weather',     // Fog
  3: 'other',       // Dangerous Conditions
  4: 'weather',     // Rain
  5: 'weather',     // Ice
  6: 'congestion',  // Jam
  7: 'roadClosed',  // Lane Closed
  8: 'roadClosed',  // Road Closed
  9: 'roadWorks',   // Road Works
  10: 'weather',    // Wind
  11: 'weather',    // Flooding
  12: 'roadClosed', // Detour
  14: 'accident',   // Broken Down Vehicle
}

export async function fetchTrafficIncidents(
  apiKey: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<TrafficIncident[]> {
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&key=${apiKey}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,delay,events,startTime,endTime}}}&language=en-US&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,12,14`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[tomtom] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const incidents: TrafficIncident[] = []

  for (const inc of data.incidents ?? []) {
    const props = inc.properties ?? {}
    const geom = inc.geometry
    if (!geom?.coordinates) continue

    // Extract a representative point (first coordinate)
    const coords = geom.type === 'Point'
      ? geom.coordinates
      : Array.isArray(geom.coordinates[0])
        ? geom.coordinates[0]  // first point of LineString
        : geom.coordinates

    const iconCat = props.iconCategory ?? 0
    const description = (props.events ?? [])
      .map((e: { description?: string }) => e.description)
      .filter(Boolean)
      .join('; ') || `Traffic incident (category ${iconCat})`

    incidents.push({
      id: props.id ?? `tt-${Math.random().toString(36).slice(2)}`,
      lat: coords[1],
      lng: coords[0],
      category: CATEGORY_MAP[iconCat] ?? 'other',
      severity: Math.max(1, Math.min(4, props.magnitudeOfDelay ?? 1)) as 1 | 2 | 3 | 4,
      description,
      delay: props.delay ?? 0,
      startTime: props.startTime ? new Date(props.startTime).getTime() : Date.now(),
      endTime: props.endTime ? new Date(props.endTime).getTime() : undefined,
    })
  }

  return incidents
}
```

- [ ] **Step 2: Commit**

```bash
git add server/sources/tomtomTraffic.ts
git commit -m "feat(city): add TomTom traffic incidents source adapter"
```

### Task 3: Traffic Cache + Route

**Files:**
- Create: `server/trafficCache.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Implement traffic cache**

Follow the `droneCache.ts` pattern: in-memory Map, bbox-keyed, background polling.

```typescript
// server/trafficCache.ts
import type { TrafficIncident } from '../src/types'
import { fetchTrafficIncidents } from './sources/tomtomTraffic'

const POLL_INTERVAL = 60_000

let cache: TrafficIncident[] = []
let lastBbox = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  const apiKey = process.env.TOMTOM_API_KEY
  if (!apiKey || !lastBbox) return

  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  try {
    cache = await fetchTrafficIncidents(apiKey, minLng, minLat, maxLng, maxLat)
  } catch (e) {
    console.error(`[trafficCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setTrafficBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  poll()
}

export function startTrafficPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[trafficCache] poller started (60s)')
}

export function getTrafficIncidents(): TrafficIncident[] {
  return cache
}
```

- [ ] **Step 2: Add route to server/index.ts**

Add import:
```typescript
import { getTrafficIncidents, setTrafficBbox, startTrafficPoller } from './trafficCache'
```

Add route (after the airspace/zones route):
```typescript
app.get('/api/city/traffic', (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) return c.json([])
  setTrafficBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getTrafficIncidents())
})
```

Add at bottom with other `start*` calls:
```typescript
startTrafficPoller()
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/trafficCache.ts server/index.ts
git commit -m "feat(city): add traffic incidents cache and API route"
```

### Task 4: Traffic Client Hook + Map Layer

**Files:**
- Create: `src/hooks/useTrafficIncidents.ts`
- Create: `src/views/city/TrafficLayer.tsx`

- [ ] **Step 1: Implement the hook**

Follow the `useAirspaceZones` pattern: quantized bounds, conditional fetch, polling.

```typescript
// src/hooks/useTrafficIncidents.ts
import { useState, useEffect, useMemo } from 'react'
import type { TrafficIncident, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 10) / 10
  return { minLng: q(bounds.minLng), minLat: q(bounds.minLat), maxLng: q(bounds.maxLng), maxLat: q(bounds.maxLat) }
}

export function useTrafficIncidents(enabled: boolean, bounds: MapBounds | null) {
  const [data, setData] = useState<TrafficIncident[]>([])
  const [loading, setLoading] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}` : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) { setData([]); return }

    let cancelled = false
    const params = new URLSearchParams({
      minLng: String(stableBounds.minLng), minLat: String(stableBounds.minLat),
      maxLng: String(stableBounds.maxLng), maxLat: String(stableBounds.maxLat),
    })

    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/traffic?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[useTrafficIncidents]', e) }
      finally { if (!cancelled) setLoading(false) }
    }

    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { data: enabled ? data : [], loading }
}
```

- [ ] **Step 2: Implement the map layer**

```typescript
// src/views/city/TrafficLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { TrafficIncident } from '../../types'

interface Props { incidents: TrafficIncident[] }

export function TrafficLayer({ incidents }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: incidents.map(i => ({
      type: 'Feature' as const,
      properties: {
        id: i.id,
        category: i.category,
        severity: i.severity,
        description: i.description,
        delay: i.delay,
      },
      geometry: { type: 'Point' as const, coordinates: [i.lng, i.lat] },
    })),
  }

  return (
    <Source id="traffic-incidents" type="geojson" data={geojson}>
      <Layer
        id="traffic-points"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 13, 7, 16, 12],
          'circle-color': [
            'match', ['get', 'severity'],
            1, '#00ff88',
            2, '#ffaa00',
            3, '#ff8c00',
            4, '#ff2d2d',
            '#4a6080',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#050810',
        }}
      />
      <Layer
        id="traffic-labels"
        type="symbol"
        minzoom={12}
        layout={{
          'text-field': ['get', 'category'],
          'text-size': 8,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-transform': 'uppercase',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ff2d2d',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.7,
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTrafficIncidents.ts src/views/city/TrafficLayer.tsx
git commit -m "feat(city): add traffic incidents hook and map layer"
```

---

## Chunk 3: Weather Alerts (Server + Client)

### Task 5: NWS Weather Source

**Files:**
- Create: `server/sources/nwsAlerts.ts`

- [ ] **Step 1: Implement the NWS API fetcher**

```typescript
// server/sources/nwsAlerts.ts
import type { WeatherAlert } from '../../src/types'

const USER_AGENT = '(endurion-hud, ops@endurion.dev)'

export async function fetchWeatherAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}&status=actual`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
  })
  if (!res.ok) {
    console.error(`[nws] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const alerts: WeatherAlert[] = []

  for (const feature of data.features ?? []) {
    const props = feature.properties ?? {}
    const sevMap: Record<string, WeatherAlert['severity']> = {
      Extreme: 'extreme', Severe: 'severe', Moderate: 'moderate', Minor: 'minor',
    }
    const urgMap: Record<string, WeatherAlert['urgency']> = {
      Immediate: 'immediate', Expected: 'expected', Future: 'future',
    }

    alerts.push({
      id: feature.id ?? `nws-${Math.random().toString(36).slice(2)}`,
      event: props.event ?? 'Unknown',
      severity: sevMap[props.severity] ?? 'minor',
      urgency: urgMap[props.urgency] ?? 'future',
      headline: props.headline ?? '',
      description: props.description ?? '',
      instruction: props.instruction ?? undefined,
      onset: props.onset ? new Date(props.onset).getTime() : Date.now(),
      expires: props.expires ? new Date(props.expires).getTime() : Date.now() + 3600_000,
      geometry: feature.geometry ?? null,
    })
  }

  return alerts
}
```

- [ ] **Step 2: Commit**

```bash
git add server/sources/nwsAlerts.ts
git commit -m "feat(city): add NWS weather alerts source adapter"
```

### Task 6: Weather Cache + Route

**Files:**
- Create: `server/weatherCache.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Implement weather cache**

```typescript
// server/weatherCache.ts
import type { WeatherAlert } from '../src/types'
import { fetchWeatherAlerts } from './sources/nwsAlerts'

const POLL_INTERVAL = 120_000

let cache: WeatherAlert[] = []
let lastKey = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function pointKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

async function poll() {
  if (!lastKey) return
  const [lat, lng] = lastKey.split(',').map(Number)
  try {
    const now = Date.now()
    const alerts = await fetchWeatherAlerts(lat, lng)
    // Remove expired alerts
    cache = alerts.filter(a => a.expires > now)
  } catch (e) {
    console.error(`[weatherCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setWeatherPoint(lat: number, lng: number) {
  const key = pointKey(lat, lng)
  if (key === lastKey) return
  lastKey = key
  poll()
}

export function startWeatherPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[weatherCache] poller started (120s)')
}

export function getWeatherAlerts(): WeatherAlert[] {
  return cache
}
```

- [ ] **Step 2: Add route + start poller in server/index.ts**

Import:
```typescript
import { getWeatherAlerts, setWeatherPoint, startWeatherPoller } from './weatherCache'
```

Route:
```typescript
app.get('/api/city/weather', (c) => {
  const lat = parseFloat(c.req.query('lat') ?? '')
  const lng = parseFloat(c.req.query('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) return c.json([])
  setWeatherPoint(lat, lng)
  return c.json(getWeatherAlerts())
})
```

Start: `startWeatherPoller()`

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add server/weatherCache.ts server/index.ts
git commit -m "feat(city): add weather alerts cache and API route"
```

### Task 7: Weather Client Hook + Map Layer

**Files:**
- Create: `src/hooks/useWeatherAlerts.ts`
- Create: `src/views/city/WeatherLayer.tsx`

- [ ] **Step 1: Implement hook**

```typescript
// src/hooks/useWeatherAlerts.ts
import { useState, useEffect, useMemo } from 'react'
import type { WeatherAlert } from '../types'

export function useWeatherAlerts(enabled: boolean, center: { lat: number; lng: number } | null) {
  const [data, setData] = useState<WeatherAlert[]>([])
  const [loading, setLoading] = useState(false)

  const centerKey = center ? `${center.lat.toFixed(2)},${center.lng.toFixed(2)}` : ''
  const stableCenter = useMemo(() => center, [centerKey])

  useEffect(() => {
    if (!enabled || !stableCenter) { setData([]); return }

    let cancelled = false
    const params = new URLSearchParams({
      lat: String(stableCenter.lat), lng: String(stableCenter.lng),
    })

    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/weather?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[useWeatherAlerts]', e) }
      finally { if (!cancelled) setLoading(false) }
    }

    fetchData()
    const id = setInterval(fetchData, 120_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableCenter])

  return { data: enabled ? data : [], loading }
}
```

- [ ] **Step 2: Implement map layer**

```typescript
// src/views/city/WeatherLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { WeatherAlert } from '../../types'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Props { alerts: WeatherAlert[] }

export function WeatherLayer({ alerts }: Props) {
  const geojson: GeoJSON.FeatureCollection = alerts.length === 0 ? EMPTY_GEOJSON : {
    type: 'FeatureCollection',
    features: alerts
      .filter(a => a.geometry)
      .map(a => ({
        type: 'Feature' as const,
        properties: { id: a.id, event: a.event, severity: a.severity },
        geometry: a.geometry!,
      })),
  }

  return (
    <Source id="weather-alerts" type="geojson" data={geojson}>
      <Layer
        id="weather-fill"
        type="fill"
        paint={{
          'fill-color': [
            'match', ['get', 'severity'],
            'extreme', '#ff2d2d',
            'severe', '#ff8c00',
            'moderate', '#ffaa00',
            'minor', '#00d4ff',
            '#4a6080',
          ],
          'fill-opacity': 0.15,
        }}
      />
      <Layer
        id="weather-line"
        type="line"
        paint={{
          'line-color': [
            'match', ['get', 'severity'],
            'extreme', '#ff2d2d',
            'severe', '#ff8c00',
            'moderate', '#ffaa00',
            'minor', '#00d4ff',
            '#4a6080',
          ],
          'line-width': 2,
          'line-opacity': 0.6,
          'line-dasharray': [4, 2],
        }}
      />
      <Layer
        id="weather-label"
        type="symbol"
        minzoom={8}
        layout={{
          'text-field': ['get', 'event'],
          'text-size': 10,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': '#ffaa00',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add src/hooks/useWeatherAlerts.ts src/views/city/WeatherLayer.tsx
git commit -m "feat(city): add weather alerts hook and map layer"
```

---

## Chunk 4: Crime Incidents (Server + Client)

### Task 8: Socrata Crime Source

**Files:**
- Create: `server/sources/socrataCrime.ts`

- [ ] **Step 1: Implement multi-city Socrata fetcher**

```typescript
// server/sources/socrataCrime.ts
import type { CrimeIncident } from '../../src/types'

interface CityConfig {
  city: CrimeIncident['city']
  domain: string
  dataset: string
  fields: {
    id: string
    date: string
    type: string
    description: string
    lat: string
    lng: string
  }
  violentTypes: string[]
}

const CITIES: CityConfig[] = [
  {
    city: 'chicago',
    domain: 'data.cityofchicago.org',
    dataset: 'ijzp-q8t2',
    fields: { id: 'id', date: 'date', type: 'primary_type', description: 'description', lat: 'latitude', lng: 'longitude' },
    violentTypes: ['HOMICIDE', 'ASSAULT', 'BATTERY', 'ROBBERY', 'KIDNAPPING', 'CRIM SEXUAL ASSAULT'],
  },
  {
    city: 'nyc',
    domain: 'data.cityofnewyork.us',
    dataset: '5uac-w243',
    fields: { id: 'cmplnt_num', date: 'cmplnt_fr_dt', type: 'ofns_desc', description: 'pd_desc', lat: 'latitude', lng: 'longitude' },
    violentTypes: ['MURDER & NON-NEGL. MANSLAUGHTER', 'FELONY ASSAULT', 'ROBBERY', 'RAPE', 'KIDNAPPING'],
  },
  {
    city: 'la',
    domain: 'data.lacity.org',
    dataset: '2nrs-mtv8',
    fields: { id: 'dr_no', date: 'date_occ', type: 'crm_cd_desc', description: 'premis_desc', lat: 'lat', lng: 'lon' },
    violentTypes: ['ASSAULT', 'BATTERY', 'ROBBERY', 'HOMICIDE', 'KIDNAPPING', 'RAPE'],
  },
]

const SUPPORTED_BBOXES: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  chicago: { minLat: 41.64, maxLat: 42.02, minLng: -87.94, maxLng: -87.52 },
  nyc:     { minLat: 40.49, maxLat: 40.92, minLng: -74.26, maxLng: -73.70 },
  la:      { minLat: 33.70, maxLat: 34.34, minLng: -118.67, maxLng: -118.16 },
}

function bboxOverlaps(
  a: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng
}

export function getMatchingCities(minLng: number, minLat: number, maxLng: number, maxLat: number): CityConfig[] {
  const viewBbox = { minLat, maxLat, minLng, maxLng }
  return CITIES.filter(c => bboxOverlaps(SUPPORTED_BBOXES[c.city], viewBbox))
}

export async function fetchCrimeIncidents(config: CityConfig): Promise<CrimeIncident[]> {
  const appToken = process.env.SOCRATA_APP_TOKEN
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const f = config.fields

  const url = `https://${config.domain}/resource/${config.dataset}.json?$where=${f.date} > '${since}'&$order=${f.date} DESC&$limit=200`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (appToken) headers['X-App-Token'] = appToken

  const res = await fetch(url, { headers })
  if (!res.ok) {
    console.error(`[socrata:${config.city}] fetch failed: ${res.status}`)
    return []
  }

  const rows = await res.json()
  const incidents: CrimeIncident[] = []

  for (const row of rows) {
    const lat = parseFloat(row[f.lat])
    const lng = parseFloat(row[f.lng])
    if (isNaN(lat) || isNaN(lng)) continue

    const crimeType = (row[f.type] ?? 'UNKNOWN').toUpperCase()
    const isViolent = config.violentTypes.some(v => crimeType.includes(v))
    const isProperty = !isViolent && ['THEFT', 'BURGLARY', 'LARCENY', 'VEHICLE', 'VANDALISM', 'ARSON', 'STOLEN'].some(k => crimeType.includes(k))

    incidents.push({
      id: `${config.city}-${row[f.id] ?? Math.random().toString(36).slice(2)}`,
      lat, lng,
      type: crimeType,
      description: row[f.description] ?? crimeType,
      timestamp: new Date(row[f.date]).getTime(),
      city: config.city,
      severity: isViolent ? 'violent' : isProperty ? 'property' : 'other',
    })
  }

  return incidents
}
```

- [ ] **Step 2: Commit**

```bash
git add server/sources/socrataCrime.ts
git commit -m "feat(city): add Socrata multi-city crime source adapter"
```

### Task 9: Crime Cache + Route

**Files:**
- Create: `server/crimeCache.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Implement crime cache**

```typescript
// server/crimeCache.ts
import type { CrimeIncident } from '../src/types'
import { getMatchingCities, fetchCrimeIncidents } from './sources/socrataCrime'

const POLL_INTERVAL = 5 * 60 * 1000

let cache: CrimeIncident[] = []
let lastBbox = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 10) / 10
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  if (!lastBbox) return
  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  const cities = getMatchingCities(minLng, minLat, maxLng, maxLat)
  if (cities.length === 0) { cache = []; return }

  try {
    const results = await Promise.all(cities.map(c => fetchCrimeIncidents(c)))
    cache = results.flat().sort((a, b) => b.timestamp - a.timestamp)
  } catch (e) {
    console.error(`[crimeCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setCrimeBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  poll()
}

export function startCrimePoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[crimeCache] poller started (5min)')
}

export function getCrimeIncidents(): CrimeIncident[] {
  return cache
}
```

- [ ] **Step 2: Add route + start poller in server/index.ts**

Import:
```typescript
import { getCrimeIncidents, setCrimeBbox, startCrimePoller } from './crimeCache'
```

Route:
```typescript
app.get('/api/city/crime', (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) return c.json([])
  setCrimeBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getCrimeIncidents())
})
```

Start: `startCrimePoller()`

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add server/crimeCache.ts server/index.ts
git commit -m "feat(city): add crime incidents cache and API route"
```

### Task 10: Crime Client Hook + Map Layer

**Files:**
- Create: `src/hooks/useCrimeIncidents.ts`
- Create: `src/views/city/CrimeLayer.tsx`

- [ ] **Step 1: Implement hook**

Same pattern as `useTrafficIncidents` but with 300s polling interval. File: `src/hooks/useCrimeIncidents.ts`

```typescript
// src/hooks/useCrimeIncidents.ts
import { useState, useEffect, useMemo } from 'react'
import type { CrimeIncident, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 10) / 10
  return { minLng: q(bounds.minLng), minLat: q(bounds.minLat), maxLng: q(bounds.maxLng), maxLat: q(bounds.maxLat) }
}

export function useCrimeIncidents(enabled: boolean, bounds: MapBounds | null) {
  const [data, setData] = useState<CrimeIncident[]>([])
  const [loading, setLoading] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}` : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) { setData([]); return }
    let cancelled = false
    const params = new URLSearchParams({
      minLng: String(stableBounds.minLng), minLat: String(stableBounds.minLat),
      maxLng: String(stableBounds.maxLng), maxLat: String(stableBounds.maxLat),
    })
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/crime?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[useCrimeIncidents]', e) }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const id = setInterval(fetchData, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { data: enabled ? data : [], loading }
}
```

- [ ] **Step 2: Implement map layer**

```typescript
// src/views/city/CrimeLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { CrimeIncident } from '../../types'

interface Props { incidents: CrimeIncident[] }

export function CrimeLayer({ incidents }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: incidents.map(i => ({
      type: 'Feature' as const,
      properties: { id: i.id, type: i.type, severity: i.severity, city: i.city },
      geometry: { type: 'Point' as const, coordinates: [i.lng, i.lat] },
    })),
  }

  return (
    <Source id="crime-incidents" type="geojson" data={geojson}>
      <Layer
        id="crime-points"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 13, 5, 16, 8],
          'circle-color': [
            'match', ['get', 'severity'],
            'violent', '#ff2d2d',
            'property', '#ffaa00',
            'other', '#4a6080',
            '#4a6080',
          ],
          'circle-opacity': 0.7,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#050810',
        }}
      />
      <Layer
        id="crime-labels"
        type="symbol"
        minzoom={14}
        layout={{
          'text-field': ['get', 'type'],
          'text-size': 8,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ff6b35',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.7,
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add src/hooks/useCrimeIncidents.ts src/views/city/CrimeLayer.tsx
git commit -m "feat(city): add crime incidents hook and map layer"
```

---

## Chunk 5: Low-Altitude Aircraft (Server + Client)

### Task 11: OpenSky City Source

**Files:**
- Create: `server/sources/openSkyCity.ts`

- [ ] **Step 1: Implement bbox-filtered OpenSky fetcher with altitude filter**

```typescript
// server/sources/openSkyCity.ts
import type { LowAltAircraft } from '../../src/types'

const MAX_ALT_METERS = 3000

export async function fetchLowAltAircraft(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<LowAltAircraft[]> {
  const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLng}&lamax=${maxLat}&lomax=${maxLng}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[openSkyCity] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const aircraft: LowAltAircraft[] = []

  for (const s of data.states ?? []) {
    const baroAlt = s[7] as number | null
    const geoAlt = s[13] as number | null
    const alt = baroAlt ?? geoAlt
    if (alt === null || alt > MAX_ALT_METERS) continue

    const lat = s[6] as number | null
    const lng = s[5] as number | null
    if (lat === null || lng === null) continue

    const onGround = s[8] as boolean
    if (onGround) continue  // skip grounded aircraft

    aircraft.push({
      id: s[0] as string,
      icao24: s[0] as string,
      callsign: ((s[1] as string) ?? '').trim(),
      lat, lng,
      altitude: alt,
      velocity: (s[9] as number) ?? 0,
      heading: (s[10] as number) ?? 0,
      verticalRate: (s[11] as number) ?? 0,
      squawk: (s[14] as string) ?? null,
      onGround,
      timestamp: ((s[3] as number) ?? Math.floor(Date.now() / 1000)) * 1000,
    })
  }

  return aircraft
}
```

- [ ] **Step 2: Commit**

```bash
git add server/sources/openSkyCity.ts
git commit -m "feat(city): add OpenSky low-altitude aircraft source adapter"
```

### Task 12: Aircraft Cache + Route

**Files:**
- Create: `server/aircraftCache.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Implement aircraft cache**

```typescript
// server/aircraftCache.ts
import type { LowAltAircraft } from '../src/types'
import { fetchLowAltAircraft } from './sources/openSkyCity'

const POLL_INTERVAL = 15_000

let cache: LowAltAircraft[] = []
let lastBbox = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  if (!lastBbox) return
  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  try {
    cache = await fetchLowAltAircraft(minLng, minLat, maxLng, maxLat)
  } catch (e) {
    console.error(`[aircraftCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setAircraftBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  poll()
}

export function startAircraftPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[aircraftCache] poller started (15s)')
}

export function getLowAltAircraft(): LowAltAircraft[] {
  return cache
}
```

- [ ] **Step 2: Add route + start poller**

Import:
```typescript
import { getLowAltAircraft, setAircraftBbox, startAircraftPoller } from './aircraftCache'
```

Route:
```typescript
app.get('/api/city/aircraft', (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) return c.json([])
  setAircraftBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getLowAltAircraft())
})
```

Start: `startAircraftPoller()`

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add server/aircraftCache.ts server/index.ts
git commit -m "feat(city): add low-altitude aircraft cache and API route"
```

### Task 13: Aircraft Client Hook + Map Layer

**Files:**
- Create: `src/hooks/useLowAltAircraft.ts`
- Create: `src/views/city/AircraftLayer.tsx`

- [ ] **Step 1: Implement hook**

Same bbox-polling pattern, 15s interval. File: `src/hooks/useLowAltAircraft.ts`

```typescript
// src/hooks/useLowAltAircraft.ts
import { useState, useEffect, useMemo } from 'react'
import type { LowAltAircraft, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 100) / 100
  return { minLng: q(bounds.minLng), minLat: q(bounds.minLat), maxLng: q(bounds.maxLng), maxLat: q(bounds.maxLat) }
}

export function useLowAltAircraft(enabled: boolean, bounds: MapBounds | null) {
  const [data, setData] = useState<LowAltAircraft[]>([])
  const [loading, setLoading] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}` : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) { setData([]); return }
    let cancelled = false
    const params = new URLSearchParams({
      minLng: String(stableBounds.minLng), minLat: String(stableBounds.minLat),
      maxLng: String(stableBounds.maxLng), maxLat: String(stableBounds.maxLat),
    })
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/aircraft?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[useLowAltAircraft]', e) }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const id = setInterval(fetchData, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { data: enabled ? data : [], loading }
}
```

- [ ] **Step 2: Implement map layer with directional markers**

```typescript
// src/views/city/AircraftLayer.tsx
import { Marker } from 'react-map-gl/mapbox'
import type { LowAltAircraft } from '../../types'

interface Props {
  aircraft: LowAltAircraft[]
  onSelect: (a: LowAltAircraft) => void
}

export function AircraftLayer({ aircraft, onSelect }: Props) {
  return (
    <>
      {aircraft.map(a => (
        <Marker key={a.id} longitude={a.lng} latitude={a.lat} anchor="center">
          <button
            onClick={() => onSelect(a)}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-blue-400/60 bg-blue-500/15 hover:scale-125 transition-transform"
            style={{ boxShadow: '0 0 8px rgba(59,130,246,0.4)' }}
            title={`${a.callsign || a.icao24} — ${Math.round(a.altitude)}m`}
          >
            <svg
              width="12" height="12" viewBox="0 0 12 12"
              style={{ transform: `rotate(${a.heading}deg)` }}
            >
              <path d="M6 0L9 10L6 8L3 10Z" fill="#3b82f6" />
            </svg>
          </button>
        </Marker>
      ))}
    </>
  )
}
```

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add src/hooks/useLowAltAircraft.ts src/views/city/AircraftLayer.tsx
git commit -m "feat(city): add low-altitude aircraft hook and map layer"
```

---

## Chunk 6: Power Outages (Server + Client)

### Task 14: ODIN Power Source

**Files:**
- Create: `server/sources/odinPower.ts`

- [ ] **Step 1: Implement ODIN API fetcher**

```typescript
// server/sources/odinPower.ts
import type { PowerOutage } from '../../src/types'

// Static state bbox lookup for resolving lat/lng to state code
const STATE_BBOXES: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  AL: { minLat: 30.22, maxLat: 35.01, minLng: -88.47, maxLng: -84.89 },
  AK: { minLat: 51.21, maxLat: 71.39, minLng: -179.15, maxLng: -129.98 },
  AZ: { minLat: 31.33, maxLat: 37.00, minLng: -114.82, maxLng: -109.04 },
  AR: { minLat: 33.00, maxLat: 36.50, minLng: -94.62, maxLng: -89.64 },
  CA: { minLat: 32.53, maxLat: 42.01, minLng: -124.41, maxLng: -114.13 },
  CO: { minLat: 36.99, maxLat: 41.00, minLng: -109.06, maxLng: -102.04 },
  CT: { minLat: 40.95, maxLat: 42.05, minLng: -73.73, maxLng: -71.79 },
  DE: { minLat: 38.45, maxLat: 39.84, minLng: -75.79, maxLng: -75.05 },
  FL: { minLat: 24.40, maxLat: 31.00, minLng: -87.63, maxLng: -80.03 },
  GA: { minLat: 30.36, maxLat: 35.00, minLng: -85.61, maxLng: -80.84 },
  HI: { minLat: 18.91, maxLat: 22.24, minLng: -160.25, maxLng: -154.81 },
  ID: { minLat: 41.99, maxLat: 49.00, minLng: -117.24, maxLng: -111.04 },
  IL: { minLat: 36.97, maxLat: 42.51, minLng: -91.51, maxLng: -87.50 },
  IN: { minLat: 37.77, maxLat: 41.76, minLng: -88.10, maxLng: -84.78 },
  IA: { minLat: 40.38, maxLat: 43.50, minLng: -96.64, maxLng: -90.14 },
  KS: { minLat: 36.99, maxLat: 40.00, minLng: -102.05, maxLng: -94.59 },
  KY: { minLat: 36.50, maxLat: 39.15, minLng: -89.57, maxLng: -81.96 },
  LA: { minLat: 28.92, maxLat: 33.02, minLng: -94.04, maxLng: -88.82 },
  ME: { minLat: 43.06, maxLat: 47.46, minLng: -71.08, maxLng: -66.95 },
  MD: { minLat: 37.91, maxLat: 39.72, minLng: -79.49, maxLng: -75.05 },
  MA: { minLat: 41.24, maxLat: 42.89, minLng: -73.51, maxLng: -69.93 },
  MI: { minLat: 41.70, maxLat: 48.26, minLng: -90.42, maxLng: -82.41 },
  MN: { minLat: 43.50, maxLat: 49.38, minLng: -97.24, maxLng: -89.49 },
  MS: { minLat: 30.17, maxLat: 34.99, minLng: -91.66, maxLng: -88.10 },
  MO: { minLat: 35.99, maxLat: 40.61, minLng: -95.77, maxLng: -89.10 },
  MT: { minLat: 44.36, maxLat: 49.00, minLng: -116.05, maxLng: -104.04 },
  NE: { minLat: 40.00, maxLat: 43.00, minLng: -104.05, maxLng: -95.31 },
  NV: { minLat: 35.00, maxLat: 42.00, minLng: -120.01, maxLng: -114.04 },
  NH: { minLat: 42.70, maxLat: 45.31, minLng: -72.56, maxLng: -70.70 },
  NJ: { minLat: 38.93, maxLat: 41.36, minLng: -75.56, maxLng: -73.89 },
  NM: { minLat: 31.33, maxLat: 37.00, minLng: -109.05, maxLng: -103.00 },
  NY: { minLat: 40.50, maxLat: 45.02, minLng: -79.76, maxLng: -71.86 },
  NC: { minLat: 33.84, maxLat: 36.59, minLng: -84.32, maxLng: -75.46 },
  ND: { minLat: 45.94, maxLat: 49.00, minLng: -104.05, maxLng: -96.55 },
  OH: { minLat: 38.40, maxLat: 41.98, minLng: -84.82, maxLng: -80.52 },
  OK: { minLat: 33.62, maxLat: 37.00, minLng: -103.00, maxLng: -94.43 },
  OR: { minLat: 41.99, maxLat: 46.29, minLng: -124.57, maxLng: -116.46 },
  PA: { minLat: 39.72, maxLat: 42.27, minLng: -80.52, maxLng: -74.69 },
  RI: { minLat: 41.15, maxLat: 42.02, minLng: -71.86, maxLng: -71.12 },
  SC: { minLat: 32.05, maxLat: 35.22, minLng: -83.35, maxLng: -78.54 },
  SD: { minLat: 42.48, maxLat: 45.95, minLng: -104.06, maxLng: -96.44 },
  TN: { minLat: 34.98, maxLat: 36.68, minLng: -90.31, maxLng: -81.65 },
  TX: { minLat: 25.84, maxLat: 36.50, minLng: -106.65, maxLng: -93.51 },
  UT: { minLat: 36.99, maxLat: 42.00, minLng: -114.05, maxLng: -109.04 },
  VT: { minLat: 42.73, maxLat: 45.02, minLng: -73.44, maxLng: -71.46 },
  VA: { minLat: 36.54, maxLat: 39.47, minLng: -83.68, maxLng: -75.24 },
  WA: { minLat: 45.54, maxLat: 49.00, minLng: -124.77, maxLng: -116.92 },
  WV: { minLat: 37.20, maxLat: 40.64, minLng: -82.64, maxLng: -77.72 },
  WI: { minLat: 42.49, maxLat: 47.08, minLng: -92.89, maxLng: -86.25 },
  WY: { minLat: 40.99, maxLat: 45.01, minLng: -111.06, maxLng: -104.05 },
  DC: { minLat: 38.79, maxLat: 38.99, minLng: -77.12, maxLng: -76.91 },
}

export function resolveState(lat: number, lng: number): string | null {
  for (const [code, bbox] of Object.entries(STATE_BBOXES)) {
    if (lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng) {
      return code
    }
  }
  return null
}

export async function fetchPowerOutages(stateCode: string): Promise<PowerOutage[]> {
  // ODIN uses full state names
  const stateNames: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'District of Columbia',
  }

  const stateName = stateNames[stateCode]
  if (!stateName) return []

  const url = `https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/odin-real-time-outages-county/records?where=state='${encodeURIComponent(stateName)}'&limit=100`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[odin] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const outages: PowerOutage[] = []

  for (const record of data.results ?? []) {
    const affected = record.metersaffected ?? 0
    if (affected === 0) continue  // skip counties with no outages

    const point = record.geo_point_2d
    outages.push({
      id: `odin-${stateCode}-${record.county ?? Math.random().toString(36).slice(2)}`,
      state: stateCode,
      county: record.county ?? 'Unknown',
      utility: record.name ?? 'Unknown',
      customersAffected: affected,
      reportedStart: record.reportedstarttime ? new Date(record.reportedstarttime).getTime() : Date.now(),
      estimatedRestoration: record.estimatedrestorationtime
        ? new Date(record.estimatedrestorationtime).getTime()
        : undefined,
      cause: record.causekind ?? undefined,
      geometry: record.geom ?? null,
      centroid: point ? { lat: point.lat, lng: point.lon } : { lat: 0, lng: 0 },
    })
  }

  return outages.sort((a, b) => b.customersAffected - a.customersAffected)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/sources/odinPower.ts
git commit -m "feat(city): add DOE ODIN power outage source adapter with state resolver"
```

### Task 15: Power Cache + Route

**Files:**
- Create: `server/powerCache.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Implement power cache**

```typescript
// server/powerCache.ts
import type { PowerOutage } from '../src/types'
import { fetchPowerOutages, resolveState } from './sources/odinPower'

const POLL_INTERVAL = 5 * 60 * 1000

let cache: PowerOutage[] = []
let lastState = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

async function poll() {
  if (!lastState) return
  try {
    cache = await fetchPowerOutages(lastState)
  } catch (e) {
    console.error(`[powerCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setPowerLocation(lat: number, lng: number) {
  const state = resolveState(lat, lng)
  if (!state || state === lastState) return
  lastState = state
  poll()
}

export function startPowerPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[powerCache] poller started (5min)')
}

export function getPowerOutages(): PowerOutage[] {
  return cache
}
```

- [ ] **Step 2: Add route + start poller**

Import:
```typescript
import { getPowerOutages, setPowerLocation, startPowerPoller } from './powerCache'
```

Route:
```typescript
app.get('/api/city/power', (c) => {
  const lat = parseFloat(c.req.query('lat') ?? '')
  const lng = parseFloat(c.req.query('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) return c.json([])
  setPowerLocation(lat, lng)
  return c.json(getPowerOutages())
})
```

Start: `startPowerPoller()`

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add server/powerCache.ts server/index.ts
git commit -m "feat(city): add power outage cache and API route"
```

### Task 16: Power Client Hook + Map Layer

**Files:**
- Create: `src/hooks/usePowerOutages.ts`
- Create: `src/views/city/PowerLayer.tsx`

- [ ] **Step 1: Implement hook**

```typescript
// src/hooks/usePowerOutages.ts
import { useState, useEffect, useMemo } from 'react'
import type { PowerOutage } from '../types'

export function usePowerOutages(enabled: boolean, center: { lat: number; lng: number } | null) {
  const [data, setData] = useState<PowerOutage[]>([])
  const [loading, setLoading] = useState(false)

  const centerKey = center ? `${center.lat.toFixed(1)},${center.lng.toFixed(1)}` : ''
  const stableCenter = useMemo(() => center, [centerKey])

  useEffect(() => {
    if (!enabled || !stableCenter) { setData([]); return }
    let cancelled = false
    const params = new URLSearchParams({
      lat: String(stableCenter.lat), lng: String(stableCenter.lng),
    })
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/power?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[usePowerOutages]', e) }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const id = setInterval(fetchData, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableCenter])

  return { data: enabled ? data : [], loading }
}
```

- [ ] **Step 2: Implement map layer**

```typescript
// src/views/city/PowerLayer.tsx
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { PowerOutage } from '../../types'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Props { outages: PowerOutage[] }

export function PowerLayer({ outages }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const withGeom = outages.filter(o => o.geometry)
    if (withGeom.length === 0) return EMPTY_GEOJSON
    return {
      type: 'FeatureCollection',
      features: withGeom.map(o => ({
        type: 'Feature' as const,
        properties: {
          id: o.id,
          county: o.county,
          customersAffected: o.customersAffected,
          utility: o.utility,
          cause: o.cause ?? '',
        },
        geometry: o.geometry!,
      })),
    }
  }, [outages])

  const maxAffected = Math.max(...outages.map(o => o.customersAffected), 1)

  return (
    <Source id="power-outages" type="geojson" data={geojson}>
      <Layer
        id="power-fill"
        type="fill"
        paint={{
          'fill-color': '#fbbf24',
          'fill-opacity': [
            'interpolate', ['linear'],
            ['get', 'customersAffected'],
            0, 0.05,
            maxAffected * 0.5, 0.2,
            maxAffected, 0.4,
          ],
        }}
      />
      <Layer
        id="power-line"
        type="line"
        paint={{
          'line-color': '#fbbf24',
          'line-width': 1,
          'line-opacity': 0.5,
        }}
      />
      <Layer
        id="power-label"
        type="symbol"
        minzoom={8}
        layout={{
          'text-field': ['concat', ['get', 'county'], '\n', ['to-string', ['get', 'customersAffected']], ' affected'],
          'text-size': 9,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': '#fbbf24',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 3: Type-check & commit**

```bash
npx tsc --noEmit
git add src/hooks/usePowerOutages.ts src/views/city/PowerLayer.tsx
git commit -m "feat(city): add power outage hook and map layer"
```

---

## Chunk 7: Integration (CityMarkers, StatusBar, EventFeed, EntityPanel)

### Task 17: Integrate All Layers into CityMarkers

**Files:**
- Modify: `src/views/city/CityMarkers.tsx`

- [ ] **Step 1: Add all new layer imports and rendering**

Replace the entire `CityMarkers.tsx` with the expanded version that imports all 7 layers, hooks, and conditionally renders them based on `cityLayers`:

```typescript
// src/views/city/CityMarkers.tsx
import { useMemo } from 'react'
import { useHUDStore } from '../../store'
import { useDrones } from '../../hooks/useDrones'
import { useAirspaceZones } from '../../hooks/useAirspaceZones'
import { useTrafficIncidents } from '../../hooks/useTrafficIncidents'
import { useWeatherAlerts } from '../../hooks/useWeatherAlerts'
import { useCrimeIncidents } from '../../hooks/useCrimeIncidents'
import { useLowAltAircraft } from '../../hooks/useLowAltAircraft'
import { usePowerOutages } from '../../hooks/usePowerOutages'
import { DroneLayer } from './DroneLayer'
import { AirspaceZoneLayer } from './AirspaceZoneLayer'
import { TrafficLayer } from './TrafficLayer'
import { WeatherLayer } from './WeatherLayer'
import { CrimeLayer } from './CrimeLayer'
import { AircraftLayer } from './AircraftLayer'
import { PowerLayer } from './PowerLayer'

export function CityMarkers() {
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const showUAS      = cityLayers.has('uas')
  const showZones    = cityLayers.has('zones')
  const showTraffic  = cityLayers.has('traffic')
  const showWeather  = cityLayers.has('weather')
  const showCrime    = cityLayers.has('crime')
  const showAircraft = cityLayers.has('aircraft')
  const showPower    = cityLayers.has('power')

  const { drones }              = useDrones(showUAS, mapBounds)
  const { zones }               = useAirspaceZones(showZones, mapBounds)
  const { data: trafficData }   = useTrafficIncidents(showTraffic, mapBounds)
  const { data: crimeData }     = useCrimeIncidents(showCrime, mapBounds)
  const { data: aircraftData }  = useLowAltAircraft(showAircraft, mapBounds)

  // Weather and power use center point instead of bbox
  const center = useMemo(() => {
    if (!mapBounds) return null
    return {
      lat: (mapBounds.minLat + mapBounds.maxLat) / 2,
      lng: (mapBounds.minLng + mapBounds.maxLng) / 2,
    }
  }, [mapBounds])

  const { data: weatherData } = useWeatherAlerts(showWeather, center)
  const { data: powerData }   = usePowerOutages(showPower, center)

  return (
    <>
      {showPower && <PowerLayer outages={powerData} />}
      {showWeather && <WeatherLayer alerts={weatherData} />}
      {showZones && <AirspaceZoneLayer zones={zones} />}
      {showCrime && <CrimeLayer incidents={crimeData} />}
      {showTraffic && <TrafficLayer incidents={trafficData} />}
      {showUAS && <DroneLayer drones={drones} />}
      {showAircraft && (
        <AircraftLayer
          aircraft={aircraftData}
          onSelect={(a) => {
            setSelectedEntity({ type: 'aircraft', data: a })
            setPanelVisible('entity', true)
          }}
        />
      )}
    </>
  )
}
```

Note: Rendering order matters — polygons first (power, weather, zones), then points (crime, traffic, drones), then markers (aircraft) on top.

- [ ] **Step 2: Type-check & commit**

```bash
npx tsc --noEmit
git add src/views/city/CityMarkers.tsx
git commit -m "feat(city): integrate all 7 layers into CityMarkers"
```

### Task 18: Expand StatusBar CityLayerDropdown

**Files:**
- Modify: `src/components/panels/StatusBar/index.tsx`

- [ ] **Step 1: Update the CITY_LAYERS array**

Change the existing `CITY_LAYERS` constant in StatusBar:

```typescript
const CITY_LAYERS: { key: CityLayer; label: string; color: string }[] = [
  { key: 'uas',      label: 'UAS',      color: '#7b2fff' },
  { key: 'zones',    label: 'ZONES',    color: '#ffaa00' },
  { key: 'traffic',  label: 'TRAFFIC',  color: '#ff2d2d' },
  { key: 'weather',  label: 'WEATHER',  color: '#00d4ff' },
  { key: 'crime',    label: 'CRIME',    color: '#ff6b35' },
  { key: 'aircraft', label: 'AIRCRAFT', color: '#3b82f6' },
  { key: 'power',    label: 'POWER',    color: '#fbbf24' },
]
```

- [ ] **Step 2: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/panels/StatusBar/index.tsx
git commit -m "feat(city): expand StatusBar layer dropdown to 7 items"
```

### Task 19: Add City Items to EventFeedPanel

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx`

- [ ] **Step 1: Add imports for new hooks**

Add after the existing `useDrones` import:
```typescript
import { useTrafficIncidents } from '../../../hooks/useTrafficIncidents'
import { useWeatherAlerts } from '../../../hooks/useWeatherAlerts'
import { useCrimeIncidents } from '../../../hooks/useCrimeIncidents'
import { useLowAltAircraft } from '../../../hooks/useLowAltAircraft'
import { usePowerOutages } from '../../../hooks/usePowerOutages'
```

- [ ] **Step 2: Add hook calls in the component body**

Inside `EventFeedPanel`, after the existing `useDrones` call, add:
```typescript
  const showTraffic  = activeView === 'city' && cityLayers.has('traffic')
  const showWeather  = activeView === 'city' && cityLayers.has('weather')
  const showCrime    = activeView === 'city' && cityLayers.has('crime')
  const showAircraft = activeView === 'city' && cityLayers.has('aircraft')
  const showPower    = activeView === 'city' && cityLayers.has('power')

  const mapCenter = mapBounds
    ? { lat: (mapBounds.minLat + mapBounds.maxLat) / 2, lng: (mapBounds.minLng + mapBounds.maxLng) / 2 }
    : null
  const { data: trafficData }  = useTrafficIncidents(showTraffic, mapBounds)
  const { data: weatherData }  = useWeatherAlerts(showWeather, mapCenter)
  const { data: crimeData }    = useCrimeIncidents(showCrime, mapBounds)
  const { data: aircraftData } = useLowAltAircraft(showAircraft, mapBounds)
  const { data: powerData }    = usePowerOutages(showPower, mapCenter)
```

- [ ] **Step 3: Replace city items block**

Replace the existing city `items` assignment (the `activeView === 'city'` branch in the ternary) with:
```typescript
    : activeView === 'city'
    ? [
        ...drones.map(d => ({
          id: d.id,
          label: d.sensorId,
          sublabel: d.state === 'airborne' ? `${Math.round(d.altitude)}m · ${d.speed.toFixed(1)} m/s` : d.state.toUpperCase(),
          severity: (d.state === 'airborne' ? (d.speed > 20 ? 'high' : 'medium') : 'nominal') as Severity,
          time: `${Math.round(d.heading)}°`,
          source: 'UAS',
          onClick: () => {
            setSelectedEntity({ type: 'drone', data: d })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [d.lng, d.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...trafficData.map(t => ({
          id: `tfc-${t.id}`,
          label: t.description || t.category.toUpperCase(),
          sublabel: `${t.category} · ${Math.round(t.delay / 60)}min delay`,
          severity: (t.severity >= 4 ? 'high' : t.severity >= 3 ? 'medium' : t.severity >= 2 ? 'low' : 'nominal') as Severity,
          time: new Date(t.startTime).toISOString().slice(11, 16),
          source: 'TFC',
          onClick: () => {
            setSelectedEntity({ type: 'traffic', data: t })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [t.lng, t.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...weatherData.map(w => ({
          id: `wx-${w.id}`,
          label: w.event,
          sublabel: w.headline,
          severity: (w.severity === 'extreme' ? 'critical' : w.severity === 'severe' ? 'high' : w.severity === 'moderate' ? 'medium' : 'low') as Severity,
          time: new Date(w.onset).toISOString().slice(11, 16),
          source: 'NWS',
          onClick: () => {
            setSelectedEntity({ type: 'weatherAlert', data: w })
            setPanelVisible('entity', true)
          },
        })),
        ...crimeData.map(c => ({
          id: `crm-${c.id}`,
          label: c.type,
          sublabel: `${c.city.toUpperCase()} · ${c.description}`,
          severity: (c.severity === 'violent' ? 'high' : c.severity === 'property' ? 'medium' : 'low') as Severity,
          time: new Date(c.timestamp).toISOString().slice(11, 16),
          source: c.city.toUpperCase().slice(0, 3),
          onClick: () => {
            setSelectedEntity({ type: 'crime', data: c })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...aircraftData.map(a => ({
          id: `ac-${a.id}`,
          label: a.callsign || a.icao24,
          sublabel: `${Math.round(a.altitude)}m · ${Math.round(a.velocity)} m/s · ${Math.round(a.heading)}°`,
          severity: (a.altitude < 500 ? 'high' : a.altitude < 1500 ? 'medium' : 'low') as Severity,
          time: `${Math.round(a.altitude)}m`,
          source: 'SKY',
          onClick: () => {
            setSelectedEntity({ type: 'aircraft', data: a })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [a.lng, a.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...powerData.map(p => ({
          id: `pwr-${p.id}`,
          label: `${p.county}, ${p.state}`,
          sublabel: `${p.utility} · ${p.customersAffected.toLocaleString()} affected`,
          severity: (p.customersAffected > 10000 ? 'critical' : p.customersAffected > 1000 ? 'high' : p.customersAffected > 100 ? 'medium' : 'low') as Severity,
          time: p.cause || '—',
          source: 'PWR',
          onClick: () => {
            setSelectedEntity({ type: 'powerOutage', data: p })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [p.centroid.lng, p.centroid.lat], zoom: 10, duration: 1500 })
          },
        })),
      ].sort((a, b) => {
        const sevOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, nominal: 4 }
        return sevOrder[a.severity] - sevOrder[b.severity]
      })
```

- [ ] **Step 4: Update panel header for city view**

Replace the city view panel header:
```typescript
? `CITY FEED · ${items.length}`
```

- [ ] **Step 5: Add crime data notice**

After the items list rendering `{items.map(...)`, add (inside the city view only):
```typescript
{activeView === 'city' && cityLayers.has('crime') && crimeData.length === 0 && (
  <div className="px-3 py-2 border-t border-hud-dim/10">
    <span className="font-mono text-[8px] text-hud-dim/40 tracking-wider">
      CRIME DATA — AVAILABLE IN CHI / NYC / LA
    </span>
  </div>
)}
```

- [ ] **Step 6: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/panels/EventFeedPanel/index.tsx
git commit -m "feat(city): add all city layer items to event feed"
```

### Task 20: Add Entity Detail Components

**Files:**
- Modify: `src/components/panels/EntityPanel/index.tsx`

- [ ] **Step 1: Add type imports**

Add to the existing import from `'../../../types'`:
```typescript
import type { ..., TrafficIncident, WeatherAlert, CrimeIncident, LowAltAircraft, PowerOutage } from '../../../types'
```

- [ ] **Step 2: Add TrafficDetail component**

Add before the `EntityPanel` function, after `DroneDetail`:
```typescript
function TrafficDetail({ data }: { data: TrafficIncident }) {
  const sevLabel = data.severity >= 4 ? 'MAJOR' : data.severity >= 3 ? 'MODERATE' : data.severity >= 2 ? 'MINOR' : 'MINIMAL'
  const badge = data.severity >= 4 ? SEVERITY_BG.high : data.severity >= 3 ? SEVERITY_BG.medium : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {sevLabel} — {data.category.toUpperCase()}
      </div>
      <DataRow label="CATEGORY" value={data.category.toUpperCase()} />
      <DataRow label="SEVERITY" value={`${data.severity}/4`} />
      <DataRow label="DELAY" value={`${Math.round(data.delay / 60)} min`} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="START" value={new Date(data.startTime).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      {data.endTime && <DataRow label="END" value={new Date(data.endTime).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />}
      {data.description && (
        <div className="py-2">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add WeatherDetail component**

```typescript
function WeatherDetail({ data }: { data: WeatherAlert }) {
  const sevBadge = data.severity === 'extreme' ? SEVERITY_BG.critical
    : data.severity === 'severe' ? SEVERITY_BG.high
    : data.severity === 'moderate' ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${sevBadge}`}>
        {data.severity.toUpperCase()} — {data.event}
      </div>
      <DataRow label="EVENT" value={data.event} />
      <DataRow label="SEVERITY" value={data.severity.toUpperCase()} />
      <DataRow label="URGENCY" value={data.urgency.toUpperCase()} />
      <DataRow label="ONSET" value={new Date(data.onset).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      <DataRow label="EXPIRES" value={new Date(data.expires).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      <div className="py-2">
        <p className="font-mono text-xs text-hud-text leading-relaxed">{data.headline}</p>
      </div>
      {data.description && (
        <div className="py-2 border-t border-hud-dim/10">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}
      {data.instruction && (
        <>
          <SectionHeader label="INSTRUCTIONS" color="#00d4ff" />
          <p className="font-mono text-[10px] text-hud-cyan/80 leading-relaxed">{data.instruction}</p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add CrimeDetail component**

```typescript
function CrimeDetail({ data }: { data: CrimeIncident }) {
  const badge = data.severity === 'violent' ? SEVERITY_BG.high
    : data.severity === 'property' ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {data.severity.toUpperCase()} — {data.type}
      </div>
      <DataRow label="TYPE" value={data.type} />
      <DataRow label="SEVERITY" value={data.severity.toUpperCase()} />
      <DataRow label="CITY" value={data.city.toUpperCase()} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="TIME" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      {data.description && (
        <div className="py-2">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Add AircraftDetail component**

```typescript
function AircraftDetail({ data }: { data: LowAltAircraft }) {
  const altBadge = data.altitude < 500 ? SEVERITY_BG.high
    : data.altitude < 1500 ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${altBadge}`}>
        AIRCRAFT — {data.callsign || data.icao24}
      </div>
      <DataRow label="CALLSIGN" value={data.callsign || '—'} />
      <DataRow label="ICAO24" value={data.icao24} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="ALTITUDE" value={`${Math.round(data.altitude)} m`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${data.velocity > 100 ? 'text-hud-red' : 'text-hud-text'}`}>
          {Math.round(data.velocity)} m/s
        </span>
      </div>
      <DataRow label="HEADING" value={`${Math.round(data.heading)}°`} />
      {data.verticalRate !== 0 && (
        <DataRow label="V/S" value={`${data.verticalRate > 0 ? '+' : ''}${data.verticalRate.toFixed(1)} m/s`} />
      )}
      {data.squawk && <DataRow label="SQUAWK" value={data.squawk} />}
      <DataRow label="ON GROUND" value={data.onGround ? 'YES' : 'NO'} />
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
    </div>
  )
}
```

- [ ] **Step 6: Add PowerDetail component**

```typescript
function PowerDetail({ data }: { data: PowerOutage }) {
  const badge = data.customersAffected > 10000 ? SEVERITY_BG.critical
    : data.customersAffected > 1000 ? SEVERITY_BG.high
    : data.customersAffected > 100 ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        OUTAGE — {data.county}, {data.state}
      </div>
      <DataRow label="COUNTY" value={data.county} />
      <DataRow label="STATE" value={data.state} />
      <DataRow label="UTILITY" value={data.utility} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">AFFECTED</span>
        <span className={`font-mono text-xs ${data.customersAffected > 10000 ? 'text-hud-red' : data.customersAffected > 1000 ? 'text-hud-amber' : 'text-hud-text'}`}>
          {data.customersAffected.toLocaleString()}
        </span>
      </div>
      <DataRow label="REPORTED" value={new Date(data.reportedStart).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      {data.estimatedRestoration && (
        <DataRow label="EST. RESTORE" value={new Date(data.estimatedRestoration).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      )}
      {data.cause && <DataRow label="CAUSE" value={data.cause} />}
    </div>
  )
}
```

- [ ] **Step 7: Add render cases in EntityPanel**

Add after the existing `edgeDetail` render case:
```typescript
{selectedEntity.type === 'traffic' && <TrafficDetail data={selectedEntity.data as TrafficIncident} />}
{selectedEntity.type === 'weatherAlert' && <WeatherDetail data={selectedEntity.data as WeatherAlert} />}
{selectedEntity.type === 'crime' && <CrimeDetail data={selectedEntity.data as CrimeIncident} />}
{selectedEntity.type === 'aircraft' && <AircraftDetail data={selectedEntity.data as LowAltAircraft} />}
{selectedEntity.type === 'powerOutage' && <PowerDetail data={selectedEntity.data as PowerOutage} />}
```

- [ ] **Step 8: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/panels/EntityPanel/index.tsx
git commit -m "feat(city): add entity detail components for all 5 new city layers"
```

### Task 21: Final Verification

- [ ] **Step 1: Type-check entire project**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Start dev server and verify**

Run: `npm run dev`
Expected: Server starts, no errors. Navigate to city view, toggle layers on/off from the dropdown.

- [ ] **Step 3: Commit any final fixes if needed**
