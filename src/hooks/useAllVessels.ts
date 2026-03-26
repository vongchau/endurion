// src/hooks/useAllVessels.ts
import { useState, useEffect, useMemo } from 'react'
import type { AISVessel, MapBounds } from '../types'

const MIN_ZOOM = 4

/** Round bounds to 0.5° grid to avoid refetching on tiny pans */
function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 2) / 2
  return {
    minLng: q(bounds.minLng),
    minLat: q(bounds.minLat),
    maxLng: q(bounds.maxLng),
    maxLat: q(bounds.maxLat),
  }
}

export function useAllVessels(zoom: number, bounds: MapBounds | null) {
  const [vessels, setVessels] = useState<AISVessel[]>([])
  const [loading, setLoading] = useState(true)
  const enabled = zoom >= MIN_ZOOM && bounds !== null

  // Quantize bounds so small pans don't cause refetches
  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized
    ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}`
    : ''

  // Memoize by the string key so reference stays stable
  // eslint-disable-next-line react-hooks/exhaustive-deps -- boundsKey captures quantized values
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) {
      setVessels([])
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchData = async () => {
      try {
        const params = new URLSearchParams({
          minLng: String(stableBounds.minLng),
          minLat: String(stableBounds.minLat),
          maxLng: String(stableBounds.maxLng),
          maxLat: String(stableBounds.maxLat),
        })
        const res = await fetch(`/api/vessels/viewport?${params}`)
        if (res.ok && !cancelled) setVessels(await res.json())
      } catch (e) {
        console.error('[useAllVessels]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableBounds])

  return { vessels: enabled ? vessels : [], loading, enabled }
}
