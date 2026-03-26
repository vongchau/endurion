// src/hooks/useCveEnrichment.ts — fetches CVE details from server cache
import { useState, useEffect, useMemo } from 'react'
import type { CveDetail } from '../types'

export function useCveEnrichment(cveIds: string[]) {
  const [cves, setCves] = useState<Record<string, CveDetail>>({})
  const [loading, setLoading] = useState(false)

  const idsKey = useMemo(() => cveIds.join(','), [cveIds])

  useEffect(() => {
    if (!idsKey) return
    let active = true
    const doFetch = async () => {
      const ids = idsKey.split(',').slice(0, 10).join(',')
      try {
        const res = await fetch(`/api/cyber/cve?ids=${encodeURIComponent(ids)}`)
        if (res.ok && active) setCves(await res.json())
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    setLoading(true)
    doFetch()
    return () => { active = false }
  }, [idsKey])

  return { cves, loading }
}
