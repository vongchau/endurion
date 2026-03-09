// server/zoneCache.ts
import { fetchAirspaceZones, type AirspaceZone } from './sources/faaAirspace'

const TTL_MS = 10 * 60 * 1000  // 10 min

interface CacheEntry {
  zones: AirspaceZone[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 10) / 10
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

export async function getZones(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<AirspaceZone[]> {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  const now = Date.now()
  const cached = cache.get(key)

  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.zones
  }

  const zones = await fetchAirspaceZones(minLng, minLat, maxLng, maxLat)
  cache.set(key, { zones, fetchedAt: now })

  // Evict old entries
  for (const [k, v] of cache) {
    if (now - v.fetchedAt > TTL_MS * 3) cache.delete(k)
  }

  return zones
}
