// server/sources/opensky.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchOpenSky, isMilitary } from './opensky'

describe('isMilitary', () => {
  it('identifies RCH callsign prefix as military', () => expect(isMilitary('ae1234', 'RCH100')).toBe(true))
  it('identifies REACH prefix as military',        () => expect(isMilitary('ae1234', 'REACH100')).toBe(true))
  it('identifies NATO prefix as military',          () => expect(isMilitary('ae1234', 'NATO01')).toBe(true))
  it('identifies US military ICAO range (ae1000)', () => expect(isMilitary('ae1000', 'DUKE1')).toBe(true))
  it('rejects commercial callsign',                 () => expect(isMilitary('4b1234', 'BAW123')).toBe(false))
  it('rejects empty callsign',                      () => expect(isMilitary('ae1234', '')).toBe(false))
})

describe('fetchOpenSky', () => {
  beforeEach(() => vi.restoreAllMocks())

  // State vector: [icao24, callsign, country, time_pos, last_contact, lng, lat, baro_alt, on_ground, velocity, true_track, ...]
  const militaryState = ['ae1234', 'RCH100  ', 'United States', 1700000000, 1700000000, -80.0, 40.0, 10000, false, 250, 90, null, null, null, null, false, 0]
  const civilState    = ['4b1234', 'BAW123  ', 'United Kingdom', 1700000000, 1700000000, -0.1, 51.5, 9000, false, 220, 270, null, null, null, null, false, 0]

  it('returns only military flights', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ states: [militaryState, civilState] }),
    }))
    const result = await fetchOpenSky()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'ae1234',
      callsign: 'RCH100',
      lat: 40.0,
      lng: -80.0,
      heading: 90,
    })
  })
})
