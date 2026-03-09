// src/hooks/useVesselIntel.ts
import { useState, useEffect } from 'react'

export interface VesselIntel {
  found: boolean
  military: { isMilitary: boolean; reason: string }
  inChokepoints: string[]
  nearestChokepoint: { name: string; distanceDeg: number } | null
  aisGaps: { totalReports: number; maxGapMs: number; isDarkShip: boolean }
}

export function useVesselIntel(mmsi: number | null) {
  const [intel, setIntel] = useState<VesselIntel | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!mmsi) { setIntel(null); return }

    let cancelled = false
    setLoading(true)

    fetch(`/api/vessels/${mmsi}/intel`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled && data) setIntel(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [mmsi])

  return { intel, loading }
}
