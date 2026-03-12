// server/sources/socrataCrime.ts
import type { CrimeIncident } from '../../src/types'

interface CityConfig {
  city: CrimeIncident['city']
  domain: string
  dataset: string
  fields: {
    id: string
    date: string
    type: string
    description: string
    lat: string
    lng: string
  }
  violentTypes: string[]
}

const CITIES: CityConfig[] = [
  {
    city: 'chicago',
    domain: 'data.cityofchicago.org',
    dataset: 'ijzp-q8t2',
    fields: { id: 'id', date: 'date', type: 'primary_type', description: 'description', lat: 'latitude', lng: 'longitude' },
    violentTypes: ['HOMICIDE', 'ASSAULT', 'BATTERY', 'ROBBERY', 'KIDNAPPING', 'CRIM SEXUAL ASSAULT'],
  },
  {
    city: 'nyc',
    domain: 'data.cityofnewyork.us',
    dataset: '5uac-w243',
    fields: { id: 'cmplnt_num', date: 'cmplnt_fr_dt', type: 'ofns_desc', description: 'pd_desc', lat: 'latitude', lng: 'longitude' },
    violentTypes: ['MURDER & NON-NEGL. MANSLAUGHTER', 'FELONY ASSAULT', 'ROBBERY', 'RAPE', 'KIDNAPPING'],
  },
  {
    city: 'la',
    domain: 'data.lacity.org',
    dataset: '2nrs-mtv8',
    fields: { id: 'dr_no', date: 'date_occ', type: 'crm_cd_desc', description: 'premis_desc', lat: 'lat', lng: 'lon' },
    violentTypes: ['ASSAULT', 'BATTERY', 'ROBBERY', 'HOMICIDE', 'KIDNAPPING', 'RAPE'],
  },
]

const SUPPORTED_BBOXES: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  chicago: { minLat: 41.64, maxLat: 42.02, minLng: -87.94, maxLng: -87.52 },
  nyc:     { minLat: 40.49, maxLat: 40.92, minLng: -74.26, maxLng: -73.70 },
  la:      { minLat: 33.70, maxLat: 34.34, minLng: -118.67, maxLng: -118.16 },
}

function bboxOverlaps(
  a: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng
}

export function getMatchingCities(minLng: number, minLat: number, maxLng: number, maxLat: number): CityConfig[] {
  const viewBbox = { minLat, maxLat, minLng, maxLng }
  return CITIES.filter(c => bboxOverlaps(SUPPORTED_BBOXES[c.city], viewBbox))
}

export async function fetchCrimeIncidents(config: CityConfig): Promise<CrimeIncident[]> {
  const appToken = process.env.SOCRATA_APP_TOKEN
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const f = config.fields

  const url = `https://${config.domain}/resource/${config.dataset}.json?$where=${f.date} > '${since}'&$order=${f.date} DESC&$limit=200`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (appToken) headers['X-App-Token'] = appToken

  const res = await fetch(url, { headers })
  if (!res.ok) {
    console.error(`[socrata:${config.city}] fetch failed: ${res.status}`)
    return []
  }

  const rows = await res.json()
  const incidents: CrimeIncident[] = []

  for (const row of rows) {
    const lat = parseFloat(row[f.lat])
    const lng = parseFloat(row[f.lng])
    if (isNaN(lat) || isNaN(lng)) continue

    const crimeType = (row[f.type] ?? 'UNKNOWN').toUpperCase()
    const isViolent = config.violentTypes.some(v => crimeType.includes(v))
    const isProperty = !isViolent && ['THEFT', 'BURGLARY', 'LARCENY', 'VEHICLE', 'VANDALISM', 'ARSON', 'STOLEN'].some(k => crimeType.includes(k))

    incidents.push({
      id: `${config.city}-${row[f.id] ?? Math.random().toString(36).slice(2)}`,
      lat, lng,
      type: crimeType,
      description: row[f.description] ?? crimeType,
      timestamp: new Date(row[f.date]).getTime(),
      city: config.city,
      severity: isViolent ? 'violent' : isProperty ? 'property' : 'other',
    })
  }

  return incidents
}
