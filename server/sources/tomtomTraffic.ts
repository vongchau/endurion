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

export async function fetchTrafficIncidents(
  apiKey: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<TrafficIncident[]> {
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&key=${apiKey}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,delay,events,startTime,endTime}}}&language=en-US&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,12,14`

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

    const coords = geom.type === 'Point'
      ? geom.coordinates
      : Array.isArray(geom.coordinates[0])
        ? geom.coordinates[0]
        : geom.coordinates

    const iconCat = props.iconCategory ?? 0
    const description = (props.events ?? [])
      .map((e: { description?: string }) => e.description)
      .filter(Boolean)
      .join('; ') || `Traffic incident (category ${iconCat})`

    incidents.push({
      id: props.id ?? `tt-${Math.random().toString(36).slice(2)}`,
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
