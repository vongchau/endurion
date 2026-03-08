// server/sources/eonet.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEONET } from './eonet'

describe('fetchEONET', () => {
  beforeEach(() => vi.restoreAllMocks())

  const now = new Date().toISOString()
  const old = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString() // 50h ago

  const makeEvent = (id: string, category: string, date: string) => ({
    id,
    title: `${category} event`,
    link: `https://eonet.gsfc.nasa.gov/api/v3/events/${id}`,
    categories: [{ title: category }],
    geometry: [{ date, coordinates: [10.0, 20.0] }],
  })

  it('normalizes wildfire events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [makeEvent('e1', 'Wildfires', now)] }),
    }))
    const result = await fetchEONET()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'eonet:e1', type: 'Wildfire', source: 'eonet', severity: 'medium' })
  })

  it('excludes wildfires older than 48 hours', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [makeEvent('e2', 'Wildfires', old)] }),
    }))
    const result = await fetchEONET()
    expect(result).toHaveLength(0)
  })

  it('excludes earthquake events (USGS handles those)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [makeEvent('e3', 'Earthquakes', now)] }),
    }))
    const result = await fetchEONET()
    expect(result).toHaveLength(0)
  })
})
