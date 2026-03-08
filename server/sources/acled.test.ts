// server/sources/acled.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchACLED, acledSeverity } from './acled'

describe('acledSeverity', () => {
  it('critical when fatalities > 10', () => expect(acledSeverity('Battles', 11)).toBe('critical'))
  it('high when fatalities > 0',      () => expect(acledSeverity('Battles', 1)).toBe('high'))
  it('low for protests with 0 deaths',() => expect(acledSeverity('Protests', 0)).toBe('low'))
  it('medium for other 0-death events',() => expect(acledSeverity('Strategic developments', 0)).toBe('medium'))
})

describe('fetchACLED', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('normalizes ACLED events to GlobalIncident[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          event_id_cnty: 'SYR1234',
          event_date: '2026-03-01',
          event_type: 'Battles',
          country: 'Syria',
          latitude: '35.5',
          longitude: '36.7',
          notes: 'Clashes reported near Aleppo.',
          fatalities: '3',
        }],
      }),
    }))

    const result = await fetchACLED('key', 'email@test.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'acled:SYR1234',
      lat: 35.5,
      lng: 36.7,
      country: 'Syria',
      type: 'Battles',
      severity: 'high',
      source: 'acled',
    })
  })
})
