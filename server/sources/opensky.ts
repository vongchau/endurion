// server/sources/opensky.ts
import type { MilitaryFlight } from '../../src/types'

const OPENSKY_URL = 'https://opensky-network.org/api/states/all'

const MILITARY_PREFIXES = [
  'RCH', 'REACH', 'EVAC', 'NATO', 'RRR', 'GAF',
  'BAF', 'IAM', 'DUKE', 'MAROC', 'TOPGUN', 'VIPER',
  'GHOST', 'KNIFE', 'SLAM', 'COBRA', 'HAWK',
]

// ICAO 24-bit hex ranges for military aircraft
const MILITARY_ICAO_RANGES: Array<[number, number]> = [
  [0xAE0000, 0xAEFFFF], // US military
  [0x43C000, 0x43CFFF], // French military
  [0x3A0000, 0x3AFFFF], // UK military
  [0x68C000, 0x68CFFF], // German military
  [0x710000, 0x71FFFF], // Chinese military
]

export function isMilitary(icao24: string, callsign: string): boolean {
  if (!callsign?.trim()) return false
  const cs = callsign.trim().toUpperCase()
  if (MILITARY_PREFIXES.some((p) => cs.startsWith(p))) return true
  const icaoNum = parseInt(icao24, 16)
  return MILITARY_ICAO_RANGES.some(([min, max]) => icaoNum >= min && icaoNum <= max)
}

export async function fetchOpenSky(clientId?: string, clientSecret?: string): Promise<MilitaryFlight[]> {
  const headers: Record<string, string> = {}
  if (clientId && clientSecret) {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }

  const res = await fetch(OPENSKY_URL, { headers })
  if (!res.ok) throw new Error(`OpenSky fetch failed: ${res.status}`)
  const json = await res.json()

  type StateVector = [string, string | null, string, number | null, number, number | null, number | null, number | null, boolean, number | null, number | null, ...unknown[]]

  return (json.states ?? [])
    .filter((s: StateVector) => s[5] !== null && s[6] !== null && isMilitary(s[0], s[1] ?? ''))
    .map((s: StateVector): MilitaryFlight => ({
      id: s[0],
      callsign: (s[1] ?? '').trim(),
      lat: s[6] as number,
      lng: s[5] as number,
      altitude: (s[7] ?? 0) as number,
      velocity: (s[9] ?? 0) as number,
      heading: (s[10] ?? 0) as number,
      country: s[2] ?? 'Unknown',
      timestamp: new Date((s[3] ?? Date.now() / 1000) * 1000).toISOString(),
    }))
}
