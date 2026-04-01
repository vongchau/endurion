// src/hooks/useIUUAlerts.ts
import { useState, useEffect } from 'react'
import type { IUUAlert } from '../types'

export function useIUUAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<IUUAlert[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const poll = () => {
      fetch('/api/maritime/iuu/alerts')
        .then(res => res.ok ? res.json() : [])
        .then(data => { if (!cancelled) setAlerts(data) })
        .catch(() => {})
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return { alerts: enabled ? alerts : [] }
}
