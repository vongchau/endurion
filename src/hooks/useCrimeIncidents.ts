// src/hooks/useCrimeIncidents.ts
import { useState, useEffect, useMemo } from 'react'
import type { CrimeIncident, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 10) / 10
  return { minLng: q(bounds.minLng), minLat: q(bounds.minLat), maxLng: q(bounds.maxLng), maxLat: q(bounds.maxLat) }
}

export function useCrimeIncidents(enabled: boolean, bounds: MapBounds | null) {
  const [data, setData] = useState<CrimeIncident[]>([])
  const [loading, setLoading] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}` : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) { setData([]); return }
    let cancelled = false
    const params = new URLSearchParams({
      minLng: String(stableBounds.minLng), minLat: String(stableBounds.minLat),
      maxLng: String(stableBounds.maxLng), maxLat: String(stableBounds.maxLat),
    })
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/crime?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[useCrimeIncidents]', e) }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const id = setInterval(fetchData, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { data: enabled ? data : [], loading }
}
