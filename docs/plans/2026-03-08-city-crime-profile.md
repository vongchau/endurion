# City Crime Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the FBI Crime Data Explorer API into the City View — multi-city selection via map pins + search, with a dedicated `CrimeProfilePanel` showing 10-year trend, top offenses, weapons, demographics, and time-of-day charts.

**Architecture:** The existing Hono server gains a `GET /api/crime/:ori` route that fetches 5 FBI CDE endpoints in parallel, normalizes the responses into a single `CrimeProfileResponse`, and caches it for 24 hours. The React frontend adds city selection state to Zustand, renders `CityPins` + `CitySearch` on a zoomed-out US map, and mounts a new `CrimeProfilePanel` (Recharts charts, Framer Motion slide-in) when a city is selected.

**Tech Stack:** React 18, TypeScript, Zustand, Framer Motion, Recharts, Hono, Vitest. FBI CDE API base: `https://api.usa.gov/crime/fbi/cde` — free key from api.data.gov. Existing Vite proxy (`/api → localhost:3001`) covers all new routes.

**Design doc:** `docs/plans/2026-03-08-city-crime-profile-design.md`

---

### Task 1: Add types — `CityProfile` and `CrimeProfileResponse`

**Files:**
- Modify: `src/types/index.ts`

**Context:** `src/types/index.ts` already has `GlobalIncident`, `MilitaryFlight`, `CityPOI`, `Entity`, and `PanelState`. Add two new interfaces at the bottom.

**Step 1: Add the types**

Append to `src/types/index.ts`:

```ts
export interface CityProfile {
  id: string
  name: string
  state: string
  ori: string       // FBI Originating Agency Identifier, e.g. 'NY0303000'
  lat: number
  lng: number
  zoom: number
}

export interface CrimeProfileResponse {
  city: string
  ori: string
  fetchedAt: string
  trend: Array<{ year: number; count: number }>
  offenses: Array<{ offense: string; count: number }>
  weapons: Array<{ weapon: string; count: number }>
  offenderDemo: {
    age: Record<string, number>
    race: Record<string, number>
    sex: Record<string, number>
  }
  victimDemo: {
    age: Record<string, number>
    race: Record<string, number>
    sex: Record<string, number>
  }
  timeOfDay: Array<{ hour: number; count: number }>
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add CityProfile and CrimeProfileResponse types"
```

---

### Task 2: Create city data — `src/data/cities.ts`

**Files:**
- Create: `src/data/cities.ts`

**Context:** Preset list of 12 US cities with their FBI ORI codes. ORI codes are the agency identifiers used by the FBI CDE API. These are the primary law enforcement agencies for each city. Verify against `https://api.usa.gov/crime/fbi/cde/agencies/{ori}?api_key=demo` if needed — the API returns 404 for invalid ORIs.

**Step 1: Create the file**

```ts
// src/data/cities.ts
import type { CityProfile } from '../types'

export const CITIES: CityProfile[] = [
  { id: 'nyc', name: 'New York City',  state: 'NY', ori: 'NY0303000', lat: 40.7128,  lng: -74.0060,  zoom: 11 },
  { id: 'la',  name: 'Los Angeles',    state: 'CA', ori: 'CA0190200', lat: 34.0522,  lng: -118.2437, zoom: 10 },
  { id: 'chi', name: 'Chicago',        state: 'IL', ori: 'IL0160000', lat: 41.8781,  lng: -87.6298,  zoom: 11 },
  { id: 'hou', name: 'Houston',        state: 'TX', ori: 'TX2010000', lat: 29.7604,  lng: -95.3698,  zoom: 10 },
  { id: 'phx', name: 'Phoenix',        state: 'AZ', ori: 'AZ0020100', lat: 33.4484,  lng: -112.0740, zoom: 10 },
  { id: 'phi', name: 'Philadelphia',   state: 'PA', ori: 'PA5160100', lat: 39.9526,  lng: -75.1652,  zoom: 11 },
  { id: 'sa',  name: 'San Antonio',    state: 'TX', ori: 'TX2010300', lat: 29.4241,  lng: -98.4936,  zoom: 10 },
  { id: 'dal', name: 'Dallas',         state: 'TX', ori: 'TX0570000', lat: 32.7767,  lng: -96.7970,  zoom: 11 },
  { id: 'det', name: 'Detroit',        state: 'MI', ori: 'MI1820000', lat: 42.3314,  lng: -83.0458,  zoom: 11 },
  { id: 'atl', name: 'Atlanta',        state: 'GA', ori: 'GA0440200', lat: 33.7490,  lng: -84.3880,  zoom: 11 },
  { id: 'sd',  name: 'San Diego',      state: 'CA', ori: 'CA0370200', lat: 32.7157,  lng: -117.1611, zoom: 10 },
  { id: 'mia', name: 'Miami',          state: 'FL', ori: 'FL0130100', lat: 25.7617,  lng: -80.1918,  zoom: 11 },
]
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/data/cities.ts
git commit -m "feat: add preset CITIES list with FBI ORI codes"
```

---

### Task 3: Update Zustand store — add `selectedCity`

