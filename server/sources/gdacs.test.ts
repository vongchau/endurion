// server/sources/gdacs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchGDACS, alertLevelToSeverity } from './gdacs'

describe('alertLevelToSeverity', () => {
  it('maps RED to critical', () => expect(alertLevelToSeverity('Red')).toBe('critical'))
  it('maps ORANGE to high',  () => expect(alertLevelToSeverity('Orange')).toBe('high'))
  it('maps GREEN to low',    () => expect(alertLevelToSeverity('Green')).toBe('low'))
  it('handles unknown',      () => expect(alertLevelToSeverity('')).toBe('low'))
})

describe('fetchGDACS', () => {
  beforeEach(() => vi.restoreAllMocks())

  const sampleXml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:gdacs="http://www.gdacs.org" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
  <channel>
    <item>
      <title>Flood in Bangladesh</title>
      <link>https://gdacs.org/alert/1</link>
      <guid isPermaLink="false">https://gdacs.org/guid/1</guid>
      <pubDate>Sun, 09 Mar 2026 00:00:00 GMT</pubDate>
      <gdacs:alertlevel>Orange</gdacs:alertlevel>
      <gdacs:country>Bangladesh</gdacs:country>
      <gdacs:eventtype>FL</gdacs:eventtype>
      <geo:lat>23.7</geo:lat>
      <geo:long>90.4</geo:long>
    </item>
    <item>
      <title>Minor tremor</title>
      <link>https://gdacs.org/alert/2</link>
      <guid isPermaLink="false">https://gdacs.org/guid/2</guid>
      <gdacs:alertlevel>Green</gdacs:alertlevel>
      <gdacs:country>Italy</gdacs:country>
      <gdacs:eventtype>EQ</gdacs:eventtype>
      <geo:lat>41.9</geo:lat>
      <geo:long>12.5</geo:long>
    </item>
  </channel>
</rss>`

  it('filters out GREEN alerts and normalizes the rest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => sampleXml }))
    const result = await fetchGDACS()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'gdacs:https://gdacs.org/guid/1',
      lat: 23.7,
      lng: 90.4,
      country: 'Bangladesh',
      severity: 'high',
      source: 'gdacs',
    })
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchGDACS()).rejects.toThrow('GDACS fetch failed: 503')
  })
})
