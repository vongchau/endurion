// src/views/space/useSatellites.ts
import { useState, useEffect, useRef } from 'react'
import * as satellite from 'satellite.js'
import type { Satellite } from '../../types'

// Fallback mock data shown when Celestrak is unreachable (CORS or network failure)
const MOCK_SATELLITES: Satellite[] = [
  { id: '25544', name: 'ISS (ZARYA)', lat: 40.7, lng: -74.0, altitude: 408, velocity: 7.66, inclination: 51.6, type: 'iss' },
  { id: 'mock-1', name: 'STARLINK-1007', lat: 53.0, lng: 20.0, altitude: 550, velocity: 7.59, inclination: 53.0, type: 'starlink' },
  { id: 'mock-2', name: 'STARLINK-1008', lat: -20.0, lng: 100.0, altitude: 548, velocity: 7.59, inclination: 53.0, type: 'starlink' },
  { id: 'mock-3', name: 'STARLINK-2001', lat: 10.0, lng: -30.0, altitude: 560, velocity: 7.58, inclination: 53.0, type: 'starlink' },
  { id: 'mock-4', name: 'STARLINK-3100', lat: -45.0, lng: 150.0, altitude: 545, velocity: 7.59, inclination: 53.0, type: 'starlink' },
]

export interface SatrecEntry {
  satrec: satellite.SatRec
  name: string
  id: string
  type: 'iss' | 'starlink'
  inclination: number // degrees, cached from satrec
}

function parseTLE(text: string, type: 'iss' | 'starlink'): SatrecEntry[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const entries: SatrecEntry[] = []

  // TLE format: 3 lines per satellite — name, line1, line2
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim()
    const line1 = lines[i + 1]
    const line2 = lines[i + 2]

    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue

    try {
      const satrec = satellite.twoline2satrec(line1, line2)
      const id = line1.slice(2, 7).trim()
      const inclination = parseFloat(line2.slice(8, 16).trim())
      entries.push({ satrec, name, id, type, inclination })
    } catch {
      // skip malformed TLE
    }
  }

  return entries
}

function computePositions(entries: SatrecEntry[]): Satellite[] {
  const now = new Date()
  const gmst = satellite.gstime(now)
  const results: Satellite[] = []

  for (const entry of entries) {
    try {
      const pv = satellite.propagate(entry.satrec, now)
      if (!pv || !pv.position || typeof pv.position === 'boolean') continue
      if (!pv.velocity || typeof pv.velocity === 'boolean') continue

      const pos = pv.position as satellite.EciVec3<number>
      const vel = pv.velocity as satellite.EciVec3<number>

      const geodetic = satellite.eciToGeodetic(pos, gmst)
      const lat = satellite.degreesLat(geodetic.latitude)
      const lng = satellite.degreesLong(geodetic.longitude)
      const altitude = geodetic.height // km

      // Skip satellites below ground (decayed orbits)
      if (altitude < 100) continue

      const velocity = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)

      results.push({
        id: entry.id,
        name: entry.name,
        lat,
        lng,
        altitude: Math.round(altitude),
        velocity: Math.round(velocity * 100) / 100,
        inclination: Math.round(entry.inclination * 10) / 10,
        type: entry.type,
      })
    } catch {
      // skip propagation failures (decayed or invalid TLEs)
    }
  }

  return results
}

/** Propagate a satrec ±45 min to produce an orbit track.
 *  Returns a MultiLineString split at antimeridian crossings. */
export function computeOrbitTrack(
  satrec: satellite.SatRec,
  halfWindowMin = 45,
  stepMin = 1,
): GeoJSON.Feature<GeoJSON.MultiLineString> | null {
  const now = new Date()
  const points: [number, number][] = []

  for (let offset = -halfWindowMin; offset <= halfWindowMin; offset += stepMin) {
    const t = new Date(now.getTime() + offset * 60_000)
    const gmst = satellite.gstime(t)
    try {
      const pv = satellite.propagate(satrec, t)
      if (!pv || !pv.position || typeof pv.position === 'boolean') continue
      const pos = pv.position as satellite.EciVec3<number>
      const geo = satellite.eciToGeodetic(pos, gmst)
      const lat = satellite.degreesLat(geo.latitude)
      const lng = satellite.degreesLong(geo.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      points.push([lng, lat])
    } catch {
      // skip propagation failure
    }
  }

  if (points.length < 2) return null

  // Split at antimeridian crossings (jump > 180°)
  const segments: [number, number][][] = [[points[0]]]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1][0]
    const curr = points[i][0]
    if (Math.abs(curr - prev) > 180) {
      segments.push([])
    }
    segments[segments.length - 1].push(points[i])
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: segments.filter(s => s.length >= 2),
    },
  }
}

export function buildGeoJSON(satellites: Satellite[]) {
  return {
    type: 'FeatureCollection' as const,
    features: satellites
      .filter(s => s.type === 'starlink')
      .map(s => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          name: s.name,
          altitude: s.altitude,
          velocity: s.velocity,
          inclination: s.inclination,
          type: s.type,
          lat: s.lat,
          lng: s.lng,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
      })),
  }
}

const TLE_API = '/api/tle'

interface UseSatellitesReturn {
  satellites: Satellite[]
  iss: Satellite | null
  geojson: ReturnType<typeof buildGeoJSON>
  loading: boolean
  usingMockData: boolean
  /** Parsed satrec entries — use with computeOrbitTrack() */
  satrecEntries: SatrecEntry[]
}

export function useSatellites(enabled = true): UseSatellitesReturn {
  const [entries, setEntries] = useState<SatrecEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [usingMockData, setUsingMockData] = useState(false)
  const [positions, setPositions] = useState<Satellite[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  // Fetch and parse TLEs only when enabled
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchTLEs() {
      try {
        const res = await fetch(TLE_API)
        if (!res.ok) throw new Error(`TLE API: ${res.status}`)
        const data = await res.json() as { iss: string; starlink: string }

        if (cancelled) return

        const issEntries = parseTLE(data.iss, 'iss')
        const starlinkEntries = parseTLE(data.starlink, 'starlink')
        setEntries([...issEntries, ...starlinkEntries])
        setUsingMockData(false)
      } catch {
        if (cancelled) return
        // Server TLE cache unavailable — use mock data
        setUsingMockData(true)
        setPositions(MOCK_SATELLITES)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchTLEs()
    return () => { cancelled = true }
  }, [enabled])

  // Recompute positions every 5 seconds once TLEs are loaded (only when enabled)
  useEffect(() => {
    if (!enabled || entries.length === 0) return

    const update = () => setPositions(computePositions(entries))
    update() // immediate first compute

    intervalRef.current = setInterval(update, 5000)
    return () => clearInterval(intervalRef.current)
  }, [entries, enabled])

  const iss = positions.find(s => s.type === 'iss') ?? null
  const geojson = buildGeoJSON(positions)

  return { satellites: positions, iss, geojson, loading, usingMockData, satrecEntries: entries }
}
