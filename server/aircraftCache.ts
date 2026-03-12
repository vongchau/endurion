// server/aircraftCache.ts
import type { LowAltAircraft } from '../src/types'
import { fetchLowAltAircraft } from './sources/openSkyCity'

const POLL_INTERVAL = 15_000

let cache: LowAltAircraft[] = []
let lastBbox = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  if (!lastBbox) return
  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  try {
    cache = await fetchLowAltAircraft(minLng, minLat, maxLng, maxLat)
  } catch (e) {
    console.error(`[aircraftCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setAircraftBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  poll()
}

export function startAircraftPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[aircraftCache] poller started (15s)')
}

export function getLowAltAircraft(): LowAltAircraft[] {
  return cache
}
