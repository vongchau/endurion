// server/iuuMatcher.ts — Hybrid IUU matching: real-time identity + periodic EEZ sweep
import { lookupByMmsi, lookupByImo, lookupByName, lookupByCallSign } from './iuuDb'
import { findEEZsContainingPoint } from './eezCache'
import { getVesselByMmsi } from './aisCache'
import type { AISVessel, IUUMatch, IUUAlert, IUUConfidence } from '../src/types'

const MAX_ALERTS = 200
const SWEEP_INTERVAL_MS = 30_000

const flaggedVessels = new Map<number, IUUMatch>()
const alertStore: IUUAlert[] = []
let alertIdCounter = 0

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
  flaggedVessels.set(mmsi, match)
  return match
}

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
      console.log(`[iuuMatcher] ALERT: ${vessel.name} (MMSI ${mmsi}) in ${eez.name} [${match.confidence}]`)
    }
  }
  while (alertStore.length > MAX_ALERTS) alertStore.pop()
}

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
  sweepTimer = setInterval(sweepEEZ, SWEEP_INTERVAL_MS)
  console.log('[iuuMatcher] started (30s EEZ sweep)')
}

export function stopIUUMatcher(): void {
  if (sweepTimer) clearInterval(sweepTimer)
}
