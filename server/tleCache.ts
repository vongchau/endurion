// server/tleCache.ts
// Caches TLE data server-side. Primary: tle.ivanstanojevic.me API
// Fallback: CelesTrak (currently down). TLE data updates 2-3x/day → 2h TTL.

// Primary source (JSON API, paginated — max 20/page)
const TLE_API_BASE = 'https://tle.ivanstanojevic.me/api/tle/'
const STARLINK_PAGES = 25  // 25 pages × 20 = 500 satellites (plenty for viz)

// Fallback source (bulk TLE text, single request — currently unreachable)
const CELESTRAK_ISS      = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
const CELESTRAK_STARLINK = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE'

const TTL_MS = 2 * 60 * 60 * 1000  // 2 hours

interface TLECache {
  iss: string
  starlink: string
  fetchedAt: number
}

interface TleApiEntry {
  name: string
  line1: string
  line2: string
}

let cache: TLECache | null = null
let fetching = false

/** Convert JSON API entries to standard 3-line TLE text format */
function toTleText(entries: TleApiEntry[]): string {
  return entries.map(e => `${e.name}\n${e.line1}\n${e.line2}`).join('\n')
}

/** Fetch ISS TLE from the JSON API (single entry) */
async function fetchIssFromApi(): Promise<string> {
  const res = await fetch(`${TLE_API_BASE}25544`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`TLE API ISS fetch: ${res.status}`)
  const data = await res.json() as TleApiEntry
  return `${data.name}\n${data.line1}\n${data.line2}`
}

/** Fetch Starlink TLEs from the JSON API (paginated) */
async function fetchStarlinkFromApi(): Promise<string> {
  const pages = Array.from({ length: STARLINK_PAGES }, (_, i) => i + 1)
  const results = await Promise.all(
    pages.map(async (page) => {
      const res = await fetch(
        `${TLE_API_BASE}?search=starlink&page_size=20&page=${page}`,
        { signal: AbortSignal.timeout(15_000), redirect: 'follow' },
      )
      if (!res.ok) return []
      const data = await res.json() as { member?: TleApiEntry[] }
      return (data.member ?? []).map(m => ({ name: m.name, line1: m.line1, line2: m.line2 }))
    }),
  )
  const entries = results.flat()
  // Filter out stale TLEs (epoch older than 30 days) — they produce bad propagation
  const now = Date.now()
  const fresh = entries.filter(e => {
    const epochYear = parseInt(e.line1.substring(18, 20), 10)
    const epochDay = parseFloat(e.line1.substring(20, 32))
    const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear
    const epoch = new Date(year, 0, 1).getTime() + (epochDay - 1) * 86400_000
    return now - epoch < 30 * 86400_000
  })
  console.log(`[tleCache] starlink: ${entries.length} total, ${fresh.length} fresh (< 30 days)`)
  return toTleText(fresh)
}

/** Try Celestrak first (bulk, fast), fall back to paginated API */
async function fetchTLEs(): Promise<TLECache> {
  // Try Celestrak (single request for all Starlinks)
  try {
    const [issRes, starlinkRes] = await Promise.all([
      fetch(CELESTRAK_ISS, { signal: AbortSignal.timeout(8_000) }),
      fetch(CELESTRAK_STARLINK, { signal: AbortSignal.timeout(8_000) }),
    ])
    if (issRes.ok && starlinkRes.ok) {
      const [iss, starlink] = await Promise.all([issRes.text(), starlinkRes.text()])
      console.log('[tleCache] fetched from Celestrak')
      return { iss, starlink, fetchedAt: Date.now() }
    }
  } catch {
    console.log('[tleCache] Celestrak unreachable, trying alternative API…')
  }

  // Fallback: tle.ivanstanojevic.me
  const [iss, starlink] = await Promise.all([
    fetchIssFromApi(),
    fetchStarlinkFromApi(),
  ])
  console.log(`[tleCache] fetched from TLE API (ISS: ${iss.length}B, Starlink: ${starlink.length}B)`)
  return { iss, starlink, fetchedAt: Date.now() }
}

export async function getTLEs(): Promise<{ iss: string; starlink: string } | null> {
  const now = Date.now()

  if (cache && now - cache.fetchedAt < TTL_MS) {
    return { iss: cache.iss, starlink: cache.starlink }
  }

  // Prevent concurrent fetches
  if (fetching) {
    return cache ? { iss: cache.iss, starlink: cache.starlink } : null
  }

  fetching = true
  try {
    cache = await fetchTLEs()
    return { iss: cache.iss, starlink: cache.starlink }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[tleCache] fetch failed: ${msg}`)
    return cache ? { iss: cache.iss, starlink: cache.starlink } : null
  } finally {
    fetching = false
  }
}
