// server/crimeCache.ts
import type { CrimeIncident } from '../src/types'
import { getMatchingCities, fetchCrimeIncidents } from './sources/socrataCrime'

const POLL_INTERVAL = 5 * 60 * 1000

let cache: CrimeIncident[] = []
let lastBbox = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 10) / 10
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  if (!lastBbox) return
  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  const cities = getMatchingCities(minLng, minLat, maxLng, maxLat)
  if (cities.length === 0) { cache = []; return }

  try {
    const results = await Promise.all(cities.map(c => fetchCrimeIncidents(c)))
    cache = results.flat().sort((a, b) => b.timestamp - a.timestamp)
  } catch (e) {
    console.error(`[crimeCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setCrimeBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  poll()
}

export function startCrimePoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[crimeCache] poller started (5min)')
}

export function getCrimeIncidents(): CrimeIncident[] {
  return cache
}
