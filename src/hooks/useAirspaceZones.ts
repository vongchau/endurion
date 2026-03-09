// src/hooks/useAirspaceZones.ts
import { useState, useEffect, useMemo } from 'react'
import type { MapBounds } from '../types'

export interface AirspaceZone {
  type: 'Feature'
  properties: {
    name: string
    zoneType: 'prohibited' | 'restricted' | 'controlled'
    upperAlt: number
    lowerAlt: number
    city: string
    state: string
  }
  geometry: GeoJSON.Geometry
}

function quantize(bounds: MapBounds): MapBounds {
  const q = (n: number) => Math.round(n * 10) / 10
  return {
    minLng: q(bounds.minLng),
    minLat: q(bounds.minLat),
    maxLng: q(bounds.maxLng),
    maxLat: q(bounds.maxLat),
  }
}

export function useAirspaceZones(enabled: boolean, bounds: MapBounds | null) {
  const [zones, setZones] = useState<AirspaceZone[]>([])

  const quantized = bounds ? quantize(bounds) : null
  const boundsKey = quantized
    ? `${quantized.minLng},${quantized.minLat},${quantized.maxLng},${quantized.maxLat}`
    : ''
  const stableBounds = useMemo(() => quantized, [boundsKey])

  useEffect(() => {
    if (!enabled || !stableBounds) {
      setZones([])
      return
    }

    let cancelled = false

    const fetchZones = async () => {
      try {
        const params = new URLSearchParams({
          minLng: String(stableBounds.minLng),
          minLat: String(stableBounds.minLat),
          maxLng: String(stableBounds.maxLng),
          maxLat: String(stableBounds.maxLat),
        })
        const res = await fetch(`/api/airspace/zones?${params}`)
        if (res.ok && !cancelled) setZones(await res.json())
      } catch (e) {
        console.error('[useAirspaceZones]', e)
      }
    }

    fetchZones()
    return () => { cancelled = true }
  }, [enabled, stableBounds])

  return { zones: enabled ? zones : [] }
}
