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
  const [useFallback, setUseFallback] = useState(false)

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized
    ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}`
    : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- boundsKey captures quantized values
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) {
      setDrones([])
      return
    }

    const params = new URLSearchParams({
      minLng: String(stableBounds.minLng),
      minLat: String(stableBounds.minLat),
      maxLng: String(stableBounds.maxLng),
      maxLat: String(stableBounds.maxLat),
    })

    // Try SSE first
    if (!useFallback) {
      setLoading(true)
      const es = new EventSource(`/api/drones/stream?${params}`)

      es.onmessage = (event) => {
        try {
          setDrones(JSON.parse(event.data))
          setLoading(false)
        } catch { /* ignore parse errors */ }
      }

      es.onerror = () => {
        es.close()
        console.warn('[useDrones] SSE failed, falling back to polling')
        setUseFallback(true)
        setDrones([])
        setLoading(false)
      }

      return () => es.close()
    }

    // Fallback: REST polling
    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
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
  }, [enabled, stableBounds, useFallback])

  return { drones: enabled ? drones : [], loading }
}
