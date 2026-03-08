// src/hooks/useGlobalData.ts
import { useState, useEffect } from 'react'
import type { GlobalIncident } from '../types'

export function useGlobalData() {
  const [data, setData] = useState<GlobalIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/incidents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e) {
      console.error('[useGlobalData]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [])

  return { data, loading, lastUpdated }
}
