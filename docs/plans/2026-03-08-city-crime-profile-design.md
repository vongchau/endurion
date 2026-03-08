# City View — FBI Crime Profile Integration — Design

**Date:** 2026-03-08
**Status:** Approved
**Goal:** Integrate FBI Crime Data Explorer API into the City View — multi-city selection with a futuristic crime profile panel showing 10-year trends, weapon breakdowns, demographics, and time-of-day statistics.

---

## Objective

Replace the fixed NYC-only City View with a multi-city intelligence surface. Users select from 12 major US cities via map pins or a search overlay. Selecting a city flies the map to it and opens a dedicated `CrimeProfilePanel` with chart-heavy crime data sourced from the FBI CDE API, served through the existing Hono proxy with a 24h cache.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Hono Server (existing)                         │
│                                                 │
│  NEW: GET /api/crime/:ori                       │
│  ┌─────────────────────────────────────────┐    │
│  │  24h in-memory cache keyed by ORI       │    │
│  │  On miss → fetch FBI CDE API (5 calls)  │    │
│  │  On hit  → return cached payload        │    │
│  └─────────────────────────────────────────┘    │
└───────────────────┬─────────────────────────────┘
                    │ fetch on city select
┌───────────────────▼─────────────────────────────┐
│  React Frontend                                 │
│                                                 │
│  City View (zoomed out, US-wide, zoom 3.5)      │
│  ├── CityPins — clickable city markers          │
│  ├── CitySearch — search/filter overlay         │
│  └── CityMarkers — local POIs after city select │
│                                                 │
│  CrimeProfilePanel (slides in from right)       │
│  ├── 10-year crime trend (LineChart)            │
│  ├── Top offenses (BarChart)                    │
│  ├── Weapon breakdown (BarChart)                │
│  ├── Offender vs victim demographics (BarChart) │
│  └── Time-of-day (24-bar histogram)             │
└─────────────────────────────────────────────────┘
```

**Key invariants:**
- The Hono server proxies all FBI CDE calls — the API key never reaches the browser
- 24h cache means upstream API is hit at most once per city per day
- `CrimeProfilePanel` is a dedicated component, not reusing EntityPanel — crime profiles are too rich for the shared panel

---

## Preset Cities

12 major US cities with ORI codes, coordinates, and zoom levels:

```ts
{ id: 'nyc',  name: 'New York City',  state: 'NY', ori: 'NY0303000', lat: 40.7128,  lng: -74.0060,   zoom: 11 }
{ id: 'la',   name: 'Los Angeles',    state: 'CA', ori: 'CA0190200', lat: 34.0522,  lng: -118.2437,  zoom: 10 }
{ id: 'chi',  name: 'Chicago',        state: 'IL', ori: 'IL0160000', lat: 41.8781,  lng: -87.6298,   zoom: 11 }
{ id: 'hou',  name: 'Houston',        state: 'TX', ori: 'TX2010000', lat: 29.7604,  lng: -95.3698,   zoom: 10 }
{ id: 'phx',  name: 'Phoenix',        state: 'AZ', ori: 'AZ0020100', lat: 33.4484,  lng: -112.0740,  zoom: 10 }
{ id: 'phi',  name: 'Philadelphia',   state: 'PA', ori: 'PA5160100', lat: 39.9526,  lng: -75.1652,   zoom: 11 }
{ id: 'sa',   name: 'San Antonio',    state: 'TX', ori: 'TX2010300', lat: 29.4241,  lng: -98.4936,   zoom: 10 }
{ id: 'dal',  name: 'Dallas',         state: 'TX', ori: 'TX0570000', lat: 32.7767,  lng: -96.7970,   zoom: 11 }
{ id: 'det',  name: 'Detroit',        state: 'MI', ori: 'MI1820000', lat: 42.3314,  lng: -83.0458,   zoom: 11 }
{ id: 'atl',  name: 'Atlanta',        state: 'GA', ori: 'GA0440200', lat: 33.7490,  lng: -84.3880,   zoom: 11 }
{ id: 'sd',   name: 'San Diego',      state: 'CA', ori: 'CA0370200', lat: 32.7157,  lng: -117.1611,  zoom: 10 }
{ id: 'mia',  name: 'Miami',          state: 'FL', ori: 'FL0130100', lat: 25.7617,  lng: -80.1918,   zoom: 11 }
```

---

## Data Model

### `CityProfile`

```ts
interface CityProfile {
  id: string
  name: string
  state: string
  ori: string       // FBI ORI code for this city's primary PD
  lat: number
  lng: number
  zoom: number
}
```

### `CrimeProfileResponse`

```ts
interface CrimeProfileResponse {
  city: string
  ori: string
  fetchedAt: string
  trend: Array<{ year: number; count: number }>
  offenses: Array<{ offense: string; count: number }>
  weapons: Array<{ weapon: string; count: number }>
  offenderDemo: {
    age: Record<string, number>
    race: Record<string, number>
    sex: Record<string, number>
  }
  victimDemo: {
    age: Record<string, number>
    race: Record<string, number>
    sex: Record<string, number>
  }
  timeOfDay: Array<{ hour: number; count: number }>   // 24 entries, index = hour
}
```

---

## Server Structure

### New files

```
server/sources/fbi.ts       — fetches & normalizes all 5 FBI CDE endpoints in parallel
server/routes/crime.ts      — GET /api/crime/:ori with 24h in-memory cache
```

### FBI CDE endpoints fetched per ORI

```
GET /agencies/{ori}                                        → agency name / verification
GET /summarized/agency/{ori}/offenses/count/annual         → 10-year crime trend
GET /nibrs/violent-crime/weapons/agencies/{ori}/count      → weapon breakdown
GET /nibrs/violent-crime/offender/agencies/{ori}/count     → offender demographics
GET /nibrs/violent-crime/victim/agencies/{ori}/count       → victim demographics + time-of-day
```

All requests append `?api_key=FBI_CDE_API_KEY`.

### Cache

```ts
// 24h TTL, keyed by ORI
const crimeCache = new Map<string, { data: CrimeProfileResponse; expiresAt: number }>()
```

On cache miss: fetch all 5 endpoints in parallel via `Promise.allSettled`, normalize, store.
On cache hit: return immediately.
On upstream failure: return last cached value if available, else `503`.

### Route registration

In `server/index.ts`:
```ts
import { crimeRoute } from './routes/crime'
app.route('/api/crime', crimeRoute)
```

---

## Frontend Structure

### New files

```
src/data/cities.ts                    — CITIES array + CityProfile type
src/views/city/CityPins.tsx           — glowing pulse markers for zoomed-out US view
src/views/city/CitySearch.tsx         — terminal-style search/filter overlay (top-left)
src/views/city/CrimeProfilePanel.tsx  — full right-hand panel with Recharts charts
src/hooks/useCrimeProfile.ts          — fetches /api/crime/:ori, returns { data, loading, error }
```

### Modified files

```
src/types/index.ts          — add CityProfile, CrimeProfileResponse
src/store/index.ts          — add selectedCity: CityProfile | null, setSelectedCity()
src/components/MapCanvas/   — city view initial state: zoom 3.5, lng -96, lat 38 (US center)
src/views/city/CityMarkers  — only render POI heatmap/markers when selectedCity !== null
src/App.tsx                 — mount <CrimeProfilePanel /> alongside existing panels
server/index.ts             — register crime route
package.json                — add recharts
.env.example                — add FBI_CDE_API_KEY
```

---

## City Selection UX

**Default state:** City View opens zoomed out to the continental US (`zoom: 3.5`, centered `lng: -96, lat: 38`). CityPins renders 12 glowing cyan pulse dots.

**CityPins:**
- Idle: small cyan pulse dot
- Hover: city name label appears
- Click: `setSelectedCity(city)` → map flies to city coordinates + zoom → `CrimeProfilePanel` slides in

**CitySearch (top-left overlay):**
```
[ ◉ SEARCH CITY _________________ ]
  NYC  ·  LA  ·  CHI  ·  HOU  ·  PHX ...
