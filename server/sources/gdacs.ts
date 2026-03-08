// server/sources/gdacs.ts
import { XMLParser } from 'fast-xml-parser'
import type { GlobalIncident, Severity } from '../../src/types'

const GDACS_URL = 'https://www.gdacs.org/xml/rss.xml'
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export function alertLevelToSeverity(level: string): Severity {
  switch (level?.toUpperCase()) {
    case 'RED':    return 'critical'
    case 'ORANGE': return 'high'
    default:       return 'low'
  }
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  EQ: 'Earthquake', FL: 'Flood', TC: 'Cyclone',
  VO: 'Volcano', WF: 'Wildfire', DR: 'Drought',
}

export async function fetchGDACS(): Promise<GlobalIncident[]> {
  const res = await fetch(GDACS_URL)
  if (!res.ok) throw new Error(`GDACS fetch failed: ${res.status}`)
  const xml = await res.text()
  const parsed = parser.parse(xml)
  const items: any[] = parsed?.rss?.channel?.item ?? []

  return items
    .filter((item) => item['gdacs:alertlevel']?.toUpperCase() !== 'GREEN')
    .map((item): GlobalIncident => ({
      id: `gdacs:${item['guid']?.['#text'] ?? item['guid'] ?? item['link']}`,
      lat: parseFloat(item['geo:lat'] ?? item['gdacs:latitude'] ?? '0'),
      lng: parseFloat(item['geo:long'] ?? item['gdacs:longitude'] ?? '0'),
      country: item['gdacs:country'] ?? 'Unknown',
      type: EVENT_TYPE_LABELS[item['gdacs:eventtype']] ?? item['gdacs:eventtype'] ?? 'Disaster',
      severity: alertLevelToSeverity(item['gdacs:alertlevel']),
      timestamp: new Date(item['pubDate'] ?? Date.now()).toISOString(),
      summary: item['title'] ?? '',
      source: 'gdacs',
      url: item['link'],
    }))
}
