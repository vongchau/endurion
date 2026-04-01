# Maritime Page: IUU Vessel Detection with EEZ Monitoring

## Overview

A dedicated Maritime view for the Endurion HUD that cross-references live AIS vessel data against an IUU (Illegal, Unreported, Unregulated) fishing vessel list stored in SQLite, and alerts when a matched vessel enters an Exclusive Economic Zone (EEZ). EEZ boundaries are fetched from marineregions.org and cached locally.

## Data Sources

- **IUU List**: `IUUList-20260401.xls` — parsed with the `xlsx` npm package, stored in SQLite
- **AIS Stream**: Live WebSocket from `aisstream.io` (existing `server/ais.ts` + `server/aisCache.ts`)
- **EEZ Boundaries**: GeoJSON MultiPolygons from `geo.vliz.be` WFS endpoint, sourced via `marineregions.org` REST gazetteer API

## Architecture

### Data Layer

**IUU SQLite Table** (`server/iuuDb.ts`)
- Parse `IUUList-20260401.xls` at server startup using the `xlsx` npm package
- Store in `better-sqlite3` (same pattern as `droneDb.ts`) with columns: `mmsi`, `imo`, `name`, `call_sign`, `flag`, `listed_date`, `listing_authority`, `reason`
- Build in-memory hash maps: `Map<number, IUURecord>` keyed by MMSI and `Map<number, IUURecord>` keyed by IMO for O(1) lookups
- Skip re-import if table already populated and XLS unchanged

**EEZ Cache** (`server/eezCache.ts`)
- On first boot, fetch all EEZ records from `marineregions.org/rest/getGazetteerRecordsByType.json/EEZ/` (paginated, ~160 records)
- For each MRGID, fetch GeoJSON polygon from `geo.vliz.be/geoserver/MarineRegions/ows` WFS endpoint
- Save full FeatureCollection to `data/eez-cache.json` on disk
- Subsequent boots load from cache (skip API calls)
- Expose `getEEZFeatureCollection()` for the frontend and `findEEZsContainingPoint(lat, lng)` for server-side point-in-polygon checks using ray-casting

**IUU Cross-Reference** (`server/iuuMatcher.ts`)
- **On every AIS message** (in `ais.ts`): O(1) hash lookup against MMSI and IMO maps. If matched, tag vessel in `aisCache` with `iuuMatch: { confidence, record }`
- **Every 30 seconds** (server interval): For all IUU-tagged vessels, run `findEEZsContainingPoint(lat, lng)`. If inside an EEZ, emit alert to in-memory alert store
- **Tiered confidence**:
  - HIGH: MMSI + IMO match
  - MEDIUM: name + callSign match
  - LOW: single-field match

### API Endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/maritime/eez` | Full EEZ GeoJSON FeatureCollection (from disk cache) |
| `GET /api/maritime/iuu/vessels` | Currently active IUU-matched vessels with confidence level, matched fields, current position |
| `GET /api/maritime/iuu/alerts` | Recent IUU-in-EEZ alert history (timestamped, newest first, capped at 200) |
| `GET /api/maritime/vessels` | All vessels from existing AIS cache |

### Frontend Hooks

- `useEEZ()` — fetch and cache EEZ FeatureCollection once
- `useIUUAlerts()` — poll `/api/maritime/iuu/alerts` every 15 seconds
- `useIUUVessels()` — poll `/api/maritime/iuu/vessels` every 15 seconds
- Reuses existing AIS vessel data path for full vessel feed

## UI Design

### Map Layers (`MaritimeLayer.tsx`)

- **EEZ polygons**: Semi-transparent fill (`#00d4ff` at 0.05 opacity) with dashed border lines. Labels at polygon centroids showing country name
- **All AIS vessels**: Small dots colored by ship type (reuses `getShipTypeColor`)
- **IUU-flagged vessels**: Pulsing red markers with glow effect. Size scaled by confidence
- **Active EEZ violations**: Violated EEZ polygon gets red-tinted fill

### Left Panel (`MaritimeFeedPanel.tsx`)

- **IUU ALERTS section** (top): Red-bordered alert cards — vessel name, MMSI, confidence, EEZ name, time. HIGH confidence alerts have pulsing indicator
- **VESSEL FEED section** (below): Scrollable list of all AIS vessels, filterable by ship type. IUU-matched vessels shown with red left border and confidence badge

### Entity Panel (`IUUVesselDetail.tsx`)

New detail component for IUU-matched vessels showing: vessel info, IUU listing details (authority, reason, date), match confidence breakdown, current EEZ if any, lat/lng.

### Navigation

- `ViewMode` type adds `'maritime'`
- Keyboard shortcut: `5`
- CommandSwitcher gets maritime option

## File Structure

### New Files

```
server/
  iuuDb.ts              — Parse XLS, SQLite table, in-memory hash maps
  eezCache.ts           — Fetch/cache EEZ GeoJSON, point-in-polygon
  iuuMatcher.ts         — Real-time AIS tagging + periodic EEZ sweep

src/views/maritime/
  MaritimeLayer.tsx      — EEZ polygons, vessel dots, IUU markers
  MaritimeFeedPanel.tsx  — IUU alerts + vessel feed
  IUUVesselDetail.tsx    — Entity panel detail

src/hooks/
  useEEZ.ts             — Fetch EEZ FeatureCollection
  useIUUAlerts.ts       — Poll IUU alerts
  useIUUVessels.ts      — Poll IUU-matched vessels
```

### Modified Files

- `server/index.ts` — 4 new API routes
- `server/ais.ts` — hook IUU matcher into message handler
- `src/types/index.ts` — new types + `'maritime'` ViewMode
- `src/store/index.ts` — maritime in ViewMode
- `src/App.tsx` — mount MaritimeFeedPanel
- `src/components/MapCanvas/index.tsx` — render MaritimeLayer
- `src/components/panels/EntityPanel/index.tsx` — add IUUVesselDetail
- `src/hooks/useKeyboardShortcuts.ts` — key `5` = maritime
- `src/components/CommandSwitcher/index.tsx` — maritime option

### New Dependency

- `xlsx` — for parsing the `.xls` IUU list file

## Matching Strategy

Tiered confidence cross-referencing:

| Confidence | Criteria | Example |
|---|---|---|
| HIGH | MMSI + IMO both match | Definitive identification |
| MEDIUM | name + callSign match | Likely same vessel, changed identifiers |
| LOW | Single field match | Possible match, analyst review needed |

## Alert Lifecycle

1. AIS message arrives with MMSI/IMO
2. O(1) hash lookup against IUU maps — tag vessel if matched
3. Every 30s: point-in-polygon check for tagged vessels
4. If inside EEZ: create alert (vessel, IUU record, confidence, EEZ name, timestamp)
5. Alert appears in MaritimeFeedPanel and map highlights the violated EEZ
6. Analyst clicks alert to see full IUU details in EntityPanel