```
- Typing filters the preset list
- Clicking a result triggers same flow as pin click
- `ESC` clears focus

**After city select:**
- Map flies to city coordinates
- `CrimeProfilePanel` animates in from right
- Local POI heatmap renders
- `← ALL CITIES` button in panel header resets `selectedCity` to null → map flies back to US view

---

## Crime Profile Panel Layout

Fixed right panel, `w-96` (384px), full height, Framer Motion slide-in from `x: 100%`.

```
┌────────────────────────────────────────┐
│ ← ALL CITIES    NEW YORK CITY · NYPD  │  sticky header
│ CRIME PROFILE 2015–2024               │
├────────────────────────────────────────┤
│ 10-YEAR VIOLENT CRIME TREND           │
│ [LineChart — year × count]            │  cyan line, no grid
├────────────────────────────────────────┤
│ TOP OFFENSES                          │
│ [HorizontalBarChart — top 6]          │  amber bars
├────────────────────────────────────────┤
│ WEAPONS                               │
│ [HorizontalBarChart — top 5]          │  red bars
├────────────────────────────────────────┤
│ DEMOGRAPHICS          OFFENDER VICTIM │
│ [Grouped BarChart — age/race/sex]     │  purple + green
├────────────────────────────────────────┤
│ TIME OF DAY (24H)                     │
│ [BarChart — 24 bars]                  │  gradient dim→cyan
└────────────────────────────────────────┘
```

**Loading:** Each section shows a scanning pulse bar skeleton.
**Error:** `SIGNAL LOST — {endpoint}` in dim red per failed section.
**Scroll:** Panel body scrolls; header is sticky.

---

## Environment Variables

```env
FBI_CDE_API_KEY=        # from api.data.gov/signup — server-side only
```

---

## What This Does Not Include

- Precinct-level breakdowns (requires NYPD Open Data — separate design)
- User-added cities beyond the preset 12
- Property crime breakdowns (only violent crime from NIBRS — consistent data across all cities)
- Historical data persistence (24h in-memory cache only)