**Files:**
- Modify: `src/store/index.ts`

**Context:** `src/store/index.ts` currently has `activeView`, `panels`, `selectedEntity`, and `globalLayers`. Add `selectedCity` and `setSelectedCity` following the exact same pattern as `selectedEntity`.

**Step 1: Write the failing test**

Create `src/store/store.test.ts` already exists — add to it:

```ts
// In src/store/store.test.ts, add inside the existing describe block:
it('selectedCity starts null', () => {
  const { selectedCity } = useHUDStore.getState()
  expect(selectedCity).toBeNull()
})

it('setSelectedCity updates selectedCity', () => {
  const city: CityProfile = {
    id: 'nyc', name: 'New York City', state: 'NY', ori: 'NY0303000',
    lat: 40.7128, lng: -74.006, zoom: 11,
  }
  useHUDStore.getState().setSelectedCity(city)
  expect(useHUDStore.getState().selectedCity).toEqual(city)
})

it('setSelectedCity(null) clears city', () => {
  useHUDStore.getState().setSelectedCity(null)
  expect(useHUDStore.getState().selectedCity).toBeNull()
})
```

Also add `import type { CityProfile } from '../types'` to the test imports.

**Step 2: Run to verify it fails**

Run: `npx vitest run src/store/store.test.ts 2>&1 | tail -15`
Expected: FAIL — `selectedCity` not found / `setSelectedCity` not a function

**Step 3: Add to store**

In `src/store/index.ts`, add to the `HUDStore` interface:
```ts
selectedCity: CityProfile | null
setSelectedCity: (city: CityProfile | null) => void
```

Add `import type { ..., CityProfile } from '../types'` to the import.

Add to the `create` call:
```ts
selectedCity: null,
setSelectedCity: (city) => set({ selectedCity: city }),
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/store/store.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/store/index.ts src/store/store.test.ts
git commit -m "feat: add selectedCity state to HUD store"
```

---

### Task 4: Server — FBI CDE API fetcher

**Files:**
- Create: `server/sources/fbi.ts`
- Create: `server/sources/fbi.test.ts`

**Context:** The FBI CDE API base URL is `https://api.usa.gov/crime/fbi/cde`. All requests require `?api_key=YOUR_KEY`. The server fetches 5 endpoints per ORI and normalizes them into `CrimeProfileResponse`. Some agencies don't participate in NIBRS — those endpoints return empty `data: []` arrays, which normalize to empty arrays gracefully.

**⚠️ Important — FBI CDE endpoint paths to verify:** The paths below are correct based on the CDE API specification. If an endpoint returns 404, check the interactive docs at `https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/docApi` — the Swagger UI lists all paths. The most likely to vary is the annual trend path.

**Step 1: Write failing tests**

```ts
// server/sources/fbi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeTrend,
  normalizeWeapons,
  normalizeOffenses,
  normalizeOffenderDemo,
  normalizeVictimDemo,
  normalizeTimeOfDay,
} from './fbi'

describe('normalizeTrend', () => {
  it('extracts year + count from summarized annual data', () => {
    const raw = { data: [{ data_year: 2020, offense_count: 1000 }, { data_year: 2021, offense_count: 1200 }] }
    const result = normalizeTrend(raw)
    expect(result).toEqual([
      { year: 2020, count: 1000 },
      { year: 2021, count: 1200 },
    ])
  })

  it('returns empty array when data is missing', () => {
    expect(normalizeTrend({})).toEqual([])
    expect(normalizeTrend({ data: null })).toEqual([])
  })
})

describe('normalizeWeapons', () => {
  it('aggregates weapon counts across years', () => {
    const raw = {
      data: [
        { weapon_name: 'Handgun', count: 100 },
        { weapon_name: 'Handgun', count: 200 },
        { weapon_name: 'Rifle', count: 50 },
      ],
    }
    const result = normalizeWeapons(raw)
    const handgun = result.find((w) => w.weapon === 'Handgun')
    expect(handgun?.count).toBe(300)
    expect(result.find((w) => w.weapon === 'Rifle')?.count).toBe(50)
  })

  it('returns empty array for missing data', () => {
    expect(normalizeWeapons({})).toEqual([])
  })
})

describe('normalizeOffenses', () => {
  it('aggregates offense counts and sorts descending', () => {
    const raw = {
      data: [
        { offense_name: 'Robbery', count: 500 },
        { offense_name: 'Assault', count: 300 },
        { offense_name: 'Robbery', count: 200 },
      ],
    }
    const result = normalizeOffenses(raw)
    expect(result[0]).toEqual({ offense: 'Robbery', count: 700 })
    expect(result[1]).toEqual({ offense: 'Assault', count: 300 })
  })
})

describe('normalizeTimeOfDay', () => {
  it('returns 24 hourly buckets', () => {
    const raw = {
      data: [
        { time_of_day: '0', count: 42 },
        { time_of_day: '14', count: 100 },
      ],
    }
    const result = normalizeTimeOfDay(raw)
    expect(result).toHaveLength(24)
    expect(result[0]).toEqual({ hour: 0, count: 42 })
    expect(result[14]).toEqual({ hour: 14, count: 100 })
    expect(result[5]).toEqual({ hour: 5, count: 0 })
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run server/sources/fbi.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Implement `server/sources/fbi.ts`**

```ts
// server/sources/fbi.ts
import type { CrimeProfileResponse } from '../src/types'

