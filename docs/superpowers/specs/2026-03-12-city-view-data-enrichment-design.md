# City View Data Enrichment — Design Spec

## Goal

Expand the city view from 2 layers (UAS + airspace zones) to 7 layers, adding traffic incidents, weather alerts, crime incidents, low-altitude aircraft, and power outages. This transforms the city view into a general-purpose urban situational awareness picture covering both public safety and defense postures.

## Data Sources

| # | Layer | API | Auth | Rate Limit | Poll Interval | Update Freshness |
|---|-------|-----|------|------------|---------------|------------------|
| 1 | Traffic Incidents | TomTom Incidents API v5 | API key (query param) | 2,500 req/day free | 60s | Real-time |
| 2 | Weather Alerts | NWS API `/alerts/active` | User-Agent header only | 1 req/30s | 120s | Minutes |
| 3 | Crime Incidents | Socrata SODA (Chicago `ijzp-q8t2`, NYC `5uac-w243`, LA `2nrs-mtv8`) | App token (optional) | 1,000 req/hr w/ token | 300s | Daily (Chicago), weekly (LA), quarterly (NYC) |
| 4 | Low-Altitude Aircraft | OpenSky `/api/states/all` | Anonymous or OAuth2 | 400 credits/day anon | 15s | 10s resolution |
| 5 | Power Outages | DOE ODIN via OpenDataSoft | None | Undocumented (generous) | 300s | ~10 min |

### API Details

**TomTom Traffic Incidents:**
- Endpoint: `GET https://api.tomtom.com/traffic/services/5/incidentDetails?bbox={minLon},{minLat},{maxLon},{maxLat}&key={KEY}`
- Returns GeoJSON FeatureCollection with incident type (0-14), delay magnitude (0-4), timestamps
- `iconCategory` maps to: 0=Unknown, 1=Accident, 2=Fog, 3=Dangerous, 4=Rain, 5=Ice, 6=Jam, 7=Lane Closed, 8=Road Closed, 9=Road Works, 10=Wind, 11=Flooding, 12=Detour, 14=Broken Down Vehicle
- Env var: `TOMTOM_API_KEY`

**NWS Alerts:**
- Endpoint: `GET https://api.weather.gov/alerts/active?point={lat},{lng}`
- Also supports `?area={STATE}` for state-wide alerts
- Returns GeoJSON FeatureCollection with severity (Extreme/Severe/Moderate/Minor), urgency, geometry polygons
- Requires `User-Agent` header (e.g. `(endurion, contact@example.com)`)
- No API key needed

**Socrata Crime Data:**
- Chicago: `GET https://data.cityofchicago.org/resource/ijzp-q8t2.json?$where=date > '{ISO_DATE}'&$order=date DESC&$limit=200`
- NYC: `GET https://data.cityofnewyork.us/resource/5uac-w243.json?$where=cmplnt_fr_dt > '{DATE}'&$order=cmplnt_fr_dt DESC&$limit=200`
- LA: `GET https://data.lacity.org/resource/2nrs-mtv8.json?$where=date_occ > '{ISO_DATE}'&$order=date_occ DESC&$limit=200`
- Optional header: `X-App-Token: {SOCRATA_APP_TOKEN}`
- Each city returns different field names; the source adapter normalizes to `CrimeIncident`

**OpenSky (Low-Altitude):**
- Endpoint: `GET https://opensky-network.org/api/states/all?lamin={}&lomin={}&lamax={}&lomax={}`
- No server-side altitude filter — server-side filter `baro_altitude < 3000` meters after fetch
- `openSkyCity.ts` is a **separate source adapter** from the existing `opensky.ts` used by the global military view. It calls the bbox-filtered endpoint independently and does not share caching or requests with the global source. This avoids coupling and keeps the city view's polling cadence (15s) independent from the global view's.

**TomTom `iconCategory` → `TrafficIncident.category` mapping:**

