# Space View Design

**Date:** 2026-03-08
**Goal:** Add a Space view to GothamHUD showing real-time ISS + Starlink satellite positions on a dark globe, with interactive entity selection.

---

## Architecture

A new `'space'` ViewMode renders a dark Mapbox globe with deeper black fog to simulate outer space. Satellite positions are fetched from Celestrak (TLE format), parsed with `satellite.js`, and recomputed every 5 seconds. Positions are pushed into a Mapbox GeoJSON Source + circle Layer for GPU-accelerated rendering of 500+ satellites. The ISS gets a dedicated `<Marker>` for visual distinction.

## Data Source

- **ISS:** `https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE`
- **Starlink:** `https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE`
- **Fallback:** Small set of mock satellites if CORS/network fails

## New Files

- `src/views/space/useSatellites.ts` — fetch TLEs, parse with satellite.js, compute positions every 5s, return GeoJSON + satellite array
- `src/views/space/SpaceLayer.tsx` — renders circle layer + ISS marker, handles map click events

## Modified Files

- `src/types/index.ts` — add `'space'` to ViewMode, add Satellite interface
- `src/components/MapCanvas/index.tsx` — add space view config + SpaceLayer
- `src/components/CommandSwitcher/index.tsx` — add SPACE button, key `4`
- `src/hooks/useKeyboardShortcuts.ts` — bind key `4` to space view
- `src/components/panels/StatusBar/index.tsx` — add space view label
- `src/components/panels/EventFeedPanel/index.tsx` — list satellites sorted by altitude for space view
- `src/components/panels/EntityPanel/index.tsx` — SatelliteDetail sub-component

## Types

```ts
export interface Satellite {
  id: string          // NORAD catalog number
  name: string        // e.g. "STARLINK-1234"
  lat: number
  lng: number
  altitude: number    // km
  velocity: number    // km/s
  inclination: number // degrees
  type: 'iss' | 'starlink'
}
```

## Visual Design

- **Starlink dots:** Small (4px), cyan `#00d4ff` at 60% opacity
- **ISS:** Larger dedicated marker, amber `#ffaa00`, pulsing ring
- **Globe fog:** Near-black (`rgb(2, 4, 8)`) for space atmosphere
- **Circle color:** Scaled by altitude — lower orbit = brighter

## Interaction

- Clicking a satellite dot: `map.queryRenderedFeatures` on the satellites layer → `setSelectedEntity` + open entity panel
- EntityPanel shows: name, NORAD ID, altitude, velocity, inclination, type badge
- EventFeedPanel lists top 10 satellites sorted by altitude descending

## Error Handling

- CORS failure → fall back to mock satellite data (5 pre-defined satellites)
- Parse error on individual TLE → skip that satellite silently
- Loading state shown in EventFeedPanel while fetch is in progress
