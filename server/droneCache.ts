// server/droneCache.ts
import { EventEmitter } from 'events'
import type { DroneFlight } from '../src/types'
import { fetchDronetag } from './sources/dronetag'
import { insertPositions } from './droneDb'

const POLL_INTERVAL = 5_000
const STALE_MS      = 5 * 60 * 1000
const MAX_TRAIL     = 60  // ~5 min at 5s polling

const droneCache = new Map<string, DroneFlight>()
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
    const seen = new Set<string>()

    for (const d of raw) {
      seen.add(d.operationId)
      const existing = droneCache.get(d.operationId)
      const trailPoint = { lng: d.lng, lat: d.lat, timestamp: d.timestamp }

      if (existing) {
        // Append to trail only if position actually changed
        const lastTrail = existing.trail[existing.trail.length - 1]
        const moved = !lastTrail || lastTrail.lng !== d.lng || lastTrail.lat !== d.lat
        const trail = moved
          ? [...existing.trail, trailPoint].slice(-MAX_TRAIL)
          : existing.trail

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
          trail,
        })
      } else {
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
          trail: [trailPoint],
        })
      }
    }

    // Persist all positions to SQLite for historical playback
    insertPositions(raw.map(d => ({
      operationId: d.operationId,
      sensorId: d.sensorId,
      lng: d.lng,
      lat: d.lat,
      altitude: d.altitude,
      speed: d.speed,
      verticalSpeed: d.verticalSpeed,
      heading: d.heading,
      state: d.state,
      timestamp: d.timestamp,
    })))

    // Purge stale drones from in-memory cache
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
