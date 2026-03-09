// src/hooks/useDisruptions.ts
import { useState, useEffect } from 'react'
import type { AISDisruption } from '../types'

export function useDisruptions() {
  const [disruptions, setDisruptions] = useState<AISDisruption[]>([])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/vessels/disruptions')
      if (res.ok) setDisruptions(await res.json())
    } catch (e) {
      console.error('[useDisruptions]', e)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [])

  return { disruptions }
}