| iconCategory | Value | Maps to |
|---|---|---|
| 0 | Unknown | `other` |
| 1 | Accident | `accident` |
| 2 | Fog | `weather` |
| 3 | Dangerous Conditions | `other` |
| 4 | Rain | `weather` |
| 5 | Ice | `weather` |
| 6 | Jam | `congestion` |
| 7 | Lane Closed | `roadClosed` |
| 8 | Road Closed | `roadClosed` |
| 9 | Road Works | `roadWorks` |
| 10 | Wind | `weather` |
| 11 | Flooding | `weather` |
| 12 | Detour | `roadClosed` |
| 14 | Broken Down Vehicle | `accident` |

**DOE ODIN Power Outages:**
- Endpoint: `GET https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/odin-real-time-outages-county/records?where=state='{STATE}'&limit=100`
- Returns records with `metersaffected`, county geometry, utility name, cause
- Supports `?format=geojson` for direct GeoJSON output

## Type Definitions

All timestamps are `number` (Unix epoch ms) to match the existing `DroneFlight.timestamp` convention and simplify sorting in the event feed. `@types/geojson` is already a transitive dependency via `react-map-gl`; no new install needed.

```typescript
// Expanded
export type CityLayer = 'uas' | 'zones' | 'traffic' | 'weather' | 'crime' | 'aircraft' | 'power'

export interface TrafficIncident {
  id: string
  lat: number
  lng: number
  category: 'accident' | 'congestion' | 'roadClosed' | 'roadWorks' | 'weather' | 'other'
  severity: 1 | 2 | 3 | 4          // 1=minor → 4=major
  description: string
  delay: number                      // seconds
  startTime: number                  // epoch ms
  endTime?: number                   // epoch ms
}

export interface WeatherAlert {
  id: string
  event: string                      // "Tornado Warning", "Heat Advisory"
  severity: 'extreme' | 'severe' | 'moderate' | 'minor'
  urgency: 'immediate' | 'expected' | 'future'
  headline: string
  description: string
  instruction?: string
  onset: number                      // epoch ms
  expires: number                    // epoch ms
  geometry: GeoJSON.Geometry | null
}

export interface CrimeIncident {
  id: string
  lat: number
  lng: number
  type: string                       // "ASSAULT", "THEFT", etc.
  description: string
  timestamp: number                  // epoch ms
  city: 'chicago' | 'nyc' | 'la'
  severity: 'violent' | 'property' | 'other'
}

export interface LowAltAircraft {
  id: string                         // set to icao24 value
  icao24: string
  callsign: string
  lat: number
  lng: number
  altitude: number                   // meters
  velocity: number                   // m/s
  heading: number
  verticalRate: number
  squawk: string | null
  onGround: boolean
  timestamp: number                  // epoch ms
}

export interface PowerOutage {
  id: string
  state: string
  county: string
  utility: string
  customersAffected: number
  reportedStart: number              // epoch ms
  estimatedRestoration?: number      // epoch ms
  cause?: string
  geometry: GeoJSON.Geometry | null
  centroid: { lat: number; lng: number }
}
```

## Server Architecture

### File Structure

```
server/
  sources/
    tomtomTraffic.ts     — fetch TomTom bbox → TrafficIncident[]
    nwsAlerts.ts         — fetch NWS by point/state → WeatherAlert[]
    socrataCrime.ts      — fetch Socrata per city → CrimeIncident[]
    openSkyCity.ts       — fetch OpenSky bbox, filter alt < 3000m → LowAltAircraft[]
    odinPower.ts         — fetch ODIN by state → PowerOutage[]
    dronetag.ts          — (existing, unchanged)
    faaAirspace.ts       — (existing, unchanged)
  trafficCache.ts        — poll every 60s, 5-min stale TTL
  weatherCache.ts        — poll every 120s, 5-min stale TTL
  crimeCache.ts          — poll every 5min, 30-min stale TTL, multi-city
  aircraftCache.ts       — poll every 15s, 1-min stale TTL
  powerCache.ts          — poll every 5min, 10-min stale TTL
  droneCache.ts          — (existing, unchanged)
  zoneCache.ts           — (existing, unchanged)
```

