// src/hooks/useDrones.ts
import { useState, useEffect, useMemo } from 'react'
import type { DroneFlight, MapBounds } from '../types'

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 200) / 200  // 0.005° grid (~500m)
  return {
    minLng: q(bounds.minLng),
    minLat: q(bounds.minLat),
    maxLng: q(bounds.maxLng),
    maxLat: q(bounds.maxLat),
  }
}

export function useDrones(enabled: boolean, bounds: MapBounds | null) {
  const [drones, setDrones] = useState<DroneFlight[]>([])
  const [loading, setLoading] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized
    ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}`
    : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) {
      setDrones([])
      return
    }

    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        const params = new URLSearchParams({
          minLng: String(stableBounds.minLng),
          minLat: String(stableBounds.minLat),
          maxLng: String(stableBounds.maxLng),
          maxLat: String(stableBounds.maxLat),
        })
        const res = await fetch(`/api/drones/viewport?${params}`)
        if (res.ok && !cancelled) setDrones(await res.json())
      } catch (e) {
        console.error('[useDrones]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { drones: enabled ? drones : [], loading }
}
