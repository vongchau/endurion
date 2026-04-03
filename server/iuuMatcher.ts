// server/iuuMatcher.ts — IUU detection: identity matching, dark periods, EEZ dwell, transshipment
import {
  lookupByMmsi, lookupByImo, lookupByName, lookupByCallSign,
  persistMatch, persistEEZAlert, loadPersistedMatches, loadPersistedAlerts,
  persistDwell, removeDwell, loadPersistedDwells,
  type PersistedMatch,
} from './iuuDb'
import { findEEZsContainingPoint } from './eezCache'
import { getVesselByMmsi, addProtectedMmsi, checkDarkPeriod, getVesselCache } from './aisCache'
import type { AISVessel, IUUMatch, IUUAlert, IUUConfidence, IUURecord } from '../src/types'

const MAX_ALERTS = 500
const SWEEP_INTERVAL_MS = 30_000
const DWELL_ESCALATION_MINUTES = 120  // 2 hours
const TRANSSHIPMENT_DISTANCE_KM = 1
const IN_PORT_SPEED_KN = 1  // Vessels below this speed are likely in port/anchored
const TRANSSHIPMENT_MIN_DURATION_MS = 30 * 60 * 1000  // 30 minutes
// Ship types that commonly receive transshipped catch
const REEFER_TYPES = new Set([70, 71, 72, 73, 74, 75, 76, 77, 78, 79]) // Cargo types
const FISHING_TYPES = new Set([30, 31, 32, 33, 34, 35, 36, 37, 38, 39])

// --- In-memory stores ---

const flaggedVessels = new Map<number, IUUMatch>()
const alertStore: IUUAlert[] = []
let alertIdCounter = 0

// EEZ dwell tracking: key = "mmsi-mrgid"
const dwellTracker = new Map<string, { entryTime: number; lastSeen: number; totalMinutes: number; escalated: boolean }>()

// Transshipment proximity tracking: key = "mmsiA-mmsiB" (sorted)
const proximityTracker = new Map<string, { firstSeen: number; alerted: boolean }>()

// --- Helpers ---

function dwellKey(mmsi: number, mrgid: number): string { return `${mmsi}-${mrgid}` }

function proximityKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function addAlert(alert: IUUAlert): void {
  alertStore.unshift(alert)
  while (alertStore.length > MAX_ALERTS) alertStore.pop()
}

function makeEmptyMatch(name: string): IUUMatch {
  return {
    confidence: 'LOW',
    record: { mmsi: 0, imo: 0, name, callSign: '', flag: '', listedDate: '', listingAuthority: '', reason: '' },
    matchedFields: ['behavior'],
  }
}

// --- 1. Identity check (real-time, called per AIS message) ---

