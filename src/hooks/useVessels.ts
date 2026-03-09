// src/hooks/useVessels.ts
import { useState, useEffect } from 'react'
import type { VesselDensityZone, MilitaryCandidate } from '../types'

export function useVessels() {
  const [density,  setDensity]  = useState<VesselDensityZone[]>([])
  const [military, setMilitary] = useState<MilitaryCandidate[]>([])
  const [loading,  setLoading]  = useState(true)

  const fetchData = async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        fetch('/api/vessels/density'),
        fetch('/api/vessels/military'),
      ])
      if (dRes.ok) setDensity(await dRes.json())
      if (mRes.ok) setMilitary(await mRes.json())
    } catch (e) {
      console.error('[useVessels]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => clearInterval(id)
  }, [])

  return { density, military, loading }
}
