// server/droneCache.ts
import type { DroneFlight } from '../src/types'
import { fetchDronetag } from './sources/dronetag'

const STALE_MS       = 5 * 60 * 1000   // 5 min
const MIN_FETCH_GAP  = 10_000          // 10s between fetches

let droneCache  = new Map<string, DroneFlight>()
let lastFetchAt = 0
let lastBbox    = ''

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

export async function getDrones(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<DroneFlight[]> {
  const apiKey = process.env.DRONETAG_API_KEY
  if (!apiKey) return []

  const now = Date.now()
  const key = bboxKey(minLng, minLat, maxLng, maxLat)

  // Refetch if cache is stale or bbox changed significantly
  if (now - lastFetchAt > MIN_FETCH_GAP || key !== lastBbox) {
    try {
      const raw = await fetchDronetag(apiKey, minLng, minLat, maxLng, maxLat)
      // Replace cache with fresh data
      droneCache = new Map()
      for (const d of raw) {
        droneCache.set(d.operationId, {
          id: d.operationId,
          sensorId: d.sensorId,
          lat: d.lat,
          lng: d.lng,
          altitude: d.altitude,
          speed: d.speed,
          verticalSpeed: d.verticalSpeed,
          heading: d.heading,
          state: d.state,
          timestamp: d.timestamp,
        })
      }
      lastFetchAt = now
      lastBbox = key
    } catch (e) {
      console.error('[droneCache] fetch failed:', e)
    }
  }

  // Clean stale entries and return
  const cutoff = now - STALE_MS
  const results: DroneFlight[] = []
  for (const [id, d] of droneCache) {
    if (d.timestamp < cutoff) {
      droneCache.delete(id)
    } else {
      results.push(d)
    }
  }
  return results
}
