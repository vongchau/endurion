// src/views/space/groundStations.ts
import * as satellite from 'satellite.js'
import type { SatrecEntry } from './useSatellites'

export interface GroundStation {
  id: string
  name: string
  operator: string
  lat: number
  lng: number
  altKm: number
}

export const GROUND_STATIONS: GroundStation[] = [
  // NASA Near Earth Network (NEN)
  { id: 'ws',  name: 'White Sands',   operator: 'NASA NEN',   lat: 32.5007, lng: -106.6086, altKm: 1.45 },
  { id: 'wl',  name: 'Wallops',       operator: 'NASA NEN',   lat: 37.9402, lng: -75.4664,  altKm: 0.01 },
  { id: 'mc',  name: 'McMurdo',       operator: 'NASA NEN',   lat: -77.8460, lng: 166.6690, altKm: 0.01 },
  { id: 'sv',  name: 'Svalbard',      operator: 'NASA NEN',   lat: 78.2306, lng: 15.3894,   altKm: 0.01 },
  // ESA ESTRACK
  { id: 'kr',  name: 'Kiruna',        operator: 'ESA',        lat: 67.8575, lng: 20.9644,   altKm: 0.40 },
  { id: 'ko',  name: 'Kourou',        operator: 'ESA',        lat: 5.2521,  lng: -52.7844,  altKm: 0.01 },
  { id: 'ml',  name: 'Malindi',       operator: 'ESA',        lat: -2.9960, lng: 40.1940,   altKm: 0.01 },
  { id: 'rd',  name: 'Redu',          operator: 'ESA',        lat: 50.0020, lng: 5.1460,    altKm: 0.30 },
  // Other major stations
  { id: 'pg',  name: 'Punta Arenas',  operator: 'SSC',        lat: -53.1548, lng: -70.9113, altKm: 0.01 },
  { id: 'ag',  name: 'Alice Springs', operator: 'SSC',        lat: -23.6980, lng: 133.8807, altKm: 0.55 },
  { id: 'hw',  name: 'Hawaii',        operator: 'USAF',       lat: 21.5720, lng: -158.2660, altKm: 0.08 },
  { id: 'dg',  name: 'Diego Garcia',  operator: 'USAF',       lat: -7.3133, lng: 72.4229,   altKm: 0.01 },
  { id: 'as',  name: 'Ascension',     operator: 'USAF',       lat: -7.9696, lng: -14.3937,  altKm: 0.01 },
]

const MIN_ELEVATION_DEG = 5
const MIN_ELEVATION_RAD = (MIN_ELEVATION_DEG * Math.PI) / 180

export interface OverpassWindow {
  stationId: string
  stationName: string
  operator: string
  startTime: Date
  endTime: Date
  maxElevationDeg: number
  /** Orbit positions [lng, lat][] during this pass for track rendering */
  trackCoords: [number, number][]
}