export function checkVesselIdentity(
  mmsi: number, imo: number, name: string, callSign: string,
): IUUMatch | null {
  const matchedFields: string[] = []
  let confidence: IUUConfidence = 'LOW'
  let record: IUURecord | undefined = lookupByMmsi(mmsi)
  if (record) matchedFields.push('mmsi')

  const imoRec = imo > 0 ? lookupByImo(imo) : undefined
  if (imoRec) { record = record ?? imoRec; matchedFields.push('imo') }

  const nameRec = name ? lookupByName(name) : undefined
  if (nameRec) { record = record ?? nameRec; matchedFields.push('name') }

  const csRec = callSign ? lookupByCallSign(callSign) : undefined
  if (csRec) { record = record ?? csRec; matchedFields.push('callSign') }

  if (!record || matchedFields.length === 0) return null

  if (matchedFields.includes('mmsi') && matchedFields.includes('imo')) {
    confidence = 'HIGH'
  } else if (matchedFields.includes('name') && matchedFields.includes('callSign')) {
    confidence = 'MEDIUM'
  } else if (matchedFields.length >= 2) {
    confidence = 'MEDIUM'
  }

  const match: IUUMatch = { confidence, record, matchedFields }
  const isNew = !flaggedVessels.has(mmsi)
  flaggedVessels.set(mmsi, match)
  addProtectedMmsi(mmsi)

  // Persist
  const vessel = getVesselByMmsi(mmsi)
  const now = Date.now()
  persistMatch({
    mmsi,
    imo: imo || record.imo,
    vesselName: name || record.name,
    callSign: callSign || record.callSign,
    confidence,
    matchedFields,
    iuuName: record.name,
    iuuFlag: record.flag,
    iuuAuthority: record.listingAuthority,
    iuuReason: record.reason,
    firstSeen: now,
    lastSeen: now,
    lastLat: vessel?.lat ?? 0,
    lastLng: vessel?.lng ?? 0,
  })

  if (isNew) {
    console.log(`[iuuMatcher] FLAGGED: ${name || record.name} (MMSI ${mmsi}) [${confidence}] matched: ${matchedFields.join(', ')}`)
  }

  // 2. Dark period check (on every message for flagged vessels)
  const darkMinutes = checkDarkPeriod(mmsi)
  if (darkMinutes > 0 && vessel) {
    const eezHits = findEEZsContainingPoint(vessel.lat, vessel.lng)
    const nearEEZ = eezHits.length > 0
    if (nearEEZ) {
      const isDuplicate = alertStore.some(a =>
        a.category === 'dark_period' && a.vessel.mmsi === mmsi && now - a.timestamp < 60 * 60 * 1000,
      )
      if (!isDuplicate) {
        const alert: IUUAlert = {
          id: `iuu-${++alertIdCounter}`,
          category: 'dark_period',
          vessel: { ...vessel },
          match,
          eezName: eezHits[0].name,
          eezMrgid: eezHits[0].mrgid,
          timestamp: now,
          darkMinutes,
          detail: `Vessel went dark for ${darkMinutes} minutes, reappeared in ${eezHits[0].name}`,
        }
        addAlert(alert)
        persistEEZAlert({
          mmsi, vesselName: vessel.name, confidence: match.confidence,
          eezName: eezHits[0].name, eezMrgid: eezHits[0].mrgid,
          lat: vessel.lat, lng: vessel.lng, timestamp: now,
        })
        console.log(`[iuuMatcher] DARK PERIOD: ${vessel.name} (MMSI ${mmsi}) went dark ${darkMinutes}min, reappeared in ${eezHits[0].name}`)
      }
    }
  }

  return match
}

// --- 3. EEZ sweep with dwell tracking ---

function sweepEEZ(): void {
  const now = Date.now()

  // Track which dwell keys are still active this sweep
  const activeDwells = new Set<string>()

  for (const [mmsi, match] of flaggedVessels) {
    const vessel = getVesselByMmsi(mmsi)
    if (!vessel) continue

    // Skip vessels in port or at anchor (speed < 1 kn)
    const isInPort = vessel.speed < IN_PORT_SPEED_KN
    if (isInPort) continue

    const eezHits = findEEZsContainingPoint(vessel.lat, vessel.lng)

    for (const eez of eezHits) {
      const key = dwellKey(mmsi, eez.mrgid)
      activeDwells.add(key)

      let dwell = dwellTracker.get(key)
      if (!dwell) {
        // New entry into this EEZ
        dwell = { entryTime: now, lastSeen: now, totalMinutes: 0, escalated: false }
        dwellTracker.set(key, dwell)
      }

      dwell.lastSeen = now
      dwell.totalMinutes = (now - dwell.entryTime) / 60_000

      // Persist dwell
      persistDwell(mmsi, eez.mrgid, dwell.entryTime, dwell.lastSeen, dwell.totalMinutes)

      // Standard EEZ violation alert (dedup: 30 min)
      const isDuplicate = alertStore.some(a =>
        a.category === 'eez_violation' && a.vessel.mmsi === mmsi &&
        a.eezMrgid === eez.mrgid && now - a.timestamp < 30 * 60 * 1000,
      )
      if (!isDuplicate) {
        const alert: IUUAlert = {
          id: `iuu-${++alertIdCounter}`,
          category: 'eez_violation',
          vessel: { ...vessel },
          match,
          eezName: eez.name,
          eezMrgid: eez.mrgid,
          timestamp: now,
        }
        addAlert(alert)
        persistEEZAlert({
          mmsi, vesselName: vessel.name, confidence: match.confidence,
          eezName: eez.name, eezMrgid: eez.mrgid,
          lat: vessel.lat, lng: vessel.lng, timestamp: now,
        })
        console.log(`[iuuMatcher] EEZ ALERT: ${vessel.name} (MMSI ${mmsi}) in ${eez.name} [${match.confidence}]`)
      }

      // Dwell escalation alert (once per entry, after threshold)
      if (!dwell.escalated && dwell.totalMinutes >= DWELL_ESCALATION_MINUTES) {
        dwell.escalated = true
        const alert: IUUAlert = {
          id: `iuu-${++alertIdCounter}`,
          category: 'dwell_escalation',
          vessel: { ...vessel },
          match,
          eezName: eez.name,
          eezMrgid: eez.mrgid,
          timestamp: now,
          dwellMinutes: Math.round(dwell.totalMinutes),
          detail: `Vessel has been in ${eez.name} for ${Math.round(dwell.totalMinutes)} minutes`,
        }
        addAlert(alert)
        persistEEZAlert({
          mmsi, vesselName: vessel.name, confidence: 'HIGH',
          eezName: eez.name, eezMrgid: eez.mrgid,
          lat: vessel.lat, lng: vessel.lng, timestamp: now,
        })
        console.log(`[iuuMatcher] DWELL ESCALATION: ${vessel.name} in ${eez.name} for ${Math.round(dwell.totalMinutes)}min`)
      }
    }

    // If vessel left an EEZ, clean up dwell tracking for that EEZ
    if (eezHits.length === 0) {
      for (const [key, dwell] of dwellTracker) {
        if (key.startsWith(`${mmsi}-`)) {
          const mrgid = parseInt(key.split('-')[1], 10)
          removeDwell(mmsi, mrgid)
          dwellTracker.delete(key)
        }
      }
    }
  }
}