### Cache Pattern

Each cache follows the established `droneCache.ts` pattern:
1. In-memory Map keyed by quantized bbox or state code
2. Background polling on a `setInterval`, started on first request
3. Stale entry eviction on each poll cycle
4. Exported getter function returns cached data immediately

Note: The existing `droneCache.ts` runs its poller indefinitely once started. The new caches follow the same approach — polling starts on first request and runs for the server's lifetime. This is acceptable because the poll intervals are modest (15s–300s) and the APIs are free/rate-limited anyway.

### API Routes

| Endpoint | Params | Returns |
|----------|--------|---------|
| `GET /api/city/traffic` | `minLng, minLat, maxLng, maxLat` | `TrafficIncident[]` |
| `GET /api/city/weather` | `lat, lng` | `WeatherAlert[]` |
| `GET /api/city/crime` | `minLng, minLat, maxLng, maxLat` | `CrimeIncident[]` |
| `GET /api/city/aircraft` | `minLng, minLat, maxLng, maxLat` | `LowAltAircraft[]` |
| `GET /api/city/power` | `state` (2-letter code) | `PowerOutage[]` |

### Environment Variables

```
TOMTOM_API_KEY=          # Required for traffic layer
SOCRATA_APP_TOKEN=       # Optional, recommended for higher rate limits
```

NWS and ODIN require no keys. OpenSky anonymous access is sufficient for city-scale bbox queries at 15s intervals.

## Client Architecture

### Hooks

5 new hooks in `src/hooks/`, following the `useDrones(enabled, bounds)` pattern:

| Hook | File | Poll | Params |
|------|------|------|--------|
| `useTrafficIncidents(enabled, bounds)` | `useTrafficIncidents.ts` | 60s | bbox |
| `useWeatherAlerts(enabled, center)` | `useWeatherAlerts.ts` | 120s | lat/lng |
| `useCrimeIncidents(enabled, bounds)` | `useCrimeIncidents.ts` | 300s | bbox |
| `useLowAltAircraft(enabled, bounds)` | `useLowAltAircraft.ts` | 15s | bbox |
| `usePowerOutages(enabled, state)` | `usePowerOutages.ts` | 300s | state code |

Each returns `{ data: T[], loading: boolean }`. This uses the generic `data` property name (unlike `useDrones` which returns `{ drones, loading }`) for consistency across the new hooks. Polling is gated by the `enabled` flag to avoid unnecessary requests when layers are toggled off or user is in another view.

### Geographic Context Detection

**State detection** (for power outages and NWS state-level queries): The server derives the state from the map center point using a static lookup table of US state bounding boxes. The client passes `lat, lng` (map center); the server resolves to a 2-letter state code. This avoids reverse geocoding API calls.

**City detection** (for crime data): The crime cache maintains a static map of supported city bounding boxes:
```typescript
const SUPPORTED_CITIES = {
  chicago: { minLat: 41.64, maxLat: 42.02, minLng: -87.94, maxLng: -87.52 },
  nyc:     { minLat: 40.49, maxLat: 40.92, minLng: -74.26, maxLng: -73.70 },
  la:      { minLat: 33.70, maxLat: 34.34, minLng: -118.67, maxLng: -118.16 },
}
```
The server checks if the requested bbox overlaps any supported city. If no overlap, the endpoint returns an empty array. The client shows a dim "CRIME DATA — AVAILABLE IN CHI / NYC / LA" notice in the event feed when the crime layer is enabled but no data is available for the current viewport.

### Map Layer Components

5 new components in `src/views/city/`:

