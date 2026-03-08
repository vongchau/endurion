// server/sources/usgs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUSGS, magnitudeToSeverity } from './usgs'

describe('magnitudeToSeverity', () => {
  it('maps 7.0+ to critical', () => expect(magnitudeToSeverity(7.5)).toBe('critical'))
  it('maps 6.0–6.9 to high',   () => expect(magnitudeToSeverity(6.2)).toBe('high'))
  it('maps 5.0–5.9 to medium', () => expect(magnitudeToSeverity(5.1)).toBe('medium'))
  it('maps <5.0 to low',       () => expect(magnitudeToSeverity(4.6)).toBe('low'))
})

describe('fetchUSGS', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('normalizes GeoJSON features to GlobalIncident[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          id: 'us1234',
          properties: { mag: 6.1, place: '100km N of Tokyo, Japan', time: 1700000000000, url: 'https://example.com' },
          geometry: { coordinates: [139.0, 35.0, 10.0] },
        }],
      }),
    }))

    const result = await fetchUSGS()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'usgs:us1234',
      lat: 35.0,
      lng: 139.0,
      type: 'Earthquake',
      severity: 'high',
      source: 'usgs',
    })
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchUSGS()).rejects.toThrow('USGS fetch failed: 503')
  })
})
