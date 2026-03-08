// server/cache.ts
import type { GlobalIncident, MilitaryFlight } from '../src/types'

interface SourceEntry {
  data: GlobalIncident[]
  lastUpdated: number
  stale: boolean
}

const incidentStore = new Map<string, SourceEntry>()
let flightStore: MilitaryFlight[] = []
let flightsUpdatedAt = 0

export function setIncidents(source: string, data: GlobalIncident[]) {
  incidentStore.set(source, { data, lastUpdated: Date.now(), stale: false })
}

export function setStale(source: string) {
  const entry = incidentStore.get(source)
  if (entry) incidentStore.set(source, { ...entry, stale: true })
}

export function getIncidents(): GlobalIncident[] {
  const all: GlobalIncident[] = []
  for (const entry of incidentStore.values()) all.push(...entry.data)
  return all
}

export function getCacheStatus(source: string) {
  return incidentStore.get(source) ?? { data: [], lastUpdated: 0, stale: false }
}

export function setFlights(data: MilitaryFlight[]) {
  flightStore = data
  flightsUpdatedAt = Date.now()
}

export function getFlights(): MilitaryFlight[] {
  return flightStore
}
