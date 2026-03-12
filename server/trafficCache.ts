// server/trafficCache.ts
import type { TrafficIncident } from '../src/types'
import { fetchTrafficIncidents } from './sources/tomtomTraffic'

const POLL_INTERVAL = 60_000

let cache: TrafficIncident[] = []
let lastBbox = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  const apiKey = process.env.TOMTOM_API_KEY
  if (!apiKey || !lastBbox) return

  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  try {
    cache = await fetchTrafficIncidents(apiKey, minLng, minLat, maxLng, maxLat)
  } catch (e) {
    console.error(`[trafficCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setTrafficBbox(minLng: number, minLat: number, maxLng: number, maxLat: number): Promise<void> | undefined {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  return poll()
}

export function startTrafficPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[trafficCache] poller started (60s)')
}

export function getTrafficIncidents(): TrafficIncident[] {
  return cache
}
