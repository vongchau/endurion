// src/hooks/useEEZ.ts
import { useState, useEffect } from 'react'

export function useEEZ(enabled: boolean) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)

    fetch('/api/maritime/eez')
      .then(res => res.ok ? res.json() : null)
      .then(fc => { if (!cancelled && fc) setData(fc) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [enabled])

  return { eezData: enabled ? data : null, eezLoading: loading }
}
