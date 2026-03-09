// server/sources/dronetag.ts

const BASE_URL = 'https://api.dronetag.com/v2/airspace/telemetry'

interface GlobalUAResponse {
  operation_id: string
  timestamp: string
  sensor_id: string
  latitude: number
  longitude: number
}

interface UATelemResponse {
  timestamp: string
  sensor_id: string
  operation_id: string
  operational_state?: string
  location?: { latitude: number; longitude: number; accuracy?: number }
  altitudes?: Array<{ type: string; value: number; accuracy?: number }>
  velocity?: {
    heading?: number
    horizontal_speed?: number
    vertical_speed?: number
  }
}

export interface RawDrone {
  operationId: string
  sensorId: string
  lat: number
  lng: number
  altitude: number
  speed: number
  verticalSpeed: number
  heading: number
  state: string
  timestamp: number
}

export async function fetchDronetag(
  apiKey: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<RawDrone[]> {
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }

  // Fetch latest positions (lightweight)
  const globalRes = await fetch(
    `${BASE_URL}/global-ua?bbox=${bbox}&max_age=5`,
    { headers },
  )
  if (!globalRes.ok) {
    console.error(`[dronetag] global-ua failed: ${globalRes.status}`)
    return []
  }
  const globalData: GlobalUAResponse[] = await globalRes.json()
  if (globalData.length === 0) return []

  // Fetch richer telemetry for the same bbox
  const telemRes = await fetch(
    `${BASE_URL}/ua?bbox=${bbox}&from=-PT5M&limit=1000&order=-time`,
    { headers },
  )
  const telemData: UATelemResponse[] = telemRes.ok ? await telemRes.json() : []

  // Index telemetry by operation_id (most recent wins)
  const telemByOp = new Map<string, UATelemResponse>()
  for (const t of telemData) {
    if (!telemByOp.has(t.operation_id)) telemByOp.set(t.operation_id, t)
  }

  // Merge global positions with detailed telemetry
  return globalData.map((g) => {
    const detail = telemByOp.get(g.operation_id)
    return {
      operationId: g.operation_id,
      sensorId: g.sensor_id,
      lat: g.latitude,
      lng: g.longitude,
      altitude: detail?.altitudes?.[0]?.value ?? 0,
      speed: detail?.velocity?.horizontal_speed ?? 0,
      verticalSpeed: detail?.velocity?.vertical_speed ?? 0,
      heading: detail?.velocity?.heading ?? 0,
      state: detail?.operational_state ?? 'unknown',
      timestamp: new Date(g.timestamp).getTime(),
    }
  })
}
