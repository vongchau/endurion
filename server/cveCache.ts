// server/cveCache.ts — NVD CVE lookup with in-memory cache
import { sleep } from './utils'

export interface CveDetail {
  id: string              // CVE-2024-1234
  description: string
  cvssScore: number | null
  cvssVector: string | null
  cvssSeverity: string | null  // CRITICAL, HIGH, MEDIUM, LOW
  publishedDate: string
  lastModified: string
  references: string[]
  affectedProducts: string[]
  exploitAvailable: boolean
}

const cveCache = new Map<string, CveDetail | null>()
const MAX_CVE_CACHE = 2000
const NVD_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0'

async function fetchCve(cveId: string): Promise<CveDetail | null> {
  try {
    const res = await fetch(`${NVD_BASE}?cveId=${encodeURIComponent(cveId)}`)
    if (!res.ok) return null
    const data = await res.json()
    const vuln = data.vulnerabilities?.[0]?.cve
    if (!vuln) return null

    const metrics = vuln.metrics
    const cvss31 = metrics?.cvssMetricV31?.[0]?.cvssData
    const cvss30 = metrics?.cvssMetricV30?.[0]?.cvssData
    const cvss2 = metrics?.cvssMetricV2?.[0]?.cvssData

    const cvssData = cvss31 || cvss30 || cvss2
    const cvssScore = cvssData?.baseScore ?? null
    const cvssVector = cvssData?.vectorString ?? null
    const cvssSeverity = cvssData?.baseSeverity ?? null

    const configs = vuln.configurations ?? []
    const products: string[] = []
    for (const config of configs) {
      for (const node of config.nodes ?? []) {
        for (const match of node.cpeMatch ?? []) {
          if (match.criteria) {
            const parts = match.criteria.split(':')
            if (parts.length >= 5) {
              products.push(`${parts[3]}/${parts[4]}`)
            }
          }
        }
      }
    }

    const refs = (vuln.references ?? []).map((r: { url: string }) => r.url)
    const exploitAvailable = refs.some((r: string) =>
      r.includes('exploit-db') || r.includes('packetstorm') ||
      r.includes('github.com') && r.includes('exploit')
    )

    return {
      id: cveId,
      description: vuln.descriptions?.find((d: { lang: string }) => d.lang === 'en')?.value ?? '',
      cvssScore,
      cvssVector,
      cvssSeverity,
      publishedDate: vuln.published ?? '',
      lastModified: vuln.lastModified ?? '',
      references: refs.slice(0, 5),
      affectedProducts: [...new Set(products)].slice(0, 10),
      exploitAvailable,
    }
  } catch (err) {
    console.error(`[CVE] Failed to fetch ${cveId}:`, err)
    return null
  }
}

export async function getCveDetails(cveIds: string[]): Promise<Record<string, CveDetail>> {
  const results: Record<string, CveDetail> = {}
  const toFetch: string[] = []

  for (const id of cveIds) {
    const cached = cveCache.get(id)
    if (cached !== undefined) {
      if (cached) results[id] = cached
    } else {
      toFetch.push(id)
    }
  }

  for (const id of toFetch.slice(0, 5)) {
    if (cveCache.size > MAX_CVE_CACHE) {
      const iter = cveCache.keys()
      for (let i = 0; i < 200; i++) {
        const { value, done } = iter.next()
        if (done) break
        cveCache.delete(value)
      }
    }

    const detail = await fetchCve(id)
    cveCache.set(id, detail)
    if (detail) results[id] = detail
    await sleep(6500)
  }

  return results
}

export function getCachedCve(cveId: string): CveDetail | null {
  return cveCache.get(cveId) ?? null
}

export async function prewarmCveCache(cveIds: string[]): Promise<void> {
  const unknown = cveIds.filter(id => !cveCache.has(id)).slice(0, 30)
  for (const id of unknown) {
    if (cveCache.size > MAX_CVE_CACHE) break
    const detail = await fetchCve(id)
    cveCache.set(id, detail)
    await sleep(6500)
  }
  console.log(`[CVE] Prewarmed ${unknown.length} CVEs, cache size: ${cveCache.size}`)
}
