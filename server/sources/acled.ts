// server/sources/acled.ts
import type { GlobalIncident, Severity } from '../../src/types'

const ACLED_BASE = 'https://api.acleddata.com/acled/read'

export function acledSeverity(eventType: string, fatalities: number): Severity {
  if (fatalities > 10) return 'critical'
  if (fatalities > 0)  return 'high'
  if (eventType === 'Protests') return 'low'
  return 'medium'
}

export async function fetchACLED(apiKey: string, email: string): Promise<GlobalIncident[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const params = new URLSearchParams({
    key: apiKey,
    email,
    event_date: thirtyDaysAgo,
    event_date_where: '>',
    limit: '200',
    fields: 'event_id_cnty:event_date:event_type:country:latitude:longitude:notes:fatalities',
  })

  const res = await fetch(`${ACLED_BASE}?${params}`)
  if (!res.ok) throw new Error(`ACLED fetch failed: ${res.status}`)
  const json = await res.json()

  return (json.data ?? []).map((e: any): GlobalIncident => ({
    id: `acled:${e.event_id_cnty}`,
    lat: parseFloat(e.latitude),
    lng: parseFloat(e.longitude),
    country: e.country,
    type: e.event_type,
    severity: acledSeverity(e.event_type, parseInt(e.fatalities ?? '0', 10)),
    timestamp: new Date(e.event_date).toISOString(),
    summary: (e.notes ?? e.event_type).slice(0, 200),
    source: 'acled',
  }))
}
