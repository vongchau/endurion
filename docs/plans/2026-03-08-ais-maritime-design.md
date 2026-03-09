# AISStream Maritime Intelligence — Global View Design

**Date:** 2026-03-08
**Status:** Approved
**Goal:** Integrate AISStream.io real-time AIS data into the global view — vessel density heatmap, military candidate markers, chokepoint status panel, and disruption alerts in the event feed.

---

## Objective

Add a fourth intelligence layer (`maritime`) to the global view powered by a persistent WebSocket connection to AISStream.io. The server maintains one connection regardless of browser client count. The frontend visualizes vessel density as a heatmap, suspected military/naval vessels as directional markers, strategic chokepoints as a live status panel, and disruption events (chokepoint congestion, dark ships) in the EventFeedPanel.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Hono Server (existing)                              │
│                                                      │
│  NEW: server/ais.ts — WebSocket lifecycle            │
│  ┌────────────────────────────────────────────┐      │
│  │  wss://stream.aisstream.io/v0/stream       │      │
│  │  ├── global coverage bounding box          │      │
│  │  ├── message types: PositionReport,        │      │
│  │  │   ShipStaticData, ClassBPositionReport  │      │
│  │  └── auto-reconnect on close/error (10s)   │      │
│  └───────────────┬────────────────────────────┘      │
│                  ▼                                   │
│  NEW: server/aisCache.ts — in-memory stores          │
│  ├── vesselCache        Map<mmsi, Vessel>  (max 50k) │
│  ├── densityGrid        Map<key, DensityCell> (2°)   │
│  ├── militaryCandidates Map<mmsi, Candidate>         │
│  └── disruption detection (chokepoints + dark ships) │
│                  ▼                                   │
│  GET /api/vessels/density      → VesselDensityZone[] │
│  GET /api/vessels/military     → MilitaryCandidate[] │
│  GET /api/vessels/chokepoints  → Chokepoint[]        │
│  GET /api/vessels/disruptions  → AISDisruption[]     │
│  GET /api/vessels/stats        → connection status   │
└───────────────────┬──────────────────────────────────┘
                    │ poll every 10s (density + military)
                    │ poll every 30s (disruptions)
┌───────────────────▼──────────────────────────────────┐
│  React Frontend                                      │
│                                                      │
│  GlobalLayer extended: 'maritime' (4th toggle, green)│
│  useVessels()      — density + military candidates   │
│  useDisruptions()  — disruption event feed           │
│                                                      │
│  GlobalMarkers                                       │
│  ├── PulseMarker (incidents) — unchanged             │
│  ├── FlightMarker (OpenSky) — unchanged              │
│  ├── VesselDensityLayer — Mapbox heatmap Source+Layer│
│  └── VesselMarker — military candidates, ship icon   │
│                                                      │
│  ChokepointPanel — fixed overlay, bottom-left        │
│  EventFeedPanel  — [AIS] disruption items            │
└──────────────────────────────────────────────────────┘
```

**Key invariant:** One persistent WebSocket connection on the server — never multiplied by browser clients. Stale vessels (>30 min) cleaned up every 5 minutes. Routes read exclusively from cache — never block on the WebSocket.

---

## Data Model

### New types (`src/types/index.ts`)

```ts
export interface AISVessel {
  mmsi: number
  name: string
  lat: number
  lng: number
  speed: number       // knots
  heading: number     // degrees 0–360
  shipType: number    // AIS ship type code
  shipTypeName: string
  timestamp: number
}

export interface VesselDensityZone {
  lat: number
  lng: number
  intensity: number   // 0–1 log-normalized
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
  reason: string      // e.g. "Naval prefix: USS IOWA" or "Ship type 35"
  timestamp: number
}