| Component | Rendering Strategy |
|-----------|--------------------|
| `TrafficLayer.tsx` | Mapbox GeoJSON source + circle layer, color by severity (green→red), symbol by category |
| `WeatherLayer.tsx` | Mapbox GeoJSON fill layer for alert polygons, color by severity (red=extreme, orange=severe, yellow=moderate), semi-transparent |
| `CrimeLayer.tsx` | Mapbox GeoJSON circle layer for individual incidents; color by severity category (violent=red, property=amber, other=dim) |
| `AircraftLayer.tsx` | React-map-gl Markers with directional heading arrows, similar to global `MilitaryLayer` but for low-altitude aircraft |
| `PowerLayer.tsx` | Mapbox GeoJSON fill layer for county polygons, opacity mapped by `customersAffected` count |

### CityMarkers Integration

`CityMarkers.tsx` orchestrates all city layers. It currently renders `DroneLayer` and `AirspaceZoneLayer`. It will add the 5 new layers, each gated by `cityLayers.has(layerKey)`.

### Event Feed Integration

`EventFeedPanel` city section currently shows only drones. It will merge items from all active city layers into a unified feed sorted by timestamp/severity. Each item type gets its own severity mapping and click handler to open the EntityPanel.

New feed item types:
- Traffic: severity badge from delay magnitude, click → fly to location + show details
- Weather: severity from NWS severity field, click → show alert details + instructions
- Crime: severity from violent/property/other classification, click → fly to location
- Aircraft: severity from altitude (lower = higher attention), click → show aircraft details
- Power: severity from customers affected count, click → show outage details

### Entity Panel Details

5 new detail components (or sections within existing EntityPanel):
- `TrafficDetail` — category, delay, description, start/end times
- `WeatherDetail` — event type, severity, headline, full description, instructions, onset/expiry
- `CrimeDetail` — crime type, description, city, timestamp, location
- `AircraftDetail` — callsign, altitude, speed, heading, squawk code
- `PowerDetail` — county, utility, customers affected, cause, estimated restoration

### Store Changes

```typescript
// CityLayer type expands (in types/index.ts)
export type CityLayer = 'uas' | 'zones' | 'traffic' | 'weather' | 'crime' | 'aircraft' | 'power'

// Entity type expands — full union after changes
export interface Entity {
  type: 'incident' | 'node' | 'satellite' | 'vessel' | 'drone' | 'news' | 'cyberNews'
      | 'newsCluster' | 'actorProfile' | 'edgeDetail' | 'cyberCluster'
      | 'traffic' | 'weatherAlert' | 'crime' | 'aircraft' | 'powerOutage'
  data: GlobalIncident | CyberNode | Satellite | AISVessel | DroneFlight | NewsArticle
      | CyberNewsArticle | NewsArticle[] | ActorProfile | CyberNewsArticle[] | CyberClusterData
      | TrafficIncident | WeatherAlert | CrimeIncident | LowAltAircraft | PowerOutage
}
```

Store initialization change in `src/store/index.ts`:
```typescript
// Before:
cityLayers: new Set<CityLayer>(['uas', 'zones']),
// After:
cityLayers: new Set<CityLayer>(['uas', 'zones', 'traffic', 'weather', 'aircraft']),
```

Crime and power default to OFF (denser/noisier, opt-in).

### StatusBar Dropdown

The `CityLayerDropdown` component (defined in `src/components/panels/StatusBar/index.tsx`, rendered in the top StatusBar — NOT the old bottom-right `CityLayerToggles` which was already removed) expands from 2 to 7 items:

| Layer | Color | Default |
|-------|-------|---------|
| UAS | `#7b2fff` | ON |
| ZONES | `#ffaa00` | ON |
| TRAFFIC | `#ff2d2d` | ON |
| WEATHER | `#00d4ff` | ON |
| CRIME | `#ff6b35` | OFF |
| AIRCRAFT | `#3b82f6` | ON |
| POWER | `#fbbf24` | OFF |

## Non-Goals

- No historical crime analytics or trend analysis — this is a live/recent overlay only
- No traffic routing or ETA calculations
- No weather forecast — only active alerts
- No integration with proprietary systems (ShotSpotter, RMS, CAD)
- No RF/signals layer (WiGLE, cell towers) — can be added later if needed
