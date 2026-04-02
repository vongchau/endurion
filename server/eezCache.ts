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

// --- Geometry simplification to reduce memory ---

/** Round coordinates to N decimal places and decimate points */
function simplifyRing(ring: number[][], precision = 3, minDistance = 0.01): number[][] {
  if (ring.length <= 4) return ring.map(c => [round(c[0], precision), round(c[1], precision)])

  const result: number[][] = [ring[0].map(v => round(v, precision))]
  for (let i = 1; i < ring.length; i++) {
    const prev = result[result.length - 1]
    const curr = ring[i]
    const dx = curr[0] - prev[0]
    const dy = curr[1] - prev[1]
    if (dx * dx + dy * dy >= minDistance * minDistance) {
      result.push([round(curr[0], precision), round(curr[1], precision)])
    }
  }
  // Ensure ring is closed
  if (result.length > 1) {
    const first = result[0], last = result[result.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) result.push([...first])
  }
  return result
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

function simplifyGeometry(geom: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map(ring => simplifyRing(ring)) }
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map(poly => poly.map(ring => simplifyRing(ring))),
    }
  }
  return geom
}

function simplifyFeatureCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map(f => ({
      ...f,
      geometry: simplifyGeometry(f.geometry),
    })),
  }
}

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
        name: (feature.properties?.geoname ?? feature.properties?.geoname_en ?? feature.properties?.sovereign1 ?? 'Unknown EEZ') as string,
        mrgid: (feature.properties?.mrgid ?? 0) as number,
      })
    }
  }
  return hits
}

export function getEEZFeatureCollection(): GeoJSON.FeatureCollection {
  return featureCollection ?? { type: 'FeatureCollection', features: [] }
}

/** Fetch all EEZ polygons directly from the WFS endpoint in a single request.
 *  Falls back to paginated gazetteer + individual WFS if bulk fetch fails. */
async function buildCache(): Promise<GeoJSON.FeatureCollection> {
  // Strategy 1: Single WFS request for all EEZs (fast, ~30-60s)
  try {
    console.log('[eezCache] fetching all EEZ polygons from WFS (bulk)...')
    const url = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature` +
      `&typeName=MarineRegions:eez&outputFormat=application/json`
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (res.ok) {
      const fc = await res.json() as GeoJSON.FeatureCollection
      // Normalize property names for consistent access
      for (const f of fc.features) {
        if (f.properties) {
          f.properties.geoname = f.properties.geoname ?? f.properties.geoname_en ?? f.properties.sovereign1 ?? 'Unknown EEZ'
          f.properties.mrgid = f.properties.mrgid ?? 0
        }
      }
      console.log(`[eezCache] fetched ${fc.features.length} EEZ polygons (bulk WFS)`)
      return fc
    }
    console.warn(`[eezCache] bulk WFS returned ${res.status}, trying paginated fallback...`)
  } catch (e) {
    console.warn(`[eezCache] bulk WFS failed: ${e instanceof Error ? e.message : e}, trying paginated fallback...`)
  }

  // Strategy 2: Paginated gazetteer + individual WFS (slow fallback)
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
  console.log(`[eezCache] fetched ${all.length} EEZ records, downloading geometries...`)

  const features: GeoJSON.Feature[] = []
  for (let i = 0; i < all.length; i++) {
    const rec = all[i]
    console.log(`[eezCache] geometry ${i + 1}/${all.length}: ${rec.preferredGazetteerName}`)
    const gUrl = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature` +
      `&typeName=MarineRegions:eez&outputFormat=application/json` +
      `&CQL_FILTER=mrgid=${rec.MRGID}`
    try {
      const res = await fetch(gUrl, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) continue
      const fc = await res.json() as GeoJSON.FeatureCollection
      const feature = fc.features[0]
      if (feature) {
        feature.properties = { ...feature.properties, mrgid: rec.MRGID, geoname: rec.preferredGazetteerName }
        features.push(feature)
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 1000))
  }

  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
  console.log(`[eezCache] built ${features.length} EEZ polygons (paginated)`)
  return fc
}

export async function initEEZ(): Promise<void> {
  const SIMPLIFIED_PATH = CACHE_PATH.replace('.json', '-simplified.json')

  // Try loading simplified cache first
  if (fs.existsSync(SIMPLIFIED_PATH)) {
    try {
      const raw = fs.readFileSync(SIMPLIFIED_PATH, 'utf-8')
      featureCollection = JSON.parse(raw) as GeoJSON.FeatureCollection
      console.log(`[eezCache] loaded ${featureCollection.features.length} EEZs from simplified cache (${(Buffer.byteLength(raw) / 1e6).toFixed(1)}MB)`)
      return
    } catch (e) {
      console.warn('[eezCache] simplified cache corrupt, rebuilding...')
    }
  }

  // Load or fetch full-resolution data
  let fullRes: GeoJSON.FeatureCollection
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_PATH, 'utf-8')
      fullRes = JSON.parse(raw) as GeoJSON.FeatureCollection
      console.log(`[eezCache] loaded ${fullRes.features.length} EEZs from full-res cache`)
    } catch {
      fullRes = await buildCache()
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
      fs.writeFileSync(CACHE_PATH, JSON.stringify(fullRes))
    }
  } else {
    fullRes = await buildCache()
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(fullRes))
    console.log(`[eezCache] saved full-res cache to ${CACHE_PATH}`)
  }

  // Simplify and save
  featureCollection = simplifyFeatureCollection(fullRes)
  const simplified = JSON.stringify(featureCollection)
  fs.writeFileSync(SIMPLIFIED_PATH, simplified)
  console.log(`[eezCache] saved simplified cache (${(Buffer.byteLength(simplified) / 1e6).toFixed(1)}MB) with ${featureCollection.features.length} EEZs`)
}
