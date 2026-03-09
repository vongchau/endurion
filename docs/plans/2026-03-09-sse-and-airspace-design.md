# SSE Drone Streaming & FAA Airspace Zones — Design

**Date:** 2026-03-09

## Feature 1: SSE Drone Streaming Bridge

### Problem
Dronetag Socket.io requires OIDC tokens; our auth uses API keys (PAT). REST polling adds double latency (browser→server→Dronetag).

### Solution
Server-Sent Events (SSE) bridge. Server polls Dronetag REST every 5s, pushes delta updates to all connected browser clients via SSE. Frontend replaces `setInterval` polling with an `EventSource` connection.

### Architecture

```
Browser ←──SSE──── Hono server ──REST poll 5s──→ Dronetag API
         push                     droneCache
```

### Server changes
- `server/droneCache.ts`: Add an event emitter. On each poll cycle, compare new data with previous cache and emit `update` events with the full drone list.
- `server/index.ts`: Add `GET /api/drones/stream` SSE endpoint. On connect, send current cache immediately, then forward emitter events as SSE `data:` frames. Track connected clients for cleanup.

### Client changes
- `src/hooks/useDrones.ts`: Replace `fetch` + `setInterval` with `EventSource` to `/api/drones/stream`. Send viewport as query params. On `message`, parse JSON and update state. Reconnects automatically (EventSource built-in).
- Viewport updates: Close and reopen EventSource when quantized bounds change. Server filters by bbox before sending.

### Fallback
If SSE connection fails, fall back to REST polling (existing behavior).

---

## Feature 2: FAA Airspace Zones Overlay

### Problem
Dronetag airspace zones endpoint is deprecated v1 API returning 404. Need alternative.

### Solution
FAA UAS Data Delivery System (ArcGIS Feature Service). Free, no auth required, returns GeoJSON with polygon geometries. US-only but reliable.

### Data sources
1. **Prohibited Areas** — `services6.arcgis.com/.../Prohibited_Areas/FeatureServer/0` — P-zones (DC, military)
2. **Controlled Airspace** — `services6.arcgis.com/.../Airspace/FeatureServer/0` — Class B/C/D, MODE-C

### Architecture

```
Browser ←──JSON──── Hono server ──REST──→ FAA ArcGIS
                    zoneCache (10min TTL)
```

### Server
- `server/sources/faaAirspace.ts`: Fetch from both FAA endpoints using bbox spatial query. Return merged GeoJSON FeatureCollection. Fields: NAME, TYPE_CODE, CLASS_CODE, upper/lower altitude.
- `server/zoneCache.ts`: Cache by quantized bbox with 10min TTL (airspace zones don't change frequently).
- `server/index.ts`: Add `GET /api/airspace/zones` endpoint accepting viewport bounds.

### Client
- `src/hooks/useAirspaceZones.ts`: Fetch zones on viewport change (debounced). Cache in state.
- `src/views/city/AirspaceZoneLayer.tsx`: Mapbox `fill` + `line` layers rendering zone polygons.
  - Prohibited (P): red fill `#ff2d2d20`, red border
  - Restricted (R): amber fill `#ffaa0020`, amber border
  - Class B/C/D / MODE-C: cyan fill `#00d4ff10`, cyan border
- `src/views/city/CityLayerToggles.tsx`: Add "ZONES" toggle (amber colored).
- `src/types/index.ts`: Add `'zones'` to `CityLayer` union.

### Interaction
- Zones render below drone points (layer ordering)
- Clicking a zone could show name/type in EntityPanel (stretch goal)