const BASE = 'https://api.usa.gov/crime/fbi/cde'

async function get(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}?api_key=${apiKey}`)
  if (!res.ok) return {}
  return res.json()
}

export function normalizeTrend(raw: unknown): CrimeProfileResponse['trend'] {
  const data = (raw as { data?: Array<{ data_year: number; offense_count: number }> })?.data
  if (!Array.isArray(data)) return []
  return data.map((d) => ({ year: d.data_year, count: d.offense_count ?? 0 }))
}

export function normalizeWeapons(raw: unknown): CrimeProfileResponse['weapons'] {
  const data = (raw as { data?: Array<{ weapon_name: string; count: number }> })?.data
  if (!Array.isArray(data)) return []
  const map = new Map<string, number>()
  for (const d of data) map.set(d.weapon_name, (map.get(d.weapon_name) ?? 0) + (d.count ?? 0))
  return Array.from(map.entries()).map(([weapon, count]) => ({ weapon, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

export function normalizeOffenses(raw: unknown): CrimeProfileResponse['offenses'] {
  const data = (raw as { data?: Array<{ offense_name: string; count: number }> })?.data
  if (!Array.isArray(data)) return []
  const map = new Map<string, number>()
  for (const d of data) map.set(d.offense_name, (map.get(d.offense_name) ?? 0) + (d.count ?? 0))
  return Array.from(map.entries()).map(([offense, count]) => ({ offense, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}

function aggregateDemoField(
  data: Array<Record<string, unknown>>,
  key: string,
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const d of data) {
    const label = String(d[key] ?? 'Unknown')
    map[label] = (map[label] ?? 0) + (Number(d.count) || 0)
  }
  return map
}

export function normalizeOffenderDemo(raw: unknown): CrimeProfileResponse['offenderDemo'] {
  const data = (raw as { data?: Array<Record<string, unknown>> })?.data
  if (!Array.isArray(data)) return { age: {}, race: {}, sex: {} }
  return {
    age:  aggregateDemoField(data, 'age_range_code'),
    race: aggregateDemoField(data, 'race_desc'),
    sex:  aggregateDemoField(data, 'sex_code'),
  }
}

export function normalizeVictimDemo(raw: unknown): CrimeProfileResponse['victimDemo'] {
  const data = (raw as { data?: Array<Record<string, unknown>> })?.data
  if (!Array.isArray(data)) return { age: {}, race: {}, sex: {} }
  return {
    age:  aggregateDemoField(data, 'age_range_code'),
    race: aggregateDemoField(data, 'race_desc'),
    sex:  aggregateDemoField(data, 'sex_code'),
  }
}

export function normalizeTimeOfDay(raw: unknown): CrimeProfileResponse['timeOfDay'] {
  const data = (raw as { data?: Array<{ time_of_day: string; count: number }> })?.data
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  if (!Array.isArray(data)) return buckets
  for (const d of data) {
    const hour = parseInt(d.time_of_day, 10)
    if (hour >= 0 && hour < 24) buckets[hour].count += d.count ?? 0
  }
  return buckets
}

export async function fetchCrimeProfile(
  ori: string,
  cityName: string,
  apiKey: string,
): Promise<CrimeProfileResponse> {
  const [trendRaw, weaponsRaw, offenderRaw, victimRaw, offensesRaw] = await Promise.allSettled([
    get(`/summarized/agency/${ori}/all-offenses/count/annual`, apiKey),
    get(`/nibrs/violent-crime/weapons/agencies/${ori}/count`,  apiKey),
    get(`/nibrs/violent-crime/offender/agencies/${ori}/count`, apiKey),
    get(`/nibrs/violent-crime/victim/agencies/${ori}/count`,   apiKey),
    get(`/nibrs/violent-crime/offense/agencies/${ori}/count`,  apiKey),
  ])

  const settled = <T>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : {}

  return {
    city: cityName,
    ori,
    fetchedAt: new Date().toISOString(),
    trend:        normalizeTrend(settled(trendRaw)),
    weapons:      normalizeWeapons(settled(weaponsRaw)),
    offenderDemo: normalizeOffenderDemo(settled(offenderRaw)),
    victimDemo:   normalizeVictimDemo(settled(victimRaw)),
    offenses:     normalizeOffenses(settled(offensesRaw)),
    timeOfDay:    normalizeTimeOfDay(settled(victimRaw)), // time-of-day comes from victim segment
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/sources/fbi.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add server/sources/fbi.ts server/sources/fbi.test.ts
git commit -m "feat: add FBI CDE API fetcher and normalizers"
```

---

### Task 5: Server — crime route with 24h cache

**Files:**
- Create: `server/routes/crime.ts`
- Create: `server/routes/crime.test.ts`

