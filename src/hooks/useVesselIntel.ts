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
    if (!mmsi) return

    let cancelled = false
    const fetchIntel = async () => {
      try {
        const res = await fetch(`/api/vessels/${mmsi}/intel`)
        if (res.ok && !cancelled) setIntel(await res.json())
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false) }
    }

    setLoading(true)
    fetchIntel()
    return () => { cancelled = true }
  }, [mmsi])

  return { intel, loading }
}
