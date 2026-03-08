// src/hooks/useCrimeProfile.ts
import { useState, useEffect } from 'react'
import type { CrimeProfileResponse } from '../types'

interface State {
  data: CrimeProfileResponse | null
  loading: boolean
  error: string | null
}

export function useCrimeProfile(ori: string | null) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null })

  useEffect(() => {
    if (!ori) return
    let cancelled = false

    // eslint-disable-next-line -- intentional: single batched setState to reset loading before fetch
    setState({ data: null, loading: true, error: null })

    fetch(`/api/crime/${ori}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<CrimeProfileResponse>
      })
      .then((profile) => { if (!cancelled) setState({ data: profile, loading: false, error: null }) })
      .catch((e: Error) => { if (!cancelled) setState({ data: null, loading: false, error: e.message }) })

    return () => { cancelled = true }
  }, [ori])

  return state
}