**Context:** A Hono sub-app that handles `GET /:ori`. On cache miss it calls `fetchCrimeProfile`, stores with 24h TTL, returns JSON. On cache hit it returns immediately. The CITIES list provides the city name for each ORI. If ORI is not in the CITIES list, return 400.

**Step 1: Write failing tests**

```ts
// server/routes/crime.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCachedProfile, setCachedProfile, isCacheValid } from './crime'

describe('crime cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('isCacheValid returns false when no entry exists', () => {
    expect(isCacheValid('NY0303000')).toBe(false)
  })

  it('isCacheValid returns true within 24h of set', () => {
    const fakeProfile = { city: 'NYC', ori: 'NY0303000', fetchedAt: new Date().toISOString(),
      trend: [], offenses: [], weapons: [], offenderDemo: { age: {}, race: {}, sex: {} },
      victimDemo: { age: {}, race: {}, sex: {} }, timeOfDay: [] }
    setCachedProfile('NY0303000', fakeProfile)
    expect(isCacheValid('NY0303000')).toBe(true)
  })

  it('isCacheValid returns false after 24h', () => {
    const fakeProfile = { city: 'NYC', ori: 'NY0303000', fetchedAt: new Date().toISOString(),
      trend: [], offenses: [], weapons: [], offenderDemo: { age: {}, race: {}, sex: {} },
      victimDemo: { age: {}, race: {}, sex: {} }, timeOfDay: [] }
    setCachedProfile('NY0303000', fakeProfile)
    vi.advanceTimersByTime(25 * 60 * 60 * 1000) // 25 hours
    expect(isCacheValid('NY0303000')).toBe(false)
  })

  it('getCachedProfile returns stored profile', () => {
    const fakeProfile = { city: 'NYC', ori: 'NY0303000', fetchedAt: new Date().toISOString(),
      trend: [], offenses: [], weapons: [], offenderDemo: { age: {}, race: {}, sex: {} },
      victimDemo: { age: {}, race: {}, sex: {} }, timeOfDay: [] }
    setCachedProfile('NY0303000', fakeProfile)
    expect(getCachedProfile('NY0303000')).toEqual(fakeProfile)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run server/routes/crime.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Implement `server/routes/crime.ts`**

```ts
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/crime.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add server/routes/crime.ts server/routes/crime.test.ts
git commit -m "feat: add crime route with 24h ORI cache"
```

---

### Task 6: Register crime route + add env var

**Files:**
- Modify: `server/index.ts`
- Modify: `.env.example`

**Context:** The existing `server/index.ts` registers `/api/incidents` and `/api/flights`. Add the crime route the same way. The existing Vite proxy (`/api → localhost:3001`) already covers `/api/crime/:ori` — no Vite config change needed.

**Step 1: Register the route in `server/index.ts`**

Add after the existing imports:
```ts
import { crimeRoute } from './routes/crime'
```

Add after the existing routes (before `serve(...)`):
```ts
app.route('/api/crime', crimeRoute)
```

**Step 2: Add to `.env.example`**

Append to `.env.example`:
```
FBI_CDE_API_KEY=    # from https://api.data.gov/signup/ — free, server-side only
```

**Step 3: Verify all existing tests still pass**

Run: `npx vitest run 2>&1 | tail -15`
Expected: all tests PASS

**Step 4: Commit**

```bash
git add server/index.ts .env.example
git commit -m "feat: register crime route and document FBI_CDE_API_KEY"
```

---

### Task 7: Frontend hook — `useCrimeProfile`

**Files:**
- Create: `src/hooks/useCrimeProfile.ts`
- Create: `src/hooks/useCrimeProfile.test.ts`

**Context:** Follows the same pattern as `useGlobalData.ts` (already in the project). Fetches `/api/crime/:ori` when `ori` changes, returns `{ data, loading, error }`. Does NOT poll — crime data is historical and changes only when the user selects a different city.

**Step 1: Write the failing test**

```ts
// src/hooks/useCrimeProfile.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCrimeProfile } from './useCrimeProfile'

