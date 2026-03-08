# Global View Live Data Integration — Design

**Date:** 2026-03-08
**Status:** Approved
**Goal:** Replace hardcoded mock incidents in the global view with real-time data from conflict, disaster, and military tracking sources.

---

## Objective

Operational utility: only real, sourced data. No synthetic or dramatized events. The global view becomes a genuine intelligence surface for conflict & unrest, natural disasters, and live military flights.

**Out of scope (separate design):** Cyber IOCs and infrastructure stress go into the Cyber view.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Hono Server  (server/)                             │
│                                                     │
│  Poller loop (30s)                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  USGS    │ │  GDACS   │ │  EONET   │  Disasters │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       └────────────┴────────────┘                   │
│                    │ normalize → GlobalIncident[]    │
│  ┌──────────┐      │                                │
│  │  ACLED   │──────┤  Conflict & Unrest             │
│  └──────────┘      │                                │
│                    ▼                                │
│             in-memory cache                         │
│                    │                                │
│  ┌──────────┐      │                                │
│  │ OpenSky  │──────► /api/flights                  │
│  └──────────┘                                       │
│                    ▼                                │
│             GET /api/incidents                      │
└───────────────────┬─────────────────────────────────┘
                    │ fetch every 30s
┌───────────────────▼─────────────────────────────────┐
│  React Frontend                                     │
│  useGlobalData() + useFlights()                     │
│  GlobalMarkers — incidents (pulse) + flights (icon) │
│  EventFeedPanel — live count + source badges        │
│  LayerToggles — Conflict / Disaster / Military      │
└─────────────────────────────────────────────────────┘
```

**Key invariant:** the server fetches all upstream sources once per 30s cycle regardless of browser client count. Clients always read from the in-memory cache — upstream rate limits are never client-multiplied.

---

## Data Sources

### Disasters (no API keys required)

| Source | Endpoint | Data |
|--------|----------|------|
| USGS | `earthquake.usgs.gov/fdsnws/event/1/query` | M4.5+ earthquakes, GeoJSON |
| GDACS | `gdacs.org/xml/rss.xml` | Floods, cyclones, volcanoes (RSS) |
| NASA EONET | `eonet.gsfc.nasa.gov/api/v3/events` | Wildfires, storms — 7-day open events |

### Conflict & Unrest (free researcher API key)

| Source | Endpoint | Data |
|--------|----------|------|
| ACLED | `api.acleddata.com/acled/read` | Battles, protests, explosions — 30-day window |

### Military Flights (free OpenSky account)

| Source | Endpoint | Data |
|--------|----------|------|
| OpenSky | `opensky-network.org/api/states/all` | All ADS-B transponders (~10k aircraft) |

OpenSky returns all aircraft globally. Military filtering uses ICAO 24-bit address ranges per country military blocks and callsign patterns (`RCH`, `EVAC`, `NATO`, `RRR`, etc.).

---

## Data Model

### Extended `GlobalIncident` (add two fields)

```ts
interface GlobalIncident {
  id: string
  lat: number
  lng: number
  country: string
  type: string
  severity: Severity
  timestamp: string
  summary: string
  source: 'usgs' | 'gdacs' | 'eonet' | 'acled'  // NEW
  url?: string                                     // NEW — link to original event
}
```

### New `MilitaryFlight`

```ts
interface MilitaryFlight {
  id: string        // ICAO 24-bit hex
  callsign: string
  lat: number
  lng: number
  altitude: number  // meters
  velocity: number  // m/s
  heading: number   // degrees 0–360
  country: string
  timestamp: string
}
```

### Deduplication

USGS and GDACS both report earthquakes. Deduplicate on a `0.1°` geographic grid + same event type within a 30-minute window (Haversine-equivalent, same strategy as WorldMonitor).

---

## Server Structure

```
server/
  index.ts          # Hono app — registers routes, starts poller on boot
  poller.ts         # 30s interval loop, calls all sources, writes cache
  cache.ts          # In-memory store with last-known-good fallback per source
  sources/
    usgs.ts         # Fetch GeoJSON + normalize → GlobalIncident[]
    gdacs.ts        # Parse RSS XML + normalize → GlobalIncident[]
    eonet.ts        # Fetch JSON + normalize → GlobalIncident[]
    acled.ts        # Fetch JSON + normalize → GlobalIncident[]
    opensky.ts      # Fetch states + filter military → MilitaryFlight[]
```

### API Routes

```
GET /api/incidents   → GlobalIncident[]    (merged + deduplicated)
GET /api/flights     → MilitaryFlight[]
```

Both routes read exclusively from cache — they never block on upstream fetches.

### Startup Behavior

On first boot, the server performs one full fetch across all sources before accepting connections. No empty-state on first client load.

### Failure Behavior

If an upstream source fails, its last successful payload remains in cache with a `stale: true` flag. The frontend displays a "last updated X min ago" indicator per source in the panel header.

### Dev Script

```json
"dev": "concurrently \"vite\" \"tsx watch server/index.ts\""
```

---

## Frontend Changes

### Deleted
- `src/data/global-incidents.ts` — hardcoded mock data removed entirely

### New Files
- `src/hooks/useGlobalData.ts` — polls `/api/incidents` every 30s, returns `{ data, loading, lastUpdated }`
- `src/hooks/useFlights.ts` — polls `/api/flights` every 30s, returns `{ data, loading, lastUpdated }`
- `src/views/global/LayerToggles.tsx` — three toggle pills (Conflict / Disaster / Military), only visible in global view

### Modified Files

**`src/types/index.ts`**
- Add `source` and `url` fields to `GlobalIncident`
- Add `MilitaryFlight` interface

**`src/store/index.ts`**
- Add `globalLayers: Set<'conflict' | 'disaster' | 'military'>` (all on by default)
- Add `toggleGlobalLayer(layer)` action

**`src/views/global/GlobalMarkers.tsx`**
- Replace hardcoded data import with `useGlobalData()` + `useFlights()` hooks
- Filter rendered markers by active `globalLayers`
- Incidents → existing pulse dot (color by severity, unchanged)
- Flights → directional chevron rotated by `heading`, cyan, no pulse

**`src/components/panels/EventFeedPanel/index.tsx`**
- Replace hardcoded import with hook data
- Add source badge per item (`USGS`, `ACLED`, `EONET`, `GDACS`) in dim text
- Add live count to panel header: `LIVE EVENT FEED · 47`
- Filter items by active `globalLayers`

---

## Layer Toggle UI

Three pill buttons floating above the status bar, global view only:

```
[● CONFLICT]  [● DISASTER]  [● MILITARY]
```

- Active layer: filled pill, colored border
- Inactive: dim, no border
- Stored in Zustand — client-side filter only, no new fetch triggered

---

## Environment Variables

```env
ACLED_API_KEY=
ACLED_EMAIL=
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=
```

All keys server-side only. USGS, GDACS, and NASA EONET require no keys.

---

## What This Does Not Include

- AIS naval vessel tracking (complex WebSocket, future work)
- Cyber IOC layer (goes in Cyber view, separate design)
- Infrastructure stress layer (goes in Cyber view, separate design)
- Server-side persistence / Redis (in-memory cache only for now)
- User-configurable refresh rate
