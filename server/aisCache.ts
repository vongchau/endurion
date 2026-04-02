// server/aisCache.ts
import type {
  AISVessel, VesselDensityZone, MilitaryCandidate, Chokepoint, AISDisruption,
} from '../src/types'

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_VESSELS       = 20_000
const STALE_MS          = 30 * 60 * 1000   // 30 min
const CANDIDATE_TTL_MS  = 2 * 60 * 60 * 1000
const DENSITY_WINDOW_MS = 30 * 60 * 1000
const GAP_THRESHOLD_MS  = 60 * 60 * 1000
const GRID_SIZE         = 2                 // degrees
const MAX_ZONES         = 200

const NAVAL_RE = /^(USS|USNS|HMS|HMAS|HMCS|INS|JS|ROKS|TCG|FS|BNS|RFS|PLAN|PLA|CGC|PNS|KRI|ITS|SNS)\b/i

export const CHOKEPOINT_DEFS = [
  { name: 'Strait of Hormuz',     lat: 26.5, lng: 56.5,  radius: 2   },
  { name: 'Suez Canal',           lat: 30.0, lng: 32.5,  radius: 1   },
  { name: 'Strait of Malacca',    lat:  2.5, lng: 101.5, radius: 2   },
  { name: 'Bab el-Mandeb',        lat: 12.5, lng: 43.5,  radius: 1.5 },
  { name: 'Panama Canal',         lat:  9.0, lng: -79.5, radius: 1   },
  { name: 'Taiwan Strait',        lat: 24.5, lng: 119.5, radius: 2   },
  { name: 'South China Sea',      lat: 15.0, lng: 115.0, radius: 5   },
  { name: 'Black Sea',            lat: 43.5, lng: 34.0,  radius: 3   },
  { name: 'Gibraltar',            lat: 35.9, lng: -5.5,  radius: 1   },
  { name: 'English Channel',      lat: 50.5, lng:  1.0,  radius: 1.5 },
  { name: 'Dardanelles',          lat: 40.2, lng: 26.4,  radius: 0.5 },
  { name: 'Mozambique Channel',   lat: -17.0, lng: 42.0, radius: 3   },
]

// ── Density cell with previous-count tracking ───────────────────────────────
interface DensityCell {
  mmsiSet: Set<number>
  previousCount: number
}

// ── In-memory stores ─────────────────────────────────────────────────────────
let vesselCache        = new Map<number, AISVessel>()
let vesselHistory      = new Map<number, number[]>()   // mmsi → [timestamps]
let densityGrid        = new Map<string, DensityCell>() // gridKey → cell
let candidateStore     = new Map<number, MilitaryCandidate>()
const protectedMmsis   = new Set<number>()              // IUU-flagged, exempt from eviction
let messageCount       = 0

// ── Helpers ──────────────────────────────────────────────────────────────────
export function getShipTypeName(type: number): string {
  if (type === 35 || type === 55) return 'Military'
  if (type >= 70 && type <= 79) return 'Cargo'
  if (type >= 80 && type <= 89) return 'Tanker'
  if (type >= 60 && type <= 69) return 'Passenger'
  if (type >= 40 && type <= 49) return 'High Speed'
  if (type >= 50 && type <= 59) return 'Special Craft'
  if (type >= 30 && type <= 39) return 'Fishing'
  if (type >= 20 && type <= 29) return 'WIG'
  if (type === 0) return 'Unknown'
  return 'Other'
}

export function getShipTypeColor(type: number): string {
  if (type === 35 || type === 55) return '#dc2626'
  if (type >= 70 && type <= 79) return '#22c55e'
  if (type >= 80 && type <= 89) return '#ef4444'
  if (type >= 60 && type <= 69) return '#3b82f6'
  if (type >= 40 && type <= 49) return '#f59e0b'
  if (type >= 50 && type <= 59) return '#8b5cf6'
  if (type >= 30 && type <= 39) return '#06b6d4'
  return '#6b7280'
}

