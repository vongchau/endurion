// server/droneCache.ts
import { EventEmitter } from 'events'
import type { DroneFlight } from '../src/types'
import { fetchDronetag } from './sources/dronetag'

const POLL_INTERVAL = 5_000
const STALE_MS      = 5 * 60 * 1000

let droneCache = new Map<string, DroneFlight>()
let lastBbox   = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

export const droneEvents = new EventEmitter()

function bboxKey(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const q = (n: number) => Math.round(n * 100) / 100
  return `${q(minLng)},${q(minLat)},${q(maxLng)},${q(maxLat)}`
}

async function poll() {
  const apiKey = process.env.DRONETAG_API_KEY
  if (!apiKey || !lastBbox) return

  const [minLng, minLat, maxLng, maxLat] = lastBbox.split(',').map(Number)
  try {
    const raw = await fetchDronetag(apiKey, minLng, minLat, maxLng, maxLat)
    const now = Date.now()
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
    const cutoff = now - STALE_MS
    for (const [id, d] of droneCache) {
      if (d.timestamp < cutoff) droneCache.delete(id)
    }
    droneEvents.emit('update', Array.from(droneCache.values()))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[droneCache] fetch failed: ${msg}`)
  }
}

export function setDroneBbox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const key = bboxKey(minLng, minLat, maxLng, maxLat)
  if (key === lastBbox) return
  lastBbox = key
  poll()
}

export function startDronePoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[droneCache] poller started (5s)')
}

export function getDrones(): DroneFlight[] {
  return Array.from(droneCache.values())
}
