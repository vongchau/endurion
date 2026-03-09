// src/hooks/useAllVessels.ts
import { useState, useEffect } from 'react'
import type { AISVessel } from '../types'

export function useAllVessels() {
  const [vessels, setVessels] = useState<AISVessel[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/vessels/all')
      if (res.ok) setVessels(await res.json())
    } catch (e) {
      console.error('[useAllVessels]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => clearInterval(id)
  }, [])

  return { vessels, loading }
}
