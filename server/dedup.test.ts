// server/dedup.test.ts
import { describe, it, expect } from 'vitest'
import { deduplicateIncidents } from './dedup'
import type { GlobalIncident } from '../src/types'

const make = (id: string, lat: number, lng: number, type: string, minutesAgo = 0, severity: GlobalIncident['severity'] = 'medium'): GlobalIncident => ({
  id, lat, lng, country: 'X', type, severity,
  timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  summary: 'test', source: 'usgs',
})

describe('deduplicateIncidents', () => {
  it('keeps events from different locations', () => {
    const result = deduplicateIncidents([
      make('a', 35.0, 139.0, 'Earthquake'),
      make('b', 10.0, 20.0, 'Earthquake'),
    ])
    expect(result).toHaveLength(2)
  })

  it('deduplicates same-type events within 0.1° grid and 30min window', () => {
    const result = deduplicateIncidents([
      make('usgs:1', 35.001, 139.001, 'Earthquake', 5),
      make('gdacs:1', 35.002, 139.002, 'Earthquake', 10),
    ])
    expect(result).toHaveLength(1)
  })

  it('keeps the higher-severity event when deduplicating', () => {
    const result = deduplicateIncidents([
      make('a', 35.001, 139.001, 'Earthquake', 5, 'medium'),
      make('b', 35.002, 139.002, 'Earthquake', 10, 'critical'),
    ])
    expect(result[0].severity).toBe('critical')
  })

  it('keeps both events of same type but different locations', () => {
    const result = deduplicateIncidents([
      make('a', 35.0, 139.0, 'Earthquake'),
      make('b', 36.0, 140.0, 'Earthquake'),  // >0.1° away
    ])
    expect(result).toHaveLength(2)
  })

  it('keeps both events of different types at same location', () => {
    const result = deduplicateIncidents([
      make('a', 35.0, 139.0, 'Earthquake'),
      make('b', 35.0, 139.0, 'Flood'),
    ])
    expect(result).toHaveLength(2)
  })

  it('sorts results by timestamp descending', () => {
    const result = deduplicateIncidents([
      make('old', 10.0, 20.0, 'Flood', 60),
      make('new', 11.0, 21.0, 'Flood', 5),
    ])
    expect(result[0].id).toBe('new')
  })
})
