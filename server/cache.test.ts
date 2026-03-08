// server/cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setIncidents, getIncidents, setStale, getCacheStatus,
  setFlights, getFlights,
} from './cache'
import type { GlobalIncident } from '../src/types'

const makeIncident = (id: string): GlobalIncident => ({
  id, lat: 0, lng: 0, country: 'Test', type: 'Earthquake',
  severity: 'medium', timestamp: new Date().toISOString(),
  summary: 'test', source: 'usgs',
})

describe('cache', () => {
  beforeEach(() => {
    setIncidents('usgs', [])
    setIncidents('gdacs', [])
  })

  it('merges incidents from multiple sources', () => {
    setIncidents('usgs', [makeIncident('u1')])
    setIncidents('gdacs', [makeIncident('g1')])
    expect(getIncidents().map(i => i.id)).toContain('u1')
    expect(getIncidents().map(i => i.id)).toContain('g1')
  })

  it('replaces previous data for the same source', () => {
    setIncidents('usgs', [makeIncident('u1')])
    setIncidents('usgs', [makeIncident('u2')])
    const ids = getIncidents().map(i => i.id)
    expect(ids).not.toContain('u1')
    expect(ids).toContain('u2')
  })

  it('marks a source stale without clearing its data', () => {
    setIncidents('usgs', [makeIncident('u1')])
    setStale('usgs')
    expect(getIncidents().map(i => i.id)).toContain('u1')
    expect(getCacheStatus('usgs').stale).toBe(true)
  })

  it('stores and retrieves flights', () => {
    setFlights([{ id: 'abc', callsign: 'RCH100', lat: 1, lng: 2,
      altitude: 10000, velocity: 250, heading: 90, country: 'USA',
      timestamp: new Date().toISOString() }])
    expect(getFlights()[0].callsign).toBe('RCH100')
  })
})
