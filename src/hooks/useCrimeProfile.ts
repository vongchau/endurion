// src/hooks/useCrimeProfile.ts
import { useState, useEffect } from 'react'
import type { CrimeProfileResponse } from '../types'

export function useCrimeProfile(ori: string | null) {
  const [data, setData] = useState<CrimeProfileResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ori) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/crime/${ori}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<CrimeProfileResponse>
      })
      .then((profile) => { if (!cancelled) { setData(profile); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false) } })

    return () => { cancelled = true }
  }, [ori])

  return { data, loading, error }
}
