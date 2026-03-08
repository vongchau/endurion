// src/hooks/useFlights.ts
import { useState, useEffect } from 'react'
import type { MilitaryFlight } from '../types'

export function useFlights() {
  const [data, setData] = useState<MilitaryFlight[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/flights')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e) {
      console.error('[useFlights]', e)
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