function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_SIZE) * GRID_SIZE},${Math.floor(lng / GRID_SIZE) * GRID_SIZE}`
}

export function isLikelyMilitary(
  mmsi: number, shipType: number, name: string,
): { isMilitary: boolean; reason: string } {
  if (shipType === 35 || shipType === 55)
    return { isMilitary: true, reason: `Ship type ${shipType} (military)` }
  if (shipType >= 50 && shipType <= 59)
    return { isMilitary: true, reason: `Ship type ${shipType} (special craft)` }
  if (name && NAVAL_RE.test(name))
    return { isMilitary: true, reason: `Naval prefix: ${name}` }
  const s = String(mmsi)
  if (s.length >= 9) {
    const suffix = s.slice(3)
    if (suffix.startsWith('00') || suffix.startsWith('99'))
      return { isMilitary: true, reason: `MMSI pattern: ${mmsi}` }
  }
  return { isMilitary: false, reason: '' }
}

// ── Core processing ───────────────────────────────────────────────────────────
export function processVesselMessage(
  mmsi: number, lat: number, lng: number, shipType: number,
  name: string, speed: number, course: number, heading: number,
  destination?: string, callSign?: string, imo?: number,
  draught?: number, eta?: string,
  dimA?: number, dimB?: number, dimC?: number, dimD?: number,
): void {
  const now = Date.now()
  const existing = vesselCache.get(mmsi)

  const vessel: AISVessel = {
    mmsi, lat, lng, speed, course, heading,
    shipType:     shipType || existing?.shipType || 0,
    shipTypeName: getShipTypeName(shipType || existing?.shipType || 0),
    name:         name || existing?.name || '',
    destination:  destination || existing?.destination || '',
    callSign:     callSign || existing?.callSign || '',
    imo:          imo || existing?.imo || 0,
    draught:      draught || existing?.draught || 0,
    eta:          eta || existing?.eta || '',
    lengthOverall: (dimA ?? existing?.lengthOverall ?? 0) + (dimB ?? 0),
    beam:          (dimC ?? existing?.beam ?? 0) + (dimD ?? 0),
    timestamp:    now,
  }

  // Preserve computed dimensions if no new dimensions provided
  if (dimA === undefined && existing) {
    vessel.lengthOverall = existing.lengthOverall
    vessel.beam = existing.beam
  }

  vesselCache.set(mmsi, vessel)
  messageCount++

  // Density grid
  const key = gridKey(lat, lng)
  if (!densityGrid.has(key)) densityGrid.set(key, { mmsiSet: new Set(), previousCount: 0 })
  densityGrid.get(key)!.mmsiSet.add(mmsi)

  // Vessel history for dark-ship detection
  const hist = vesselHistory.get(mmsi) ?? []
  hist.push(now)
  if (hist.length > 10) hist.shift()
  vesselHistory.set(mmsi, hist)

  // Military candidate
  const { isMilitary, reason } = isLikelyMilitary(mmsi, vessel.shipType, vessel.name)
  if (isMilitary) {
    candidateStore.set(mmsi, {
      mmsi, name: vessel.name, lat, lng, heading, speed, course,
      shipType: vessel.shipType, reason, timestamp: now,
    })
  }

  // Evict oldest when at capacity (skip IUU-protected vessels)
  if (vesselCache.size > MAX_VESSELS) {
    let oldestMmsi = 0, oldestTime = Infinity
    for (const [m, v] of vesselCache) {
      if (protectedMmsis.has(m)) continue
      if (v.timestamp < oldestTime) { oldestTime = v.timestamp; oldestMmsi = m }
    }
    if (oldestMmsi) vesselCache.delete(oldestMmsi)
  }
}

// ── Getters (called by routes) ────────────────────────────────────────────────
export function getDensityZones(): VesselDensityZone[] {
  const cutoff = Date.now() - DENSITY_WINDOW_MS

  const cells = Array.from(densityGrid.entries())
    .map(([key, cell]) => {
      // Filter out stale vessels from the set
      for (const mmsi of cell.mmsiSet) {
        const v = vesselCache.get(mmsi)
        if (!v || v.timestamp < cutoff) cell.mmsiSet.delete(mmsi)
      }
      const [latStr, lngStr] = key.split(',')
      const currentCount = cell.mmsiSet.size
      const deltaPct = cell.previousCount > 0
        ? Math.round(((currentCount - cell.previousCount) / cell.previousCount) * 100)
        : 0
      return {
        lat: parseFloat(latStr) + GRID_SIZE / 2,
        lng: parseFloat(lngStr) + GRID_SIZE / 2,
        vesselCount: currentCount,
        deltaPct,
      }
    })
    .filter(c => c.vesselCount >= 2)

  if (cells.length === 0) return []

  const max = Math.max(...cells.map(c => c.vesselCount))
  const min = Math.min(...cells.map(c => c.vesselCount))
  const logMax = Math.log(max + 1)
  const logMin = Math.log(min + 1)

  return cells
    .map(c => ({
      ...c,
      intensity: logMax > logMin
        ? 0.2 + 0.8 * (Math.log(c.vesselCount + 1) - logMin) / (logMax - logMin)
        : 0.5,
    }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, MAX_ZONES)
}

export function getMilitaryCandidates(): MilitaryCandidate[] {
  const now = Date.now()
  return Array.from(candidateStore.values())
    .filter(c => now - c.timestamp < CANDIDATE_TTL_MS)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500)
}

export function getChokepoints(): Chokepoint[] {
  return CHOKEPOINT_DEFS.map(cp => {
    let count = 0
    const vesselTypes: Record<string, number> = {}
    for (const v of vesselCache.values()) {
      const dist = Math.sqrt(Math.pow(v.lat - cp.lat, 2) + Math.pow(v.lng - cp.lng, 2))
      if (dist <= cp.radius) {
        count++
        const t = getShipTypeName(v.shipType)
        vesselTypes[t] = (vesselTypes[t] || 0) + 1
      }
    }
    return { name: cp.name, lat: cp.lat, lng: cp.lng, radius: cp.radius, vesselCount: count, vesselTypes }
  })
}

export function getDisruptions(): AISDisruption[] {
  const disruptions: AISDisruption[] = []
  const now = Date.now()

  // Chokepoint congestion
  for (const cp of CHOKEPOINT_DEFS) {
    let count = 0
    for (const v of vesselCache.values()) {
      const dist = Math.sqrt(Math.pow(v.lat - cp.lat, 2) + Math.pow(v.lng - cp.lng, 2))
      if (dist <= cp.radius) count++
    }
    if (count < 3) continue
    const normalTraffic = cp.radius * 10
    const severity: AISDisruption['severity'] =
      count > normalTraffic * 1.5 ? 'high' : count > normalTraffic ? 'elevated' : 'low'
    disruptions.push({
      id: `chokepoint-${cp.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: cp.name,
      type: 'chokepoint_congestion',
      lat: cp.lat, lng: cp.lng, severity, vesselCount: count,
      description: `${count} vessels in ${cp.name}`,
      region: cp.name,
    })
  }

  // Dark ship — AIS gap spike
  let darkCount = 0
  for (const hist of vesselHistory.values()) {
    if (hist.length >= 2) {
      const last = hist[hist.length - 1]
      const prev = hist[hist.length - 2]
      if (last - prev > GAP_THRESHOLD_MS && now - last < 10 * 60 * 1000) darkCount++
    }
  }
  if (darkCount >= 1) {
    disruptions.push({
      id: 'global-dark-ship',
      name: 'AIS Gap Spike',
      type: 'dark_ship',
      lat: 0, lng: 0,
      severity: darkCount > 20 ? 'high' : darkCount > 10 ? 'elevated' : 'low',
      vesselCount: darkCount,
      description: `${darkCount} vessel${darkCount > 1 ? 's' : ''} reappeared after AIS silence >1h`,
      region: 'Global',
    })
  }

  return disruptions
}

