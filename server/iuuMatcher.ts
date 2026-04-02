// server/iuuMatcher.ts — Hybrid IUU matching: real-time identity + periodic EEZ sweep
import {
  lookupByMmsi, lookupByImo, lookupByName, lookupByCallSign,
  persistMatch, persistEEZAlert, loadPersistedMatches, loadPersistedAlerts,
  type PersistedMatch,
} from './iuuDb'
import { findEEZsContainingPoint } from './eezCache'
import { getVesselByMmsi, addProtectedMmsi } from './aisCache'
import type { AISVessel, IUUMatch, IUUAlert, IUUConfidence } from '../src/types'

const MAX_ALERTS = 200
const SWEEP_INTERVAL_MS = 30_000

// Vessels currently flagged as IUU matches (mmsi -> match info)
const flaggedVessels = new Map<number, IUUMatch>()

// Recent IUU-in-EEZ alerts (in-memory, backed by SQLite)
const alertStore: IUUAlert[] = []
let alertIdCounter = 0

// --- Real-time identity check (called on every AIS message) ---

export function checkVesselIdentity(
  mmsi: number, imo: number, name: string, callSign: string,
): IUUMatch | null {
  const matchedFields: string[] = []
  let confidence: IUUConfidence = 'LOW'
  let record = lookupByMmsi(mmsi)
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

  // Protect from cache eviction
  addProtectedMmsi(mmsi)

  // Persist to SQLite
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
    firstSeen: isNew ? now : now, // upsert keeps original first_seen via ON CONFLICT
    lastSeen: now,
    lastLat: vessel?.lat ?? 0,
    lastLng: vessel?.lng ?? 0,
  })

  if (isNew) {
    console.log(`[iuuMatcher] FLAGGED: ${name || record.name} (MMSI ${mmsi}) [${confidence}] matched: ${matchedFields.join(', ')}`)
  }

  return match
}

// --- Periodic EEZ sweep (every 30s) ---

function sweepEEZ(): void {
  const now = Date.now()
  for (const [mmsi, match] of flaggedVessels) {
    const vessel = getVesselByMmsi(mmsi)
    if (!vessel) continue
    const eezHits = findEEZsContainingPoint(vessel.lat, vessel.lng)
    if (eezHits.length === 0) continue
    for (const eez of eezHits) {
      const isDuplicate = alertStore.some(a =>
        a.vessel.mmsi === mmsi && a.eezMrgid === eez.mrgid && now - a.timestamp < 30 * 60 * 1000,
      )
      if (isDuplicate) continue
      const alert: IUUAlert = {
        id: `iuu-${++alertIdCounter}`,
        vessel: { ...vessel },
        match,
        eezName: eez.name,
        eezMrgid: eez.mrgid,
        timestamp: now,
      }
      alertStore.unshift(alert)

      // Persist to SQLite
      persistEEZAlert({
        mmsi,
        vesselName: vessel.name,
        confidence: match.confidence,
        eezName: eez.name,
        eezMrgid: eez.mrgid,
        lat: vessel.lat,
        lng: vessel.lng,
        timestamp: now,
      })

      console.log(`[iuuMatcher] ALERT: ${vessel.name} (MMSI ${mmsi}) in ${eez.name} [${match.confidence}]`)
    }
  }
  while (alertStore.length > MAX_ALERTS) alertStore.pop()
}

// --- Startup: load persisted data ---

function loadPersisted(): void {
  // Load persisted matches
  const matches = loadPersistedMatches()
  for (const m of matches) {
    const iuuMatch: IUUMatch = {
      confidence: m.confidence,
      record: {
        mmsi: m.mmsi,
        imo: m.imo,
        name: m.iuuName,
        callSign: m.callSign,
        flag: m.iuuFlag,
        listedDate: '',
        listingAuthority: m.iuuAuthority,
        reason: m.iuuReason,
      },
      matchedFields: m.matchedFields,
    }
    flaggedVessels.set(m.mmsi, iuuMatch)
    addProtectedMmsi(m.mmsi)
  }
  if (matches.length > 0) {
    console.log(`[iuuMatcher] loaded ${matches.length} persisted IUU matches`)
  }

  // Load persisted alerts
  const alerts = loadPersistedAlerts()
  for (const a of alerts) {
    const match = flaggedVessels.get(a.mmsi)
    if (!match) continue
    alertStore.push({
      id: `iuu-${++alertIdCounter}`,
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
  sweepTimer = setInterval(sweepEEZ, SWEEP_INTERVAL_MS)
  console.log('[iuuMatcher] started (30s EEZ sweep)')
}

export function stopIUUMatcher(): void {
  if (sweepTimer) clearInterval(sweepTimer)
}
