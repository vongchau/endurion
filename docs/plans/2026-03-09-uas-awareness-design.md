# UAS Awareness Layer — City View Design

## Overview

Add a live drone tracking layer to the city view using the Dronetag Cloud Platform API. Renders real-time unmanned aircraft positions as purple markers on the map when zoomed into a city, controlled by a toggleable UAS layer button.

## Architecture

```
Dronetag API ──(10s poll)──> server/sources/dronetag.ts ──> server/droneCache.ts
                                                                    │
                                                          GET /api/drones/viewport
                                                                    │
                                                        useDrones(mapBounds) hook
                                                                    │
                                                ┌───────────────────┼──────────────┐
                                          DroneLayer          CityLayerToggles    EntityPanel
                                       (purple triangles)      (UAS toggle)     (DroneDetail)
```

## Backend

### server/sources/dronetag.ts

Fetches two Dronetag endpoints:

1. `GET /v2/airspace/telemetry/global-ua` — latest UA positions in bbox, `max_age=5`
2. `GET /v2/airspace/telemetry/ua` — richer telemetry (altitude, heading, speed, state) with `from=-PT5M` and same bbox

Auth: `Authorization: Bearer ${DRONETAG_API_KEY}`

### server/droneCache.ts

- In-memory `Map<string, DroneFlight>` keyed by operation_id
- Merges global-ua positions with ua telemetry details
- Exposes `getDronesInBounds(minLng, minLat, maxLng, maxLat)`
- Cleanup removes entries older than 5 minutes
- Polling is on-demand: route handler calls Dronetag if cache is stale (>10s since last fetch for that bbox region)

### Route

`GET /api/drones/viewport?minLng=&minLat=&maxLng=&maxLat=` — returns cached drones within bounds.

## Data Model

```typescript
export interface DroneFlight {
  id: string              // operation_id
  sensorId: string
  lat: number
  lng: number
  altitude: number        // meters MSL
  speed: number           // m/s horizontal
  verticalSpeed: number   // m/s
  heading: number         // degrees 0-360
  state: string           // 'grounded' | 'airborne' | etc.
  timestamp: number
}
```

Added to the Entity union type: `'drone'` entity type with `DroneFlight` data.

## Frontend

### useDrones(mapBounds)

- Polls `/api/drones/viewport` every 10s with current map bounds
- Only active when: activeView === 'city' AND selectedCity !== null AND cityLayers.has('uas')

### DroneLayer

- Mapbox Source + Layer rendering purple (#7b2fff) rotated triangles
- Circle radius interpolated by zoom level
- Altitude labels at minzoom 13 with collision avoidance

### CityLayerToggles

- New toggle bar for city view (mirrors global LayerToggles pattern)
- Single toggle: "UAS" in purple (#7b2fff)
- Stored as `cityLayers: Set<CityLayer>` in Zustand store
- Only visible when activeView === 'city' and selectedCity is set

### EntityPanel DroneDetail

When a drone marker is clicked:
- Operation ID, sensor ID
- Lat/lng, altitude (meters)
- Speed (m/s), vertical speed (m/s)
- Heading (degrees)
- Operational state
- Last seen timestamp

## Visual Design

- **Color**: Purple #7b2fff (distinct from cyan POIs, red incidents, green assets)
- **Marker**: Small rotated triangle, same SVG pattern as flight/vessel markers
- **Label**: Altitude in meters, minzoom 13

## Polling

- Frequency: 10 seconds
- max_age parameter: 5 minutes
- Matches AIS vessel polling cadence

## Out of Scope

- Historical flight trails
- Threat scoring / restricted airspace detection
- Drone-specific search/filter
- WebSocket streaming