/** Compute all overpass windows for a satellite over all ground stations in the next 24 hours. */
export function computeOverpasses(
  satrec: satellite.SatRec,
  stations: GroundStation[] = GROUND_STATIONS,
  hoursAhead = 24,
  stepMin = 1,
): OverpassWindow[] {
  const now = new Date()
  const totalSteps = Math.floor((hoursAhead * 60) / stepMin)
  const windows: OverpassWindow[] = []

  for (const station of stations) {
    const observerGd: satellite.GeodeticLocation = {
      longitude: satellite.degreesToRadians(station.lng) as satellite.Radians,
      latitude: satellite.degreesToRadians(station.lat) as satellite.Radians,
      height: station.altKm as satellite.Kilometer,
    }

    let inPass = false
    let passStart = now
    let maxElev = 0
    let trackCoords: [number, number][] = []

    for (let step = 0; step <= totalSteps; step++) {
      const t = new Date(now.getTime() + step * stepMin * 60_000)
      const gmst = satellite.gstime(t)

      try {
        const pv = satellite.propagate(satrec, t)
        if (!pv || !pv.position || typeof pv.position === 'boolean') continue

        const posEci = pv.position as satellite.EciVec3<number>
        const posEcf = satellite.eciToEcf(posEci, gmst)
        const lookAngles = satellite.ecfToLookAngles(observerGd, posEcf)
        const elevRad = lookAngles.elevation as number

        if (elevRad >= MIN_ELEVATION_RAD) {
          if (!inPass) {
            inPass = true
            passStart = t
            maxElev = elevRad
            trackCoords = []
          }
          if (elevRad > maxElev) maxElev = elevRad

          // Capture position for track rendering
          const geo = satellite.eciToGeodetic(posEci, gmst)
          const lat = satellite.degreesLat(geo.latitude)
          const lng = satellite.degreesLong(geo.longitude)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            trackCoords.push([lng, lat])
          }
        } else if (inPass) {
          // Pass ended
          windows.push({
            stationId: station.id,
            stationName: station.name,
            operator: station.operator,
            startTime: passStart,
            endTime: t,
            maxElevationDeg: (maxElev * 180) / Math.PI,
            trackCoords,
          })
          inPass = false
          maxElev = 0
          trackCoords = []
        }
      } catch {
        // skip propagation failure
      }
    }

    // Close any pass still in progress at end of window
    if (inPass && trackCoords.length >= 2) {
      windows.push({
        stationId: station.id,
        stationName: station.name,
        operator: station.operator,
        startTime: passStart,
        endTime: new Date(now.getTime() + totalSteps * stepMin * 60_000),
        maxElevationDeg: (maxElev * 180) / Math.PI,
        trackCoords,
      })
    }
  }

  // Sort by start time
  windows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  return windows
}

/** Build GeoJSON from overpass track segments with index and elevation-based opacity. */
export function overpassTracksToGeoJSON(
  windows: OverpassWindow[],
  highlightIdx: number | null = null,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: windows
      .filter(w => w.trackCoords.length >= 2)
      .map((w, i) => ({
        type: 'Feature' as const,
        properties: {
          idx: i,
          stationId: w.stationId,
          stationName: w.stationName,
          maxElevation: Math.round(w.maxElevationDeg),
          label: `${w.stationName.toUpperCase()} ${w.startTime.toISOString().slice(11, 16)} UTC`,
          // Opacity 0.3–1.0 based on max elevation (5°→90°)
          opacity: Math.min(1, 0.3 + (w.maxElevationDeg / 90) * 0.7),
          highlighted: highlightIdx === i ? 1 : 0,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: w.trackCoords,
        },
      })),
  }
}

/** Generate a GeoJSON circle polygon approximating a ground station's visibility footprint.
 *  Uses a simplified geometric horizon at LEO altitude (~550 km) with 5° min elevation. */
export function stationFootprintsToGeoJSON(
  stations: GroundStation[],
  selectedId: string | null = null,
): GeoJSON.FeatureCollection {
  const EARTH_RADIUS_KM = 6371
  // Approximate visibility radius at LEO for 5° min elevation: ~2000 km → ~18° great circle
  const FOOTPRINT_DEG = 18
  const POINTS = 64

  return {
    type: 'FeatureCollection',
    features: stations.map(gs => {
      const coords: [number, number][] = []
      for (let i = 0; i <= POINTS; i++) {
        const angle = (i / POINTS) * 2 * Math.PI
        const dLat = FOOTPRINT_DEG * Math.cos(angle)
        const dLng = FOOTPRINT_DEG * Math.sin(angle) / Math.cos((gs.lat * Math.PI) / 180)
        coords.push([gs.lng + dLng, gs.lat + dLat])
      }
      return {
        type: 'Feature' as const,
        properties: {
          stationId: gs.id,
          selected: selectedId === gs.id ? 1 : 0,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      }
    }),
  }
}
