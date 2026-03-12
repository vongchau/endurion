// server/sources/openSkyCity.ts
import type { LowAltAircraft } from '../../src/types'

const MAX_ALT_METERS = 3000

export async function fetchLowAltAircraft(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<LowAltAircraft[]> {
  const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLng}&lamax=${maxLat}&lomax=${maxLng}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[openSkyCity] fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const aircraft: LowAltAircraft[] = []

  for (const s of data.states ?? []) {
    const baroAlt = s[7] as number | null
    const geoAlt = s[13] as number | null
    const alt = baroAlt ?? geoAlt
    if (alt === null || alt > MAX_ALT_METERS) continue

    const lat = s[6] as number | null
    const lng = s[5] as number | null
    if (lat === null || lng === null) continue

    const onGround = s[8] as boolean
    if (onGround) continue  // skip grounded aircraft

    aircraft.push({
      id: s[0] as string,
      icao24: s[0] as string,
      callsign: ((s[1] as string) ?? '').trim(),
      lat, lng,
      altitude: alt,
      velocity: (s[9] as number) ?? 0,
      heading: (s[10] as number) ?? 0,
      verticalRate: (s[11] as number) ?? 0,
      squawk: (s[14] as string) ?? null,
      onGround,
      timestamp: ((s[3] as number) ?? Math.floor(Date.now() / 1000)) * 1000,
    })
  }

  return aircraft
}
