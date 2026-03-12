// server/weatherCache.ts
import type { WeatherAlert } from '../src/types'
import { fetchWeatherAlerts } from './sources/nwsAlerts'

const POLL_INTERVAL = 120_000

let cache: WeatherAlert[] = []
let lastKey = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

function pointKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

async function poll() {
  if (!lastKey) return
  const [lat, lng] = lastKey.split(',').map(Number)
  try {
    const now = Date.now()
    const alerts = await fetchWeatherAlerts(lat, lng)
    cache = alerts.filter(a => a.expires > now)
  } catch (e) {
    console.error(`[weatherCache] fetch failed:`, e instanceof Error ? e.message : e)
  }
}

export function setWeatherPoint(lat: number, lng: number) {
  const key = pointKey(lat, lng)
  if (key === lastKey) return
  lastKey = key
  poll()
}

export function startWeatherPoller() {
  if (pollTimer) return
  pollTimer = setInterval(poll, POLL_INTERVAL)
  console.log('[weatherCache] poller started (120s)')
}

export function getWeatherAlerts(): WeatherAlert[] {
  return cache
}
