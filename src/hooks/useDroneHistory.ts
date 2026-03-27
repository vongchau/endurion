// src/hooks/useDroneHistory.ts — fetches 24h of drone history, provides positions at a given time
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { DroneHistoryPosition, DroneFlight } from '../types'

const HOURS_24 = 24 * 60 * 60 * 1000

export function useDroneHistory(enabled: boolean) {
  const [raw, setRaw] = useState<DroneHistoryPosition[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch full 24h history when entering playback mode
  useEffect(() => {
    if (!enabled) { setRaw([]); return }
    let active = true
    const doFetch = async () => {
      const to = Date.now()
      const from = to - HOURS_24
      try {
        const res = await fetch(`/api/drones/history?from=${from}&to=${to}`)
        if (res.ok && active) setRaw(await res.json())
      } catch (e) { console.error('[useDroneHistory]', e) }
      finally { if (active) setLoading(false) }
    }
    setLoading(true)
    doFetch()
    return () => { active = false }
  }, [enabled])

  // Group positions by operation_id for quick lookup
  const byDrone = useMemo(() => {
    const map = new Map<string, DroneHistoryPosition[]>()
    for (const p of raw) {
      let arr = map.get(p.operationId)
      if (!arr) { arr = []; map.set(p.operationId, arr) }
      arr.push(p)
    }
    return map
  }, [raw])

  // Get the time range of available data
  const timeRange = useMemo(() => {
    if (raw.length === 0) return null
    return { from: raw[0].timestamp, to: raw[raw.length - 1].timestamp }
  }, [raw])

  // Get drone positions at a specific playhead time (nearest position within 30s window)
  const getDronesAtTime = useCallback((time: number): DroneFlight[] => {
    const WINDOW = 30_000 // 30s window
    const drones: DroneFlight[] = []

    for (const [opId, positions] of byDrone) {
      // Binary search for the nearest position to the target time
      let lo = 0, hi = positions.length - 1
      let best = -1

      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (positions[mid].timestamp <= time) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (best === -1) continue
      const p = positions[best]
      if (time - p.timestamp > WINDOW) continue

      // Build trail: all positions up to this time for this drone
      const trail = positions
        .slice(0, best + 1)
        .map(tp => ({ lng: tp.lng, lat: tp.lat, timestamp: tp.timestamp }))

      drones.push({
        id: opId,
        sensorId: p.sensorId,
        lat: p.lat,
        lng: p.lng,
        altitude: p.altitude,
        speed: p.speed,
        verticalSpeed: p.verticalSpeed,
        heading: p.heading,
        state: p.state,
        timestamp: p.timestamp,
        trail,
      })
    }

    return drones
  }, [byDrone])

  return { loading, timeRange, getDronesAtTime, positionCount: raw.length }
}
