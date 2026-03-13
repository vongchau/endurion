// src/hooks/useChokepoints.ts
import { useState, useEffect } from 'react'
import type { Chokepoint } from '../types'

export function useChokepoints(enabled: boolean) {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([])

  useEffect(() => {
    if (!enabled) return
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/vessels/chokepoints')
        if (res.ok) setChokepoints(await res.json())
      } catch { /* ignore fetch errors — data stays stale */ }
    }
    fetch_()
    const id = setInterval(fetch_, 30_000)
    return () => clearInterval(id)
  }, [enabled])

  return chokepoints
}