export function getStats() {
  const byType: Record<string, number> = {}
  for (const v of vesselCache.values()) {
    const typeName = getShipTypeName(v.shipType)
    byType[typeName] = (byType[typeName] || 0) + 1
  }
  return { vessels: vesselCache.size, messages: messageCount, byType }
}

export function getAllVessels(): AISVessel[] {
  return Array.from(vesselCache.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5_000)
}

export function getVesselByMmsi(mmsi: number): AISVessel | undefined {
  return vesselCache.get(mmsi)
}

export function addProtectedMmsi(mmsi: number): void {
  protectedMmsis.add(mmsi)
}

/** Check if a vessel just reappeared after a dark period (>1h gap).
 *  Returns gap duration in minutes, or 0 if no significant gap. */
export function checkDarkPeriod(mmsi: number): number {
  const hist = vesselHistory.get(mmsi)
  if (!hist || hist.length < 2) return 0
  const last = hist[hist.length - 1]
  const prev = hist[hist.length - 2]
  const gap = last - prev
  if (gap > GAP_THRESHOLD_MS) return Math.round(gap / 60_000)
  return 0
}

/** Get all vessels in the cache (for proximity checks). */
export function getVesselCache(): Map<number, AISVessel> {
  return vesselCache
}

export function getVesselsInBounds(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): AISVessel[] {
  const results: AISVessel[] = []
  for (const v of vesselCache.values()) {
    if (v.lat >= minLat && v.lat <= maxLat && v.lng >= minLng && v.lng <= maxLng) {
      results.push(v)
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5_000)
}

export interface VesselIntel {
  found: boolean
  military: { isMilitary: boolean; reason: string }
  inChokepoints: string[]
  nearestChokepoint: { name: string; distanceDeg: number } | null
  aisGaps: { totalReports: number; maxGapMs: number; isDarkShip: boolean }
}

export function getVesselIntel(mmsi: number): VesselIntel {
  const vessel = vesselCache.get(mmsi)
  if (!vessel) {
    return {
      found: false,
      military: { isMilitary: false, reason: '' },
      inChokepoints: [],
      nearestChokepoint: null,
      aisGaps: { totalReports: 0, maxGapMs: 0, isDarkShip: false },
    }
  }

  // Military classification
  const military = isLikelyMilitary(mmsi, vessel.shipType, vessel.name)

  // Chokepoint proximity
  const inChokepoints: string[] = []
  let nearestChokepoint: VesselIntel['nearestChokepoint'] = null
  let minDist = Infinity

  for (const cp of CHOKEPOINT_DEFS) {
    const dist = Math.sqrt(Math.pow(vessel.lat - cp.lat, 2) + Math.pow(vessel.lng - cp.lng, 2))
    if (dist <= cp.radius) {
      inChokepoints.push(cp.name)
    }
    if (dist < minDist) {
      minDist = dist
      nearestChokepoint = { name: cp.name, distanceDeg: Math.round(dist * 100) / 100 }
    }
  }

  // AIS gap analysis
  const hist = vesselHistory.get(mmsi) ?? []
  let maxGapMs = 0
  let isDarkShip = false
  const now = Date.now()

  for (let i = 1; i < hist.length; i++) {
    const gap = hist[i] - hist[i - 1]
    if (gap > maxGapMs) maxGapMs = gap
  }

  if (hist.length >= 2) {
    const lastGap = hist[hist.length - 1] - hist[hist.length - 2]
    if (lastGap > GAP_THRESHOLD_MS && now - hist[hist.length - 1] < 10 * 60 * 1000) {
      isDarkShip = true
    }
  }

  return {
    found: true,
    military,
    inChokepoints,
    nearestChokepoint,
    aisGaps: { totalReports: hist.length, maxGapMs, isDarkShip },
  }
}

export function getSnapshot() {
  const byType: Record<string, number> = {}
  for (const v of vesselCache.values()) {
    const typeName = getShipTypeName(v.shipType)
    byType[typeName] = (byType[typeName] || 0) + 1
  }

  return {
    timestamp: new Date().toISOString(),
    status: { vessels: vesselCache.size, messages: messageCount, byType },
    disruptions: getDisruptions(),
    density: getDensityZones(),
    candidateReports: getMilitaryCandidates(),
    chokepoints: getChokepoints(),
  }
}

export function cleanupStaleVessels(): void {
  const cutoff = Date.now() - STALE_MS
  let removed = 0
  for (const [mmsi, v] of vesselCache) {
    if (v.timestamp < cutoff) { vesselCache.delete(mmsi); removed++ }
  }
  // Prune empty density cells + snapshot previous counts
  for (const [key, cell] of densityGrid) {
    cell.previousCount = cell.mmsiSet.size
    for (const mmsi of cell.mmsiSet) {
      if (!vesselCache.has(mmsi)) cell.mmsiSet.delete(mmsi)
    }
    if (cell.mmsiSet.size === 0) densityGrid.delete(key)
  }
  // Prune stale candidates
  const candCutoff = Date.now() - CANDIDATE_TTL_MS
  for (const [mmsi, c] of candidateStore) {
    if (c.timestamp < candCutoff) candidateStore.delete(mmsi)
  }
  // Prune stale history
  for (const [mmsi] of vesselHistory) {
    if (!vesselCache.has(mmsi)) vesselHistory.delete(mmsi)
  }
  if (removed > 0) console.log(`[aisCache] cleaned ${removed} stale vessels, ${vesselCache.size} remaining`)
}

// ── Test helper — resets all state ───────────────────────────────────────────
export function _resetForTest(): void {
  vesselCache = new Map()
  vesselHistory = new Map()
  densityGrid = new Map()
  candidateStore = new Map()
  messageCount = 0
}
