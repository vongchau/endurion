// src/hooks/usePowerOutages.ts
import { useState, useEffect, useMemo } from 'react'
import type { PowerOutage } from '../types'

export function usePowerOutages(enabled: boolean, center: { lat: number; lng: number } | null) {
  const [data, setData] = useState<PowerOutage[]>([])
  const [loading, setLoading] = useState(false)

  const centerKey = center ? `${center.lat.toFixed(1)},${center.lng.toFixed(1)}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- centerKey captures center values
  const stableCenter = useMemo(() => center, [centerKey])

  useEffect(() => {
    if (!enabled || !stableCenter) { setData([]); return }
    let cancelled = false
    const params = new URLSearchParams({
      lat: String(stableCenter.lat), lng: String(stableCenter.lng),
    })
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/city/power?${params}`)
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) { console.error('[usePowerOutages]', e) }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const id = setInterval(fetchData, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled, stableCenter])

  return { data: enabled ? data : [], loading }
}
