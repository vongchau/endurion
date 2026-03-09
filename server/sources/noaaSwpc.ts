// server/sources/noaaSwpc.ts
// NOAA Space Weather Prediction Center — alerts + current conditions

const ALERTS_URL = 'https://services.swpc.noaa.gov/products/alerts.json'
const SCALES_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json'
const KP_URL     = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'

export interface SpaceWeatherAlert {
  id: string
  timestamp: string
  category: 'geomagnetic' | 'solar_radiation' | 'radio_blackout' | 'electron_flux' | 'other'
  severity: 'warning' | 'alert' | 'watch' | 'summary'
  title: string
  message: string
}

export interface SpaceWeatherScales {
  timestamp: string
  R: { scale: number; text: string }  // Radio blackout
  S: { scale: number; text: string }  // Solar radiation
  G: { scale: number; text: string }  // Geomagnetic storm
}

export interface KpIndex {
  timestamp: string
  kp: number
  observed: number
}

export interface SpaceWeather {
  alerts: SpaceWeatherAlert[]
  scales: SpaceWeatherScales | null
  kpIndex: KpIndex | null
}

function categorizeAlert(productId: string): SpaceWeatherAlert['category'] {
  if (productId.startsWith('K')) return 'geomagnetic'
  if (productId.startsWith('A')) return 'solar_radiation'
  if (productId.startsWith('EF')) return 'electron_flux'
  if (productId.startsWith('B') || productId.startsWith('TII')) return 'radio_blackout'
  return 'other'
}

function classifySeverity(msg: string): SpaceWeatherAlert['severity'] {
  const upper = msg.toUpperCase()
  if (upper.includes('ALERT:') || upper.includes('CONTINUED ALERT')) return 'alert'
  if (upper.includes('WARNING:') || upper.includes('EXTENDED WARNING')) return 'warning'
  if (upper.includes('WATCH:')) return 'watch'
  return 'summary'
}

function extractTitle(msg: string): string {
  // Extract the key line after "ALERT:", "WARNING:", etc.
  const lines = msg.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    if (/^(CONTINUED\s+)?ALERT:|^(EXTENDED\s+)?WARNING:|^WATCH:/i.test(line.trim())) {
      return line.trim()
    }
  }
  // Fallback: find the first descriptive line after the header
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 20 && !trimmed.startsWith('Space Weather') && !trimmed.startsWith('Serial') && !trimmed.startsWith('Issue')) {
      return trimmed
    }
  }
  return lines[0]?.trim() ?? 'Space Weather Alert'
}

export async function fetchSpaceWeather(): Promise<SpaceWeather> {
  const [alertsRes, scalesRes, kpRes] = await Promise.allSettled([
    fetch(ALERTS_URL),
    fetch(SCALES_URL),
    fetch(KP_URL),
  ])

  // Parse alerts
  let alerts: SpaceWeatherAlert[] = []
  if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
    const raw = await alertsRes.value.json() as Array<{ product_id: string; issue_datetime: string; message: string }>
    alerts = raw.slice(0, 20).map((a, i) => ({
      id: `swpc-${i}-${a.product_id}`,
      timestamp: a.issue_datetime,
      category: categorizeAlert(a.product_id),
      severity: classifySeverity(a.message),
      title: extractTitle(a.message),
      message: a.message.replace(/\r\n/g, '\n').trim(),
    }))
  }

  // Parse current scales (index "0" is current)
  let scales: SpaceWeatherScales | null = null
  if (scalesRes.status === 'fulfilled' && scalesRes.value.ok) {
    const raw = await scalesRes.value.json() as Record<string, any>
    const current = raw['0']
    if (current) {
      scales = {
        timestamp: `${current.DateStamp} ${current.TimeStamp}`,
        R: { scale: Number(current.R?.Scale ?? 0), text: current.R?.Text ?? 'none' },
        S: { scale: Number(current.S?.Scale ?? 0), text: current.S?.Text ?? 'none' },
        G: { scale: Number(current.G?.Scale ?? 0), text: current.G?.Text ?? 'none' },
      }
    }
  }

  // Parse Kp index (latest entry)
  let kpIndex: KpIndex | null = null
  if (kpRes.status === 'fulfilled' && kpRes.value.ok) {
    const raw = await kpRes.value.json() as string[][]
    const last = raw[raw.length - 1]
    if (last) {
      kpIndex = {
        timestamp: last[0],
        kp: parseFloat(last[1]),
        observed: parseInt(last[2], 10),
      }
    }
  }

  return { alerts, scales, kpIndex }
}
