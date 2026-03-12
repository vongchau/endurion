// src/hooks/useCveEnrichment.ts — fetches CVE details from server cache
import { useState, useEffect } from 'react'
import type { CveDetail } from '../types'

export function useCveEnrichment(cveIds: string[]) {
  const [cves, setCves] = useState<Record<string, CveDetail>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (cveIds.length === 0) { setCves({}); return }
    let active = true
    setLoading(true)
    const ids = cveIds.slice(0, 10).join(',')
    fetch(`/api/cyber/cve?ids=${encodeURIComponent(ids)}`)
      .then(res => res.ok ? res.json() : {})
      .then(data => { if (active) setCves(data) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [cveIds.join(',')])

  return { cves, loading }
}
