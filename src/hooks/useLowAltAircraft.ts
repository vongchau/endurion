// src/hooks/useLowAltAircraft.ts
import { useState, useEffect, useMemo } from 'react'
import type { LowAltAircraft, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 100) / 100
  return { minLng: q(bounds.minLng), minLat: q(bounds.minLat), maxLng: q(bounds.maxLng), maxLat: q(bounds.maxLat) }
}

export function useLowAltAircraft(enabled: boolean, bounds: MapBounds | null) {
  const [data, setData] = useState<LowAltAircraft[]>([])
  const [loading, setLoading] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- boundsKey captures quantized values
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
        const res = await fetch(`/api/city/aircraft?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[useLowAltAircraft]', e) }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const id = setInterval(fetchData, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { data: enabled ? data : [], loading }
}
