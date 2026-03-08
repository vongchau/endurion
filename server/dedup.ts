// server/dedup.ts
import type { GlobalIncident, Severity } from '../src/types'

const GRID_SIZE = 0.1      // degrees (~11km)
const TIME_WINDOW = 30 * 60_000  // 30 minutes

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4, high: 3, medium: 2, low: 1, nominal: 0,
}

function gridCell(lat: number, lng: number): string {
  return `${Math.round(lat / GRID_SIZE)},${Math.round(lng / GRID_SIZE)}`
}

export function deduplicateIncidents(incidents: GlobalIncident[]): GlobalIncident[] {
  const seen = new Map<string, GlobalIncident>()

  for (const incident of incidents) {
    const key = `${gridCell(incident.lat, incident.lng)}:${incident.type}`
    const existing = seen.get(key)

    if (!existing) {
      seen.set(key, incident)
      continue
    }

    const timeDiff = Math.abs(
      new Date(incident.timestamp).getTime() - new Date(existing.timestamp).getTime()
    )

    if (timeDiff <= TIME_WINDOW) {
      // Same spatio-temporal window — keep higher severity
      if (SEVERITY_RANK[incident.severity] > SEVERITY_RANK[existing.severity]) {
        seen.set(key, incident)
      }
    } else {
      // Different time window — both are distinct events, use timestamp-scoped key
      seen.set(`${key}:${incident.timestamp}`, incident)
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}