const mockProfile = {
  city: 'New York City', ori: 'NY0303000', fetchedAt: '2024-01-01T00:00:00Z',
  trend: [{ year: 2020, count: 1000 }], offenses: [], weapons: [],
  offenderDemo: { age: {}, race: {}, sex: {} }, victimDemo: { age: {}, race: {}, sex: {} },
  timeOfDay: [],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useCrimeProfile', () => {
  it('starts with loading=true and no data', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useCrimeProfile('NY0303000'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data on successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockProfile,
    } as Response)
    const { result } = renderHook(() => useCrimeProfile('NY0303000'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(mockProfile)
    expect(result.current.error).toBeNull()
  })

  it('sets error on failed fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response)
    const { result } = renderHook(() => useCrimeProfile('NY0303000'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/503/)
    expect(result.current.data).toBeNull()
  })

  it('refetches when ori changes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => mockProfile,
    } as Response)
    const { result, rerender } = renderHook(({ ori }) => useCrimeProfile(ori), {
      initialProps: { ori: 'NY0303000' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ ori: 'IL0160000' })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useCrimeProfile.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Implement `src/hooks/useCrimeProfile.ts`**

```ts
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useCrimeProfile.test.ts 2>&1 | tail -10`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/hooks/useCrimeProfile.ts src/hooks/useCrimeProfile.test.ts
git commit -m "feat: add useCrimeProfile hook"
```

---

### Task 8: Install Recharts

**Files:**
- Modify: `package.json` (via npm install)

**Context:** Recharts is the charting library. It's React-native, composable, and works with Tailwind. It will be imported directly in `CrimeProfilePanel.tsx`.

**Step 1: Install**

Run: `npm install recharts`
Expected: added to `dependencies` in `package.json`

**Step 2: Verify TypeScript types are available**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no recharts-related errors (types ship with the package)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency"
```

---

### Task 9: `CityPins` — city markers on US-wide map

**Files:**
- Create: `src/views/city/CityPins.tsx`

**Context:** Renders 12 `<Marker>` components from react-map-gl (same import as `GlobalMarkers.tsx`). Each is a glowing cyan pulse dot. On click it calls `setSelectedCity` from Zustand and `flyTo` using the map ref (passed as a prop from MapCanvas). City name label appears on hover via `title` attribute and a small `<span>` that shows on hover.

**Step 1: Implement**

```tsx
// src/views/city/CityPins.tsx
import { Marker } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { CITIES } from '../../data/cities'
import type { MapRef } from 'react-map-gl/mapbox'
import type { CityProfile } from '../../types'

interface CityPinsProps {
  mapRef: React.RefObject<MapRef | null>
}

export function CityPins({ mapRef }: CityPinsProps) {
  const setSelectedCity = useHUDStore((s) => s.setSelectedCity)

  function flyToCity(city: CityProfile) {
    setSelectedCity(city)
    mapRef.current?.flyTo({
      center: [city.lng, city.lat],
      zoom: city.zoom,
      duration: 1500,
    })
  }

  return (
    <>
      {CITIES.map((city) => (
        <Marker key={city.id} longitude={city.lng} latitude={city.lat} anchor="center">
          <button
            onClick={() => flyToCity(city)}
            title={`${city.name}, ${city.state}`}
            className="group relative flex items-center justify-center w-6 h-6"
          >
            <span className="absolute w-6 h-6 rounded-full bg-hud-cyan opacity-20 animate-ping" />
            <span className="relative w-2 h-2 rounded-full bg-hud-cyan shadow-[0_0_8px_#00d4ff]" />
            <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block
              whitespace-nowrap text-[10px] font-mono text-hud-cyan bg-hud-panel px-1.5 py-0.5 rounded
              border border-hud-cyan/20 pointer-events-none">
              {city.name}
            </span>
          </button>
        </Marker>
      ))}
    </>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/city/CityPins.tsx
git commit -m "feat: add CityPins marker component for city selection"
```

---

### Task 10: `CitySearch` — terminal-style search overlay

**Files:**
- Create: `src/views/city/CitySearch.tsx`

**Context:** Fixed overlay at top-left of the city view (not inside the Map component — it's a regular React div). Shows a text input and filtered city list. On selection it calls `setSelectedCity` and `flyTo` (same as CityPins). Styled consistently with the HUD (`font-mono`, dark bg, cyan accents). Only visible in city view — App.tsx will gate it with `activeView === 'city'`.

**Step 1: Implement**

```tsx
// src/views/city/CitySearch.tsx
import { useState, useRef } from 'react'
import { useHUDStore } from '../../store'
import { CITIES } from '../../data/cities'
import type { MapRef } from 'react-map-gl/mapbox'
import type { CityProfile } from '../../types'

interface CitySearchProps {
  mapRef: React.RefObject<MapRef | null>
}

export function CitySearch({ mapRef }: CitySearchProps) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const setSelectedCity = useHUDStore((s) => s.setSelectedCity)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? CITIES.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.state.toLowerCase().includes(query.toLowerCase())
      )
    : CITIES

  function select(city: CityProfile) {
    setSelectedCity(city)
    mapRef.current?.flyTo({ center: [city.lng, city.lat], zoom: city.zoom, duration: 1500 })
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }

  return (
    <div className="fixed top-16 left-4 z-30 w-64 font-mono">
      <div className="flex items-center gap-2 bg-hud-panel border border-hud-cyan/20 px-3 py-2 rounded">
        <span className="text-hud-cyan text-xs">◉</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()}
          placeholder="SEARCH CITY"
          className="flex-1 bg-transparent text-hud-text text-xs outline-none placeholder:text-hud-dim tracking-widest"
        />
      </div>

      {focused && (
        <div className="mt-1 bg-hud-panel border border-hud-cyan/20 rounded overflow-hidden max-h-64 overflow-y-auto">
          {filtered.map((city) => (
            <button
              key={city.id}
              onMouseDown={() => select(city)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-hud-cyan/10 transition-colors
                text-hud-text hover:text-hud-cyan flex justify-between items-center"
            >
              <span className="tracking-widest">{city.name}</span>
              <span className="text-hud-dim">{city.state}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-hud-dim">NO MATCH</div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/city/CitySearch.tsx
git commit -m "feat: add CitySearch terminal-style search overlay"
```

---

### Task 11: Update `MapCanvas` — city view initial state + CityPins + CitySearch

**Files:**
- Modify: `src/components/MapCanvas/index.tsx`
- Modify: `src/App.tsx`

**Context:** Two changes:
1. `MapCanvas` city view config changes from NYC zoom-11 to US-wide zoom-3.5. The `mapRef` is already in `MapCanvas` — pass it to `CityPins`. Import `CitySearch` is mounted in `App.tsx` (not inside `<Map>`) because it's a regular DOM overlay, not a Mapbox layer.
2. `App.tsx` mounts `<CitySearch mapRef={mapRef} />` — but `mapRef` lives in `MapCanvas`. To share it, lift the ref out or expose it via a store. **Simplest approach:** Create a module-level ref export in a new file `src/mapRef.ts` that both `MapCanvas` and `CitySearch`/`CityPins` import.

**Step 1: Create `src/mapRef.ts`**

```ts
// src/mapRef.ts
import { createRef } from 'react'
import type { MapRef } from 'react-map-gl/mapbox'

export const mapRef = createRef<MapRef>()
```

**Step 2: Update `MapCanvas` city view config**

In `src/components/MapCanvas/index.tsx`, change:
```ts
// BEFORE
city: {
  mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
  initialViewState: { longitude: -74.006, latitude: 40.7128, zoom: 11 },
},

// AFTER
city: {
  mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
  initialViewState: { longitude: -96, latitude: 38, zoom: 3.5 },
},
```

Import shared mapRef and use it:
```ts
import { mapRef } from '../../mapRef'
import { CityPins } from '../../views/city/CityPins'
```

Replace the `const mapRef = useRef<MapRef>(null)` line with just importing it (remove the local `useRef` for mapRef).

Update `<Map ref={mapRef} ...>` to use the imported ref.

In the city markers section, add `CityPins` when no city is selected:
```tsx
{activeView === 'city' && !selectedCity && <CityPins mapRef={mapRef} />}
{activeView === 'city' && <CityMarkers />}
```

Also add to imports: `const selectedCity = useHUDStore((s) => s.selectedCity)`

**Step 3: Update `App.tsx`**

Add imports:
```ts
import { CitySearch } from './views/city/CitySearch'
import { mapRef } from './mapRef'
```

Inside the return, add alongside `<LayerToggles>`:
```tsx
{activeView === 'city' && <CitySearch mapRef={mapRef} />}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 5: Verify it renders** — run `npm run dev`, switch to City view, confirm the map shows US-wide view with 12 cyan pulse dots and the search box.

**Step 6: Commit**

```bash
git add src/mapRef.ts src/components/MapCanvas/index.tsx src/App.tsx
git commit -m "feat: update city view to US-wide map with CityPins and CitySearch"
```

---

### Task 12: Update `CityMarkers` — only render POIs when city is selected

**Files:**
- Modify: `src/views/city/CityMarkers.tsx`

**Context:** Currently `CityMarkers` always renders the heatmap and NYC POI pins. After this task it only renders when `selectedCity` is set. The POI data (`cityPOIs`) remains hardcoded NYC data — that's fine for now.

**Step 1: Modify `CityMarkers.tsx`**

Add to imports:
```ts
import { useHUDStore } from '../../store'
```

At the top of `CityMarkers()`:
```ts
const selectedCity = useHUDStore((s) => s.selectedCity)
if (!selectedCity) return null
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/city/CityMarkers.tsx
git commit -m "feat: hide city POI markers when no city is selected"
```

---

### Task 13: `CrimeProfilePanel` — skeleton, header, loading and error states

**Files:**
- Create: `src/views/city/CrimeProfilePanel.tsx`

**Context:** This is the full right-hand panel. Built in stages — this task covers the shell, header with back button, and loading/error states. Charts come in Tasks 14–15. Uses Framer Motion `AnimatePresence` + `motion.div` for slide-in (same pattern as `EntityPanel`). The panel is mounted in `App.tsx` in Task 16 — for now just build the component.

**Step 1: Implement the shell**

```tsx
// src/views/city/CrimeProfilePanel.tsx
import { motion } from 'framer-motion'
import { useHUDStore } from '../../store'
import { useCrimeProfile } from '../../hooks/useCrimeProfile'
import { mapRef } from '../../mapRef'
import { CITIES } from '../../data/cities'

// Shared chart colors aligned with HUD palette
export const CHART_COLORS = {
  cyan:   '#00d4ff',
  amber:  '#ffaa00',
  red:    '#ff2d2d',
  purple: '#7b2fff',
  green:  '#00ff88',
  dim:    '#4a6080',
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-2 py-4">
      <div className="h-2 bg-hud-cyan/10 rounded w-1/3" />
      <div className="h-24 bg-hud-cyan/5 rounded" />
    </div>
  )
}

function SectionError({ label }: { label: string }) {
  return (
    <div className="py-4 text-[10px] font-mono text-red-500/60 tracking-widest">
      SIGNAL LOST — {label}
    </div>
  )
}

export function CrimeProfilePanel() {
  const selectedCity = useHUDStore((s) => s.selectedCity)
  const setSelectedCity = useHUDStore((s) => s.setSelectedCity)
  const { data, loading, error } = useCrimeProfile(selectedCity?.ori ?? null)

  function handleBack() {
    setSelectedCity(null)
    mapRef.current?.flyTo({ center: [-96, 38], zoom: 3.5, duration: 1500 })
  }

  if (!selectedCity) return null

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.3 }}
      className="fixed right-0 top-0 h-full w-96 bg-hud-panel border-l border-hud-cyan/20
        flex flex-col z-20 overflow-hidden"
    >
      {/* Sticky header */}
      <div className="flex-none border-b border-hud-cyan/20 px-4 py-3">
        <button
          onClick={handleBack}
          className="text-[10px] font-mono text-hud-dim hover:text-hud-cyan transition-colors
            tracking-widest mb-2 flex items-center gap-1"
        >
          ← ALL CITIES
        </button>
        <div className="text-hud-cyan font-mono text-sm tracking-widest">
          {selectedCity.name.toUpperCase()}
        </div>
        <div className="text-hud-dim font-mono text-[10px] tracking-widest mt-0.5">
          CRIME PROFILE 2015–2024 · {selectedCity.state}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        {error && <SectionError label="FBI CDE API" />}
        {loading && (
          <>
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        )}
        {/* Charts rendered in Tasks 14–15 */}
        {data && !loading && (
          <div className="text-hud-dim font-mono text-[10px] tracking-widest py-4 text-center">
            DATA RECEIVED — CHARTS LOADING
          </div>
        )}
      </div>
    </motion.div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/city/CrimeProfilePanel.tsx
