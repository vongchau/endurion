// server/powerCache.ts
import type { PowerOutage } from '../src/types'
import { fetchPowerOutages, resolveState } from './sources/odinPower'

const POLL_INTERVAL = 5 * 60 * 1000

let cache: PowerOutage[] = []
let lastState = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

async function poll() {
  if (!lastState) return
  try {
    cache = await fetchPowerOutages(lastState)
  } catch (e) {
    console.error(`[powerCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setPowerLocation(lat: number, lng: number): Promise<void> | undefined {
  const state = resolveState(lat, lng)
  if (!state || state === lastState) return
  lastState = state
  return poll()
}

export function startPowerPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[powerCache] poller started (5min)')
}

export function getPowerOutages(): PowerOutage[] {
  return cache
}
