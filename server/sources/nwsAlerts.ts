// server/sources/nwsAlerts.ts
import type { WeatherAlert } from '../../src/types'

const USER_AGENT = '(endurion-hud, ops@endurion.dev)'

export async function fetchWeatherAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}&status=actual`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
  })
  if (!res.ok) {
    console.error(`[nws] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const alerts: WeatherAlert[] = []

  for (const feature of data.features ?? []) {
    const props = feature.properties ?? {}
    const sevMap: Record<string, WeatherAlert['severity']> = {
      Extreme: 'extreme', Severe: 'severe', Moderate: 'moderate', Minor: 'minor',
    }
    const urgMap: Record<string, WeatherAlert['urgency']> = {
      Immediate: 'immediate', Expected: 'expected', Future: 'future',
    }

    alerts.push({
      id: feature.id ?? `nws-${Math.random().toString(36).slice(2)}`,
      event: props.event ?? 'Unknown',
      severity: sevMap[props.severity] ?? 'minor',
      urgency: urgMap[props.urgency] ?? 'future',
      headline: props.headline ?? '',
      description: props.description ?? '',
      instruction: props.instruction ?? undefined,
      onset: props.onset ? new Date(props.onset).getTime() : Date.now(),
      expires: props.expires ? new Date(props.expires).getTime() : Date.now() + 3600_000,
      geometry: feature.geometry ?? null,
    })
  }

  return alerts
}