git commit -m "feat: add CrimeProfilePanel shell with header and loading states"
```

---

### Task 14: `CrimeProfilePanel` — trend and offense charts

**Files:**
- Modify: `src/views/city/CrimeProfilePanel.tsx`

**Context:** Add the top two chart sections. Recharts components are imported from `recharts`. All charts use `ResponsiveContainer` so they fill the panel width. The HUD color palette is already defined in `CHART_COLORS`. Axes use tiny monospace labels; no grid lines (too noisy on dark bg). Tooltips styled dark.

**Step 1: Add trend and offense charts**

Add recharts imports at the top of `CrimeProfilePanel.tsx`:
```tsx
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, LabelList,
} from 'recharts'
```

Replace the placeholder `{data && !loading && (...)}` block with:

```tsx
{data && !loading && (
  <>
    {/* 10-Year Crime Trend */}
    <div>
      <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">
        10-YEAR VIOLENT CRIME TREND
      </div>
      {data.trend.length === 0 ? (
        <SectionError label="TREND DATA" />
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data.trend}>
            <XAxis
              dataKey="year"
              tick={{ fill: CHART_COLORS.dim, fontSize: 9, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: '#0a0f1e', border: '1px solid #00d4ff22', fontFamily: 'monospace', fontSize: 10 }}
              labelStyle={{ color: CHART_COLORS.cyan }}
              itemStyle={{ color: CHART_COLORS.dim }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={CHART_COLORS.cyan}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>

    {/* Top Offenses */}
    <div>
      <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">
        TOP OFFENSES
      </div>
      {data.offenses.length === 0 ? (
        <SectionError label="OFFENSE DATA" />
      ) : (
        <ResponsiveContainer width="100%" height={data.offenses.length * 28 + 8}>
          <BarChart data={data.offenses} layout="vertical" margin={{ left: 0, right: 40 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="offense"
              width={110}
              tick={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: '#0a0f1e', border: '1px solid #ffaa0022', fontFamily: 'monospace', fontSize: 10 }}
              labelStyle={{ color: CHART_COLORS.amber }}
              itemStyle={{ color: CHART_COLORS.dim }}
            />
            <Bar dataKey="count" fill={CHART_COLORS.amber} radius={[0, 2, 2, 0]}>
              <LabelList dataKey="count" position="right"
                style={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </>
)}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
git add src/views/city/CrimeProfilePanel.tsx
git commit -m "feat: add crime trend and offense charts to CrimeProfilePanel"
```

---

### Task 15: `CrimeProfilePanel` — weapons, demographics, and time-of-day charts

**Files:**
- Modify: `src/views/city/CrimeProfilePanel.tsx`

**Context:** Add the bottom three chart sections. Demographics uses a grouped bar approach — two side-by-side `BarChart`s (offender vs victim) for the race breakdown (most meaningful). Time-of-day uses 24 bars with a gradient from dim to cyan at the peak hour.

**Step 1: Add weapon chart helper function (inside the file, before the component)**

```tsx
// Add before CrimeProfilePanel function:
function DemoChart({ title, data, color }: {
  title: string
  data: Record<string, number>
  color: string
}) {
  const chartData = Object.entries(data)
    .map(([label, count]) => ({ label: label.length > 8 ? label.slice(0, 8) : label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] font-mono text-hud-dim tracking-widest mb-1">{title}</div>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: CHART_COLORS.dim, fontSize: 7, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false} />
          <YAxis hide />
          <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

**Step 2: Append weapon, demographics, and time-of-day sections inside the `{data && !loading && (<>...</>)}` block**

After the offenses section, before the closing `</>`:

```tsx
    {/* Weapons */}
    <div>
      <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">WEAPONS</div>
      {data.weapons.length === 0 ? (
        <SectionError label="WEAPON DATA" />
      ) : (
        <ResponsiveContainer width="100%" height={data.weapons.length * 26 + 8}>
          <BarChart data={data.weapons} layout="vertical" margin={{ left: 0, right: 40 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="weapon" width={110}
              tick={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }}
              axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid #ff2d2d22',
              fontFamily: 'monospace', fontSize: 10 }}
              labelStyle={{ color: CHART_COLORS.red }} itemStyle={{ color: CHART_COLORS.dim }} />
            <Bar dataKey="count" fill={CHART_COLORS.red} radius={[0, 2, 2, 0]}>
              <LabelList dataKey="count" position="right"
                style={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>

    {/* Demographics */}
    <div>
      <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">
        DEMOGRAPHICS · RACE BREAKDOWN
      </div>
      <div className="flex gap-2">
        <DemoChart title="OFFENDER" data={data.offenderDemo.race} color={CHART_COLORS.purple} />
        <DemoChart title="VICTIM"   data={data.victimDemo.race}   color={CHART_COLORS.green} />
      </div>
    </div>

    {/* Time of Day */}
    <div>
      <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">TIME OF DAY (24H)</div>
      {data.timeOfDay.every((b) => b.count === 0) ? (
        <SectionError label="TIME-OF-DAY DATA" />
      ) : (() => {
        const max = Math.max(...data.timeOfDay.map((b) => b.count), 1)
        return (
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={data.timeOfDay} margin={{ left: 0, right: 0 }}>
              <XAxis dataKey="hour" tick={{ fill: CHART_COLORS.dim, fontSize: 7, fontFamily: 'monospace' }}
                tickFormatter={(h) => h % 6 === 0 ? `${h}h` : ''} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid #00d4ff22',
                fontFamily: 'monospace', fontSize: 10 }}
                labelFormatter={(h) => `${h}:00`} labelStyle={{ color: CHART_COLORS.cyan }}
                itemStyle={{ color: CHART_COLORS.dim }} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {data.timeOfDay.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={`rgba(0, 212, 255, ${0.15 + 0.85 * (entry.count / max)})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      })()}
    </div>

    {/* Footer */}
    <div className="text-[9px] font-mono text-hud-dim/40 tracking-widest text-center pb-4">
      SOURCE: FBI CRIME DATA EXPLORER · UCR/NIBRS
    </div>
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 4: Commit**

```bash
git add src/views/city/CrimeProfilePanel.tsx
git commit -m "feat: add weapons, demographics, and time-of-day charts to CrimeProfilePanel"
```

---

### Task 16: Wire `CrimeProfilePanel` into `App.tsx` and verify end-to-end

**Files:**
- Modify: `src/App.tsx`

**Context:** Mount `CrimeProfilePanel` inside `AnimatePresence` so the Framer Motion `exit` animation runs. Also add `FBI_CDE_API_KEY` to `.env.local` before testing (get a free key at https://api.data.gov/signup/).

**Step 1: Update `App.tsx`**

Add import:
```ts
import { CrimeProfilePanel } from './views/city/CrimeProfilePanel'
```

Wrap existing `AnimatePresence` or add a new one around `CrimeProfilePanel`. The simplest is to add it alongside `EntityPanel`:

```tsx
<AnimatePresence>
  {activeView === 'city' && selectedCity && <CrimeProfilePanel key="crime-panel" />}
</AnimatePresence>
```

Also add at the top of `App()`:
```ts
const selectedCity = useHUDStore((s) => s.selectedCity)
```

**Step 2: Add `FBI_CDE_API_KEY` to `.env.local`**

In `.env.local` (create if it doesn't exist, never commit this file — it's in `.gitignore`):
```
FBI_CDE_API_KEY=your_key_here
```

**Step 3: Run all tests**

Run: `npx vitest run 2>&1 | tail -15`
Expected: all tests PASS

**Step 4: Manual end-to-end test**

1. Run: `npm run dev`
2. Switch to City view (key `2`)
3. Confirm US-wide map with 12 cyan pulse markers
4. Confirm search box at top-left
5. Click any city pin → map flies to city, panel slides in from right
6. Confirm loading skeletons appear while data fetches
7. Confirm charts render (trend, offenses, weapons, demographics, time-of-day)
8. Click `← ALL CITIES` → panel slides out, map flies back to US view
9. Test search: type "chi" → Chicago appears → click → same flow

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire CrimeProfilePanel into App — city crime profile complete"
```

---

### Task 17: Final cleanup — run full test suite and verify build

**Files:** none (verification only)

**Step 1: Run full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: all tests pass (count increases from prior tasks)

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

**Step 3: Run lint**

Run: `npm run lint 2>&1 | head -20`
Expected: no errors (fix any that appear)

**Step 4: Commit any lint fixes, then done**

```bash
git add -A
git commit -m "chore: fix lint warnings from city crime profile feature"
```
