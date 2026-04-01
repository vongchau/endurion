// src/hooks/useIUUVessels.ts
import { useState, useEffect } from 'react'
import type { AISVessel, IUUMatch } from '../types'

export interface FlaggedVessel {
  vessel: AISVessel
  match: IUUMatch
}

export function useIUUVessels(enabled: boolean) {
  const [vessels, setVessels] = useState<FlaggedVessel[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const poll = () => {
      fetch('/api/maritime/iuu/vessels')
        .then(res => res.ok ? res.json() : [])
        .then(data => { if (!cancelled) setVessels(data) })
        .catch(() => {})
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return { flaggedVessels: enabled ? vessels : [] }
}