export interface Chokepoint {
  name: string
  lat: number
  lng: number
  radius: number
  vesselCount: number
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

### Extended `GlobalLayer`

```ts
export type GlobalLayer = 'conflict' | 'disaster' | 'military' | 'maritime'
```

---

## Server Structure

### `server/ais.ts` — WebSocket lifecycle

Manages the persistent connection to `wss://stream.aisstream.io/v0/stream`. Responsibilities:
- Connect with global bounding box subscription (`[[-90,-180],[90,180]]`)
- Filter message types: `PositionReport`, `ShipStaticData`, `StandardClassBPositionReport`
- Parse each message → update `aisCache`
- Auto-reconnect after 10s on close/error
- Export `startAis()` called from `server/index.ts`

### `server/aisCache.ts` — in-memory intelligence store

```
vesselCache        Map<mmsi, AISVessel>          max 50,000 vessels
densityGrid        Map<gridKey, DensityCell>     2° lat/lng grid
militaryCandidates Map<mmsi, MilitaryCandidate>  retained 2h
```

**Military detection** (same logic as reference implementation):
- Ship type 35 or 55 → military
- Ship type 50–59 → special craft (include)
- Name matches `/^(USS|USNS|HMS|HMAS|HMCS|INS|JS|ROKS|TCG|FS|BNS|RFS|CGC|PNS|KRI|ITS|SNS)/i`
- MMSI suffix pattern `00xxxxx` or `99xxxxx`

**Chokepoints monitored (12):**
Strait of Hormuz, Suez Canal, Strait of Malacca, Bab el-Mandeb, Panama Canal, Taiwan Strait, South China Sea, Black Sea, Gibraltar, English Channel, Dardanelles, Mozambique Channel.

**Disruption detection:**
- Chokepoint congestion: vessel count > 1.5× normal traffic → `high`; > normal → `elevated`; ≥ 3 → `low`
- Dark ship: vessels with AIS gap > 1h that reappear within 10 min

**Cleanup:** stale vessels (>30 min) evicted every 5 min. Density grid pruned to active cells.

### API Routes

```
GET /api/vessels/density      → VesselDensityZone[]    (top 200 zones, log-normalized)
GET /api/vessels/military     → MilitaryCandidate[]    (max 500, sorted newest-first)
GET /api/vessels/chokepoints  → Chokepoint[]           (all 12, with live vessel counts)
GET /api/vessels/disruptions  → AISDisruption[]        (active disruptions)
GET /api/vessels/stats        → { connected, vessels, messages, byType }
```

All routes registered in `server/index.ts` via a Hono sub-app.

---

## Frontend Structure

### New files

```
src/hooks/useVessels.ts                 — polls /density + /military every 10s
src/hooks/useDisruptions.ts             — polls /disruptions every 30s
src/views/global/VesselDensityLayer.tsx — Mapbox heatmap Source + Layer
src/views/global/ChokepointPanel.tsx    — fixed bottom-left overlay
```

### Modified files

```
src/types/index.ts             — new interfaces + extend GlobalLayer
src/store/index.ts             — add 'maritime' to default globalLayers Set
src/views/global/LayerToggles  — add MARITIME pill (#00ff88 green)
src/views/global/GlobalMarkers — add VesselDensityLayer + VesselMarker
src/components/panels/EventFeedPanel — add [AIS] disruption items
server/index.ts                — register /api/vessels/* routes, call startAis()
.env.example                   — add AISSTREAM_API_KEY
```

---

## Frontend Visualization

### VesselDensityLayer

Mapbox `<Source type="geojson">` + `<Layer type="heatmap">`. Color ramp:
```
0.0  → transparent
0.3  → rgba(0, 255, 136, 0.4)   green
0.6  → rgba(255, 170, 0, 0.7)   amber
1.0  → rgba(255, 45, 45, 1.0)   red
```
Radius scales with zoom. Only rendered when `'maritime'` layer active.

### VesselMarker

Small `▲` SVG rotated by `heading`, green (`#00ff88`), 10×10px. Click → `setSelectedEntity({ type: 'vessel', data: candidate })` → EntityPanel. Only rendered when `'maritime'` layer active.

### ChokepointPanel

Fixed overlay, bottom-left, above LayerToggles. Only visible when `'maritime'` layer active.

```
┌──────────────────────────────┐
│ ◈ CHOKEPOINTS                │
│ Strait of Hormuz    ████  47 │
│ Suez Canal          ██    12 │
│ Strait of Malacca   █████ 83 │
│ ...                          │
└──────────────────────────────┘
```

Bar width proportional to vessel count (max bar = highest count). Color: green < 20, amber 20–50, red > 50 vessels.

### EventFeedPanel

Disruptions added to global view items with `[AIS]` source badge:
- `chokepoint_congestion` → severity amber/red, label = chokepoint name
- `dark_ship` → severity red, label = "AIS GAP SPIKE"

---

## Layer Toggle

```
[● CONFLICT]  [● DISASTER]  [● MILITARY]  [● MARITIME]
```

MARITIME color: `#00ff88` (green — distinct from cyan military aircraft).

---

## Environment Variables

```env
AISSTREAM_API_KEY=    # from aisstream.io — server-side only
```

---

## What This Does Not Include

- Individual vessel markers for all 50k vessels (too many for Mapbox markers — density layer covers this)
- Vessel detail panel for non-military vessels
- AIS message relay to frontend via WebSocket (HTTP polling is sufficient)
- Historical AIS data or vessel track playback
- Per-vessel route prediction
