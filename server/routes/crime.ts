// server/routes/crime.ts
import { Hono } from 'hono'
import type { CrimeProfileResponse } from '../../src/types'
import { CITIES } from '../../src/data/cities'
import { fetchCrimeProfile } from '../sources/fbi'

const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CacheEntry {
  data: CrimeProfileResponse
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function isCacheValid(ori: string): boolean {
  const entry = cache.get(ori)
  return !!entry && Date.now() < entry.expiresAt
}

export function getCachedProfile(ori: string): CrimeProfileResponse | undefined {
  return cache.get(ori)?.data
}

export function setCachedProfile(ori: string, data: CrimeProfileResponse): void {
  cache.set(ori, { data, expiresAt: Date.now() + TTL_MS })
}

export const crimeRoute = new Hono()

crimeRoute.get('/:ori', async (c) => {
  const ori = c.req.param('ori').toUpperCase()
  const city = CITIES.find((city) => city.ori === ori)
  if (!city) return c.json({ error: `Unknown ORI: ${ori}` }, 400)

  if (isCacheValid(ori)) {
    return c.json(getCachedProfile(ori))
  }

  const apiKey = process.env.FBI_CDE_API_KEY
  if (!apiKey) return c.json({ error: 'FBI_CDE_API_KEY not configured' }, 503)

  try {
    const profile = await fetchCrimeProfile(ori, city.name, apiKey)
    setCachedProfile(ori, profile)
    return c.json(profile)
  } catch (e) {
    console.error('[crime] fetch failed:', (e as Error).message)
    const stale = getCachedProfile(ori)
    if (stale) return c.json(stale)
    return c.json({ error: 'Upstream fetch failed' }, 503)
  }
})
