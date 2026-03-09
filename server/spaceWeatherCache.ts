// server/spaceWeatherCache.ts
import { fetchSpaceWeather, type SpaceWeather } from './sources/noaaSwpc'

const TTL_MS = 5 * 60 * 1000  // 5 min

let cache: SpaceWeather | null = null
let fetchedAt = 0
let fetching = false

export async function getSpaceWeather(): Promise<SpaceWeather> {
  const now = Date.now()
  if (cache && now - fetchedAt < TTL_MS) return cache

  if (fetching) return cache ?? { alerts: [], scales: null, kpIndex: null }

  fetching = true
  try {
    cache = await fetchSpaceWeather()
    fetchedAt = now
    return cache
  } catch (e) {
    console.error(`[spaceWeatherCache] ${e instanceof Error ? e.message : e}`)
    return cache ?? { alerts: [], scales: null, kpIndex: null }
  } finally {
    fetching = false
  }
}
