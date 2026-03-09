// server/sources/faaAirspace.ts

const PROHIBITED_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0/query'
const AIRSPACE_URL   = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Airspace/FeatureServer/0/query'

export interface AirspaceZone {
  type: 'Feature'
  properties: {
    name: string
    zoneType: 'prohibited' | 'restricted' | 'controlled'
    upperAlt: number
    lowerAlt: number
    city: string
    state: string
  }
  geometry: GeoJSON.Geometry
}

async function queryFAA(
  url: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
  zoneType: AirspaceZone['properties']['zoneType'],
): Promise<AirspaceZone[]> {
  const params = new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: '200',
  })

  try {
    const res = await fetch(`${url}?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data.features) return []

    return data.features.map((f: any) => ({
      type: 'Feature',
      properties: {
        name: f.properties.NAME ?? f.properties.NAME_TXT ?? '',
        zoneType,
        upperAlt: Number(f.properties.UPPER_VAL ?? f.properties.DISTVERTUPPER_VAL ?? 0),
        lowerAlt: Number(f.properties.LOWER_VAL ?? f.properties.DISTVERTLOWER_VAL ?? 0),
        city: f.properties.CITY ?? '',
        state: f.properties.STATE ?? '',
      },
      geometry: f.geometry,
    }))
  } catch (e) {
    console.error(`[faaAirspace] query failed: ${e instanceof Error ? e.message : e}`)
    return []
  }
}

export async function fetchAirspaceZones(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<AirspaceZone[]> {
  const [prohibited, controlled] = await Promise.all([
    queryFAA(PROHIBITED_URL, minLng, minLat, maxLng, maxLat, 'prohibited'),
    queryFAA(AIRSPACE_URL, minLng, minLat, maxLng, maxLat, 'controlled'),
  ])
  return [...prohibited, ...controlled]
}
