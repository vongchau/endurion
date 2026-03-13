// server/sources/tomtomTraffic.ts
import type { TrafficIncident } from '../../src/types'

const CATEGORY_MAP: Record<number, TrafficIncident['category']> = {
  0: 'other',       // Unknown
  1: 'accident',    // Accident
  2: 'weather',     // Fog
  3: 'other',       // Dangerous Conditions
  4: 'weather',     // Rain
  5: 'weather',     // Ice
  6: 'congestion',  // Jam
  7: 'roadClosed',  // Lane Closed
  8: 'roadClosed',  // Road Closed
  9: 'roadWorks',   // Road Works
  10: 'weather',    // Wind
  11: 'weather',    // Flooding
  12: 'roadClosed', // Detour
  14: 'accident',   // Broken Down Vehicle
}

const CATEGORY_LABELS: Record<number, string> = {
  0: 'Unknown', 1: 'Accident', 2: 'Fog', 3: 'Dangerous Conditions',
  4: 'Rain', 5: 'Ice', 6: 'Traffic Jam', 7: 'Lane Closed',
  8: 'Road Closed', 9: 'Road Works', 10: 'Wind', 11: 'Flooding',
  12: 'Detour', 14: 'Broken Down Vehicle',
}

export async function fetchTrafficIncidents(
  apiKey: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<TrafficIncident[]> {
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&key=${apiKey}&language=en-US`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[tomtom] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const incidents: TrafficIncident[] = []

  for (const inc of data.incidents ?? []) {
    const props = inc.properties ?? {}
    const geom = inc.geometry
    if (!geom?.coordinates) continue

    // Extract first coordinate: Point → use directly, LineString → use first point
    const coords = geom.type === 'Point'
      ? geom.coordinates
      : Array.isArray(geom.coordinates[0])
        ? geom.coordinates[0]
        : geom.coordinates

    const iconCat = props.iconCategory ?? 0
    const description = (props.events ?? [])
      .map((e: { description?: string }) => e.description)
      .filter(Boolean)
      .join('; ') || CATEGORY_LABELS[iconCat] || `Traffic incident`

    incidents.push({
      id: props.id ?? `tt-${iconCat}-${coords[0].toFixed(4)}-${coords[1].toFixed(4)}`,
      lat: coords[1],
      lng: coords[0],
      category: CATEGORY_MAP[iconCat] ?? 'other',
      severity: Math.max(1, Math.min(4, props.magnitudeOfDelay ?? 1)) as 1 | 2 | 3 | 4,
      description,
      delay: props.delay ?? 0,
      startTime: props.startTime ? new Date(props.startTime).getTime() : Date.now(),
      endTime: props.endTime ? new Date(props.endTime).getTime() : undefined,
    })
  }

  return incidents
}