// --- 4. Transshipment detection ---

function sweepTransshipment(): void {
  const now = Date.now()
  const cache = getVesselCache()

  // Build a spatial grid for quick proximity lookup
  const grid = new Map<string, number[]>()
  const GRID_SIZE = 0.1 // ~11km cells

  for (const [mmsi, v] of cache) {
    // Only check flagged vessels against cargo/reefer
    if (!flaggedVessels.has(mmsi) && !REEFER_TYPES.has(v.shipType) && !FISHING_TYPES.has(v.shipType)) continue
    const cellKey = `${Math.floor(v.lat / GRID_SIZE)},${Math.floor(v.lng / GRID_SIZE)}`
    const cell = grid.get(cellKey) ?? []
    cell.push(mmsi)
    grid.set(cellKey, cell)
  }

  // Check adjacent cells for proximity
  for (const [cellKey, mmsis] of grid) {
    const [cy, cx] = cellKey.split(',').map(Number)
    const nearby: number[] = [...mmsis]

    // Add vessels from adjacent cells
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue
        const adj = grid.get(`${cy + dy},${cx + dx}`)
        if (adj) nearby.push(...adj)
      }
    }

    // Check pairs
    for (let i = 0; i < nearby.length; i++) {
      for (let j = i + 1; j < nearby.length; j++) {
        const mmsiA = nearby[i], mmsiB = nearby[j]
        const isFlaggedA = flaggedVessels.has(mmsiA)
        const isFlaggedB = flaggedVessels.has(mmsiB)
        if (!isFlaggedA && !isFlaggedB) continue // At least one must be IUU

        const vA = cache.get(mmsiA), vB = cache.get(mmsiB)
        if (!vA || !vB) continue

        // Skip if either vessel is stationary (in port)
        if (vA.speed < IN_PORT_SPEED_KN || vB.speed < IN_PORT_SPEED_KN) continue

        // One should be fishing/IUU, other should be cargo/reefer
        const aIsFishing = isFlaggedA || FISHING_TYPES.has(vA.shipType)
        const bIsFishing = isFlaggedB || FISHING_TYPES.has(vB.shipType)
        const aIsReefer = REEFER_TYPES.has(vA.shipType)
        const bIsReefer = REEFER_TYPES.has(vB.shipType)
        if (!(aIsFishing && bIsReefer) && !(bIsFishing && aIsReefer)) continue

        const dist = haversineKm(vA.lat, vA.lng, vB.lat, vB.lng)
        if (dist > TRANSSHIPMENT_DISTANCE_KM) continue

        const pKey = proximityKey(mmsiA, mmsiB)
        let tracker = proximityTracker.get(pKey)
        if (!tracker) {
          tracker = { firstSeen: now, alerted: false }
          proximityTracker.set(pKey, tracker)
        }

        const duration = now - tracker.firstSeen
        if (duration >= TRANSSHIPMENT_MIN_DURATION_MS && !tracker.alerted) {
          tracker.alerted = true
          const iuuVessel = isFlaggedA ? vA : vB
          const otherVessel = isFlaggedA ? vB : vA
          const match = flaggedVessels.get(iuuVessel.mmsi) ?? makeEmptyMatch(iuuVessel.name)

          const alert: IUUAlert = {
            id: `iuu-${++alertIdCounter}`,
            category: 'transshipment',
            vessel: { ...iuuVessel },
            match,
            eezName: '',
            eezMrgid: 0,
            timestamp: now,
            secondVessel: { ...otherVessel },
            detail: `Potential transshipment: ${iuuVessel.name} + ${otherVessel.name} within ${dist.toFixed(1)}km for ${Math.round(duration / 60_000)}min`,
          }
          addAlert(alert)
          console.log(`[iuuMatcher] TRANSSHIPMENT: ${iuuVessel.name} + ${otherVessel.name} (${dist.toFixed(1)}km, ${Math.round(duration / 60_000)}min)`)
        }
      }
    }
  }

  // Clean up stale proximity entries (vessels moved apart)
  for (const [pKey, tracker] of proximityTracker) {
    if (now - tracker.firstSeen > 2 * 60 * 60 * 1000) { // 2h max tracking
      proximityTracker.delete(pKey)
    }
  }
}

