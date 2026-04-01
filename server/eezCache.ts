// server/eezCache.ts — Fetch and cache EEZ GeoJSON polygons from marineregions.org
import fs from 'fs'
import path from 'path'

const CACHE_PATH = path.join(process.cwd(), 'data', 'eez-cache.json')
const GAZETTEER_URL = 'https://www.marineregions.org/rest/getGazetteerRecordsByType.json/EEZ/'
const WFS_BASE = 'https://geo.vliz.be/geoserver/MarineRegions/ows'
const PAGE_SIZE = 50

interface EEZRecord {
  MRGID: number
  preferredGazetteerName: string
  latitude: number | null
  longitude: number | null
  minLatitude: number | null
  minLongitude: number | null
  maxLatitude: number | null
  maxLongitude: number | null
  status: string
}

let featureCollection: GeoJSON.FeatureCollection | null = null

function pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInMultiPolygon(lat: number, lng: number, geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, geometry.coordinates[0])
  }
  for (const polygon of geometry.coordinates) {
    if (pointInPolygon(lat, lng, polygon[0])) return true
  }
  return false
}

export interface EEZHit {
  name: string
  mrgid: number
}

export function findEEZsContainingPoint(lat: number, lng: number): EEZHit[] {
  if (!featureCollection) return []
  const hits: EEZHit[] = []
  for (const feature of featureCollection.features) {
    const geom = feature.geometry as GeoJSON.MultiPolygon | GeoJSON.Polygon
    if (pointInMultiPolygon(lat, lng, geom)) {
      hits.push({
        name: (feature.properties?.geoname ?? feature.properties?.preferredGazetteerName ?? 'Unknown EEZ') as string,
        mrgid: (feature.properties?.mrgid ?? 0) as number,
      })
    }
  }
  return hits
}

export function getEEZFeatureCollection(): GeoJSON.FeatureCollection {
  return featureCollection ?? { type: 'FeatureCollection', features: [] }
}

async function fetchEEZRecords(): Promise<EEZRecord[]> {
  const all: EEZRecord[] = []
  let offset = 0
  while (true) {
    const url = `${GAZETTEER_URL}?offset=${offset}&count=${PAGE_SIZE}`
    console.log(`[eezCache] fetching records offset=${offset}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Gazetteer API ${res.status}`)
    const page = await res.json() as EEZRecord[]
    if (page.length === 0) break
    all.push(...page.filter(r => r.status === 'standard'))
    offset += PAGE_SIZE
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[eezCache] fetched ${all.length} EEZ records`)
  return all
}

async function fetchEEZGeometry(mrgid: number): Promise<GeoJSON.Feature | null> {
  const url = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature` +
    `&typeName=MarineRegions:eez&outputFormat=application/json` +
    `&CQL_FILTER=mrgid=${mrgid}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const fc = await res.json() as GeoJSON.FeatureCollection
    return fc.features[0] ?? null
  } catch {
    return null
  }
}

async function buildCache(): Promise<GeoJSON.FeatureCollection> {
  const records = await fetchEEZRecords()
  const features: GeoJSON.Feature[] = []
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    console.log(`[eezCache] fetching geometry ${i + 1}/${records.length}: ${rec.preferredGazetteerName}`)
    const feature = await fetchEEZGeometry(rec.MRGID)
    if (feature) {
      feature.properties = {
        ...feature.properties,
        mrgid: rec.MRGID,
        geoname: rec.preferredGazetteerName,
      }
      features.push(feature)
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
  console.log(`[eezCache] built ${features.length} EEZ polygons`)
  return fc
}

export async function initEEZ(): Promise<void> {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_PATH, 'utf-8')
      featureCollection = JSON.parse(raw) as GeoJSON.FeatureCollection
      console.log(`[eezCache] loaded ${featureCollection.features.length} EEZs from cache`)
      return
    } catch (e) {
      console.warn('[eezCache] cache file corrupt, rebuilding...')
    }
  }
  featureCollection = await buildCache()
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(featureCollection))
  console.log(`[eezCache] saved cache to ${CACHE_PATH}`)
}
