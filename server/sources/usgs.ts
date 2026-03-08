// server/sources/usgs.ts
import type { GlobalIncident, Severity } from '../../src/types'

const USGS_URL =
  'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&orderby=time&limit=100'

export function magnitudeToSeverity(mag: number): Severity {
  if (mag >= 7.0) return 'critical'
  if (mag >= 6.0) return 'high'
  if (mag >= 5.0) return 'medium'
  return 'low'
}

export async function fetchUSGS(): Promise<GlobalIncident[]> {
  const res = await fetch(USGS_URL)
  if (!res.ok) throw new Error(`USGS fetch failed: ${res.status}`)
  const json = await res.json()

  return json.features.map((f: any): GlobalIncident => ({
    id: `usgs:${f.id}`,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    country: f.properties.place ?? 'Unknown',
    type: 'Earthquake',
    severity: magnitudeToSeverity(f.properties.mag),
    timestamp: new Date(f.properties.time).toISOString(),
    summary: `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`,
    source: 'usgs',
    url: f.properties.url,
  }))
}
