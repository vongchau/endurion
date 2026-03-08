// server/sources/eonet.ts
import type { GlobalIncident } from '../../src/types'

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7&limit=100'
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000

const CATEGORY_TYPE: Record<string, string | null> = {
  'Wildfires':     'Wildfire',
  'Severe Storms': 'Severe Storm',
  'Volcanoes':     'Volcano',
  'Floods':        'Flood',
  'Landslides':    'Landslide',
  'Earthquakes':   null,  // excluded — USGS provides higher quality data
}

export async function fetchEONET(): Promise<GlobalIncident[]> {
  const res = await fetch(EONET_URL)
  if (!res.ok) throw new Error(`EONET fetch failed: ${res.status}`)
  const json = await res.json()

  const results: GlobalIncident[] = []
  for (const event of json.events ?? []) {
    const categoryTitle: string = event.categories?.[0]?.title ?? ''
    const type = CATEGORY_TYPE[categoryTitle]
    if (type === null || type === undefined) continue

    const geometry = event.geometry?.[0]
    if (!geometry) continue

    const [lng, lat] = geometry.coordinates
    const eventDate = new Date(geometry.date)

    if (categoryTitle === 'Wildfires' && Date.now() - eventDate.getTime() > FORTY_EIGHT_HOURS) continue

    results.push({
      id: `eonet:${event.id}`,
      lat,
      lng,
      country: 'Unknown',
      type,
      severity: 'medium',
      timestamp: eventDate.toISOString(),
      summary: event.title,
      source: 'eonet',
      url: event.link,
    })
  }
  return results
}
