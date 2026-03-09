// server/tleCache.ts
// Caches CelesTrak TLE data server-side to avoid IP rate limiting.
// TLE data only updates 2-3x/day, so a 2-hour TTL is safe.

const ISS_URL      = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
const STARLINK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE'
const TTL_MS       = 2 * 60 * 60 * 1000  // 2 hours

interface TLECache {
  iss: string
  starlink: string
  fetchedAt: number
}

let cache: TLECache | null = null
let fetching = false

async function fetchTLEs(): Promise<TLECache> {
  const [issRes, starlinkRes] = await Promise.all([
    fetch(ISS_URL),
    fetch(STARLINK_URL),
  ])

  if (!issRes.ok) throw new Error(`ISS TLE fetch failed: ${issRes.status}`)
  if (!starlinkRes.ok) throw new Error(`Starlink TLE fetch failed: ${starlinkRes.status}`)

  const [iss, starlink] = await Promise.all([
    issRes.text(),
    starlinkRes.text(),
  ])

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
    console.log(`[tleCache] fetched TLEs (ISS: ${cache.iss.length}B, Starlink: ${cache.starlink.length}B)`)
    return { iss: cache.iss, starlink: cache.starlink }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[tleCache] fetch failed: ${msg}`)
    // Return stale cache if available
    return cache ? { iss: cache.iss, starlink: cache.starlink } : null
  } finally {
    fetching = false
  }
}