// --- Startup: load persisted data ---

function loadPersisted(): void {
  const matches = loadPersistedMatches()
  for (const m of matches) {
    const iuuMatch: IUUMatch = {
      confidence: m.confidence,
      record: {
        mmsi: m.mmsi, imo: m.imo, name: m.iuuName, callSign: m.callSign,
        flag: m.iuuFlag, listedDate: '', listingAuthority: m.iuuAuthority, reason: m.iuuReason,
      },
      matchedFields: m.matchedFields,
    }
    flaggedVessels.set(m.mmsi, iuuMatch)
    addProtectedMmsi(m.mmsi)
  }
  if (matches.length > 0) {
    console.log(`[iuuMatcher] loaded ${matches.length} persisted IUU matches`)
  }

  const alerts = loadPersistedAlerts()
  for (const a of alerts) {
    const match = flaggedVessels.get(a.mmsi)
    if (!match) continue
    alertStore.push({
      id: `iuu-${++alertIdCounter}`,
      category: 'eez_violation',
      vessel: {
        mmsi: a.mmsi, name: a.vessel_name ?? '', lat: a.lat ?? 0, lng: a.lng ?? 0,
        speed: 0, course: 0, heading: 0, shipType: 0, shipTypeName: '',
        destination: '', callSign: '', imo: 0, draught: 0, eta: '',
        lengthOverall: 0, beam: 0, timestamp: a.timestamp,
      },
      match,
      eezName: a.eez_name,
      eezMrgid: a.eez_mrgid,
      timestamp: a.timestamp,
    })
  }
  if (alerts.length > 0) {
    console.log(`[iuuMatcher] loaded ${alerts.length} persisted EEZ alerts`)
  }

  // Load persisted dwells
  const dwells = loadPersistedDwells()
  for (const d of dwells) {
    const key = dwellKey(d.mmsi, d.eezMrgid)
    dwellTracker.set(key, {
      entryTime: d.entryTime,
      lastSeen: d.lastSeenTime,
      totalMinutes: d.totalMinutes,
      escalated: d.totalMinutes >= DWELL_ESCALATION_MINUTES,
    })
  }
  if (dwells.length > 0) {
    console.log(`[iuuMatcher] loaded ${dwells.length} persisted EEZ dwell records`)
  }
}

// --- Exports ---

export function getIUUAlerts(): IUUAlert[] { return alertStore }

export function getFlaggedVessels(): { vessel: AISVessel; match: IUUMatch }[] {
  const results: { vessel: AISVessel; match: IUUMatch }[] = []
  for (const [mmsi, match] of flaggedVessels) {
    const vessel = getVesselByMmsi(mmsi)
    if (vessel) results.push({ vessel, match })
  }
  return results
}

let sweepTimer: ReturnType<typeof setInterval> | undefined

export function startIUUMatcher(): void {
  loadPersisted()
  sweepTimer = setInterval(() => {
    sweepEEZ()
    sweepTransshipment()
  }, SWEEP_INTERVAL_MS)
  console.log('[iuuMatcher] started (30s EEZ + transshipment sweep)')
}

export function stopIUUMatcher(): void {
  if (sweepTimer) clearInterval(sweepTimer)
}
