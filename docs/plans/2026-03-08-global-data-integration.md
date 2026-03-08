# Global View Live Data Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded mock incidents in the global view with real-time conflict, disaster, and military flight data from USGS, GDACS, NASA EONET, ACLED, and OpenSky.

**Architecture:** A Hono server runs alongside Vite, polling upstream sources every 30s and caching results in memory. The frontend reads from two endpoints (`/api/incidents`, `/api/flights`) via Vite proxy. Clients always hit the cache — upstream rate limits are never multiplied by browser count.

**Tech Stack:** Hono + `@hono/node-server`, `fast-xml-parser`, `tsx`, `concurrently`, Vitest (already installed)

**Design doc:** `docs/plans/2026-03-08-global-data-integration-design.md`

---

### Task 1: Install Dependencies and Wire Dev Script

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

**Step 1: Install server dependencies**

```bash
npm install hono @hono/node-server fast-xml-parser
npm install -D tsx concurrently
```

**Step 2: Add dev script to `package.json`**

Replace the `"dev"` script:
```json
"dev": "concurrently \"vite\" \"tsx watch server/index.ts\""
```
Also add a standalone server script:
```json
"server": "tsx watch server/index.ts"
```

**Step 3: Add Vite proxy to `vite.config.ts`**

Add a `server.proxy` block inside `defineConfig({...})`:
```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
},
```

**Step 4: Verify**

```bash
npm run dev
```
Expected: two processes start — Vite on 5173, server on 3001 (will crash until Task 11 creates `server/index.ts`, that's fine).

**Step 5: Commit**

```bash
git add package.json vite.config.ts package-lock.json
git commit -m "chore: add hono server deps and vite proxy"
```

---

### Task 2: Extend Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add `source`, `url` to `GlobalIncident` and add `MilitaryFlight` and `GlobalLayer`**

In `src/types/index.ts`, update `GlobalIncident`:
```ts
export interface GlobalIncident {
  id: string
  lat: number
  lng: number
  country: string
  type: string
  severity: Severity
  timestamp: string
  summary: string
  source: 'usgs' | 'gdacs' | 'eonet' | 'acled'  // NEW
  url?: string                                     // NEW
}
```

Add after `GlobalIncident`:
```ts
export interface MilitaryFlight {
  id: string        // ICAO 24-bit hex
  callsign: string
  lat: number
  lng: number
  altitude: number  // meters
  velocity: number  // m/s
  heading: number   // degrees 0–360
  country: string
  timestamp: string
}

export type GlobalLayer = 'conflict' | 'disaster' | 'military'
```

**Step 2: Fix the mock data to satisfy the updated type**

`src/data/global-incidents.ts` will have a TS error because `source` is now required. Add `source: 'acled' as const` to each entry (we will delete this file entirely in Task 18, this is just to keep TS happy until then).

**Step 3: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/types/index.ts src/data/global-incidents.ts
git commit -m "feat: extend GlobalIncident with source/url, add MilitaryFlight and GlobalLayer types"
```

---

### Task 3: In-Memory Cache Module

**Files:**
- Create: `server/cache.ts`
- Create: `server/cache.test.ts`

**Step 1: Write the failing test**

```ts
// server/cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setIncidents, getIncidents, setStale, getCacheStatus,
  setFlights, getFlights,
} from './cache'
import type { GlobalIncident } from '../src/types'

const makeIncident = (id: string): GlobalIncident => ({
  id, lat: 0, lng: 0, country: 'Test', type: 'Earthquake',
  severity: 'medium', timestamp: new Date().toISOString(),
  summary: 'test', source: 'usgs',
})

describe('cache', () => {
  beforeEach(() => {
    setIncidents('usgs', [])
    setIncidents('gdacs', [])
  })

  it('merges incidents from multiple sources', () => {
    setIncidents('usgs', [makeIncident('u1')])
    setIncidents('gdacs', [makeIncident('g1')])
    expect(getIncidents().map(i => i.id)).toContain('u1')
    expect(getIncidents().map(i => i.id)).toContain('g1')
  })

  it('replaces previous data for the same source', () => {
    setIncidents('usgs', [makeIncident('u1')])
    setIncidents('usgs', [makeIncident('u2')])
    const ids = getIncidents().map(i => i.id)
    expect(ids).not.toContain('u1')
    expect(ids).toContain('u2')
  })

  it('marks a source stale without clearing its data', () => {
    setIncidents('usgs', [makeIncident('u1')])
    setStale('usgs')
    expect(getIncidents().map(i => i.id)).toContain('u1')
    expect(getCacheStatus('usgs').stale).toBe(true)
  })

  it('stores and retrieves flights', () => {
    setFlights([{ id: 'abc', callsign: 'RCH100', lat: 1, lng: 2,
      altitude: 10000, velocity: 250, heading: 90, country: 'USA',
      timestamp: new Date().toISOString() }])
    expect(getFlights()[0].callsign).toBe('RCH100')
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/cache.test.ts
```
Expected: FAIL — `./cache` not found.

**Step 3: Implement `server/cache.ts`**

```ts
// server/cache.ts
import type { GlobalIncident, MilitaryFlight } from '../src/types'

interface SourceEntry {
  data: GlobalIncident[]
  lastUpdated: number
  stale: boolean
}

const incidentStore = new Map<string, SourceEntry>()
let flightStore: MilitaryFlight[] = []
let flightsUpdatedAt = 0

export function setIncidents(source: string, data: GlobalIncident[]) {
  incidentStore.set(source, { data, lastUpdated: Date.now(), stale: false })
}

export function setStale(source: string) {
  const entry = incidentStore.get(source)
  if (entry) incidentStore.set(source, { ...entry, stale: true })
}

export function getIncidents(): GlobalIncident[] {
  const all: GlobalIncident[] = []
  for (const entry of incidentStore.values()) all.push(...entry.data)
  return all
}

export function getCacheStatus(source: string) {
  return incidentStore.get(source) ?? { data: [], lastUpdated: 0, stale: false }
}

export function setFlights(data: MilitaryFlight[]) {
  flightStore = data
  flightsUpdatedAt = Date.now()
}

export function getFlights(): MilitaryFlight[] {
  return flightStore
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/cache.test.ts
```
Expected: all 4 tests PASS.

**Step 5: Commit**

```bash
git add server/cache.ts server/cache.test.ts
git commit -m "feat: add in-memory cache module with source-keyed incident and flight stores"
```

---

### Task 4: USGS Earthquake Source

**Files:**
- Create: `server/sources/usgs.ts`
- Create: `server/sources/usgs.test.ts`

**Step 1: Write the failing tests**

```ts
// server/sources/usgs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUSGS, magnitudeToSeverity } from './usgs'

describe('magnitudeToSeverity', () => {
  it('maps 7.0+ to critical', () => expect(magnitudeToSeverity(7.5)).toBe('critical'))
  it('maps 6.0–6.9 to high',   () => expect(magnitudeToSeverity(6.2)).toBe('high'))
  it('maps 5.0–5.9 to medium', () => expect(magnitudeToSeverity(5.1)).toBe('medium'))
  it('maps <5.0 to low',       () => expect(magnitudeToSeverity(4.6)).toBe('low'))
})

describe('fetchUSGS', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('normalizes GeoJSON features to GlobalIncident[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          id: 'us1234',
          properties: { mag: 6.1, place: '100km N of Tokyo, Japan', time: 1700000000000, url: 'https://example.com' },
          geometry: { coordinates: [139.0, 35.0, 10.0] },
        }],
      }),
    }))

    const result = await fetchUSGS()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'usgs:us1234',
      lat: 35.0,
      lng: 139.0,
      type: 'Earthquake',
      severity: 'high',
      source: 'usgs',
    })
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchUSGS()).rejects.toThrow('USGS fetch failed: 503')
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/sources/usgs.test.ts
```
Expected: FAIL.

**Step 3: Implement `server/sources/usgs.ts`**

```ts
// server/sources/usgs.ts
import type { GlobalIncident, Severity } from '../../src/types'

const USGS_URL =
  'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&orderby=time&limit=100'

export function magnitudeToSeverity(mag: number): Severity {
  if (mag >= 7.0) return 'critical'
  if (mag >= 6.0) return 'high'
  if (mag >= 5.0) return 'medium'
  return 'low'
}

export async function fetchUSGS(): Promise<GlobalIncident[]> {
  const res = await fetch(USGS_URL)
  if (!res.ok) throw new Error(`USGS fetch failed: ${res.status}`)
  const json = await res.json()

  return json.features.map((f: any): GlobalIncident => ({
    id: `usgs:${f.id}`,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    country: f.properties.place ?? 'Unknown',
    type: 'Earthquake',
    severity: magnitudeToSeverity(f.properties.mag),
    timestamp: new Date(f.properties.time).toISOString(),
    summary: `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`,
    source: 'usgs',
    url: f.properties.url,
  }))
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/sources/usgs.test.ts
```
Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add server/sources/usgs.ts server/sources/usgs.test.ts
git commit -m "feat: add USGS earthquake source normalizer"
```

---

### Task 5: GDACS Disaster Source

**Files:**
- Create: `server/sources/gdacs.ts`
- Create: `server/sources/gdacs.test.ts`

**Step 1: Write the failing tests**

```ts
// server/sources/gdacs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchGDACS, alertLevelToSeverity } from './gdacs'

describe('alertLevelToSeverity', () => {
  it('maps RED to critical', () => expect(alertLevelToSeverity('Red')).toBe('critical'))
  it('maps ORANGE to high',  () => expect(alertLevelToSeverity('Orange')).toBe('high'))
  it('maps GREEN to low',    () => expect(alertLevelToSeverity('Green')).toBe('low'))
  it('handles unknown',      () => expect(alertLevelToSeverity('')).toBe('low'))
})

describe('fetchGDACS', () => {
  beforeEach(() => vi.restoreAllMocks())

  const sampleXml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:gdacs="http://www.gdacs.org" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
  <channel>
    <item>
      <title>Flood in Bangladesh</title>
      <link>https://gdacs.org/alert/1</link>
      <guid isPermaLink="false">https://gdacs.org/guid/1</guid>
      <pubDate>Sun, 09 Mar 2026 00:00:00 GMT</pubDate>
      <gdacs:alertlevel>Orange</gdacs:alertlevel>
      <gdacs:country>Bangladesh</gdacs:country>
      <gdacs:eventtype>FL</gdacs:eventtype>
      <geo:lat>23.7</geo:lat>
      <geo:long>90.4</geo:long>
    </item>
    <item>
      <title>Minor tremor</title>
      <link>https://gdacs.org/alert/2</link>
      <guid isPermaLink="false">https://gdacs.org/guid/2</guid>
      <gdacs:alertlevel>Green</gdacs:alertlevel>
      <gdacs:country>Italy</gdacs:country>
      <gdacs:eventtype>EQ</gdacs:eventtype>
      <geo:lat>41.9</geo:lat>
      <geo:long>12.5</geo:long>
    </item>
  </channel>
</rss>`

  it('filters out GREEN alerts and normalizes the rest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => sampleXml }))
    const result = await fetchGDACS()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'gdacs:https://gdacs.org/guid/1',
      lat: 23.7,
      lng: 90.4,
      country: 'Bangladesh',
      severity: 'high',
      source: 'gdacs',
    })
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchGDACS()).rejects.toThrow('GDACS fetch failed: 503')
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/sources/gdacs.test.ts
```
Expected: FAIL.

**Step 3: Implement `server/sources/gdacs.ts`**

```ts
// server/sources/gdacs.ts
import { XMLParser } from 'fast-xml-parser'
import type { GlobalIncident, Severity } from '../../src/types'

const GDACS_URL = 'https://www.gdacs.org/xml/rss.xml'
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export function alertLevelToSeverity(level: string): Severity {
  switch (level?.toUpperCase()) {
    case 'RED':    return 'critical'
    case 'ORANGE': return 'high'
    default:       return 'low'
  }
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  EQ: 'Earthquake', FL: 'Flood', TC: 'Cyclone',
  VO: 'Volcano', WF: 'Wildfire', DR: 'Drought',
}

export async function fetchGDACS(): Promise<GlobalIncident[]> {
  const res = await fetch(GDACS_URL)
  if (!res.ok) throw new Error(`GDACS fetch failed: ${res.status}`)
  const xml = await res.text()
  const parsed = parser.parse(xml)
  const items: any[] = parsed?.rss?.channel?.item ?? []

  return items
    .filter((item) => item['gdacs:alertlevel']?.toUpperCase() !== 'GREEN')
    .map((item): GlobalIncident => ({
      id: `gdacs:${item['guid']?.['#text'] ?? item['guid'] ?? item['link']}`,
      lat: parseFloat(item['geo:lat'] ?? item['gdacs:latitude'] ?? '0'),
      lng: parseFloat(item['geo:long'] ?? item['gdacs:longitude'] ?? '0'),
      country: item['gdacs:country'] ?? 'Unknown',
      type: EVENT_TYPE_LABELS[item['gdacs:eventtype']] ?? item['gdacs:eventtype'] ?? 'Disaster',
      severity: alertLevelToSeverity(item['gdacs:alertlevel']),
      timestamp: new Date(item['pubDate'] ?? Date.now()).toISOString(),
      summary: item['title'] ?? '',
      source: 'gdacs',
      url: item['link'],
    }))
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/sources/gdacs.test.ts
```
Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add server/sources/gdacs.ts server/sources/gdacs.test.ts
git commit -m "feat: add GDACS disaster source normalizer"
```

---

### Task 6: NASA EONET Source

**Files:**
- Create: `server/sources/eonet.ts`
- Create: `server/sources/eonet.test.ts`

**Step 1: Write the failing tests**

```ts
// server/sources/eonet.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEONET } from './eonet'

describe('fetchEONET', () => {
  beforeEach(() => vi.restoreAllMocks())

  const now = new Date().toISOString()
  const old = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString() // 50h ago

  const makeEvent = (id: string, category: string, date: string) => ({
    id,
    title: `${category} event`,
    link: `https://eonet.gsfc.nasa.gov/api/v3/events/${id}`,
    categories: [{ title: category }],
    geometry: [{ date, coordinates: [10.0, 20.0] }],
  })

  it('normalizes wildfire events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [makeEvent('e1', 'Wildfires', now)] }),
    }))
    const result = await fetchEONET()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'eonet:e1', type: 'Wildfire', source: 'eonet', severity: 'medium' })
  })

  it('excludes wildfires older than 48 hours', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [makeEvent('e2', 'Wildfires', old)] }),
    }))
    const result = await fetchEONET()
    expect(result).toHaveLength(0)
  })

  it('excludes earthquake events (USGS handles those)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [makeEvent('e3', 'Earthquakes', now)] }),
    }))
    const result = await fetchEONET()
    expect(result).toHaveLength(0)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/sources/eonet.test.ts
```

**Step 3: Implement `server/sources/eonet.ts`**

```ts
// server/sources/eonet.ts
import type { GlobalIncident } from '../../src/types'

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7&limit=100'
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000

const CATEGORY_TYPE: Record<string, string | null> = {
  'Wildfires':     'Wildfire',
  'Severe Storms': 'Severe Storm',
  'Volcanoes':     'Volcano',
  'Floods':        'Flood',
  'Landslides':    'Landslide',
  'Earthquakes':   null,  // excluded — USGS provides higher quality data
}

export async function fetchEONET(): Promise<GlobalIncident[]> {
  const res = await fetch(EONET_URL)
  if (!res.ok) throw new Error(`EONET fetch failed: ${res.status}`)
  const json = await res.json()

  const results: GlobalIncident[] = []
  for (const event of json.events ?? []) {
    const categoryTitle: string = event.categories?.[0]?.title ?? ''
    const type = CATEGORY_TYPE[categoryTitle]
    if (type === null || type === undefined) continue

    const geometry = event.geometry?.[0]
    if (!geometry) continue

    const [lng, lat] = geometry.coordinates
    const eventDate = new Date(geometry.date)

    if (categoryTitle === 'Wildfires' && Date.now() - eventDate.getTime() > FORTY_EIGHT_HOURS) continue

    results.push({
      id: `eonet:${event.id}`,
      lat,
      lng,
      country: 'Unknown',
      type,
      severity: 'medium',
      timestamp: eventDate.toISOString(),
      summary: event.title,
      source: 'eonet',
      url: event.link,
    })
  }
  return results
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/sources/eonet.test.ts
```
Expected: all 3 tests PASS.

**Step 5: Commit**

```bash
git add server/sources/eonet.ts server/sources/eonet.test.ts
git commit -m "feat: add NASA EONET natural events source normalizer"
```

---

### Task 7: ACLED Conflict Source

**Files:**
- Create: `server/sources/acled.ts`
- Create: `server/sources/acled.test.ts`

**Step 1: Write the failing tests**

```ts
// server/sources/acled.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchACLED, acledSeverity } from './acled'

describe('acledSeverity', () => {
  it('critical when fatalities > 10', () => expect(acledSeverity('Battles', 11)).toBe('critical'))
  it('high when fatalities > 0',      () => expect(acledSeverity('Battles', 1)).toBe('high'))
  it('low for protests with 0 deaths',() => expect(acledSeverity('Protests', 0)).toBe('low'))
  it('medium for other 0-death events',() => expect(acledSeverity('Strategic developments', 0)).toBe('medium'))
})

describe('fetchACLED', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('normalizes ACLED events to GlobalIncident[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          event_id_cnty: 'SYR1234',
          event_date: '2026-03-01',
          event_type: 'Battles',
          country: 'Syria',
          latitude: '35.5',
          longitude: '36.7',
          notes: 'Clashes reported near Aleppo.',
          fatalities: '3',
        }],
      }),
    }))

    const result = await fetchACLED('key', 'email@test.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'acled:SYR1234',
      lat: 35.5,
      lng: 36.7,
      country: 'Syria',
      type: 'Battles',
      severity: 'high',
      source: 'acled',
    })
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/sources/acled.test.ts
```

**Step 3: Implement `server/sources/acled.ts`**

```ts
// server/sources/acled.ts
import type { GlobalIncident, Severity } from '../../src/types'

const ACLED_BASE = 'https://api.acleddata.com/acled/read'

export function acledSeverity(eventType: string, fatalities: number): Severity {
  if (fatalities > 10) return 'critical'
  if (fatalities > 0)  return 'high'
  if (eventType === 'Protests') return 'low'
  return 'medium'
}

export async function fetchACLED(apiKey: string, email: string): Promise<GlobalIncident[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const params = new URLSearchParams({
    key: apiKey,
    email,
    event_date: thirtyDaysAgo,
    event_date_where: '>',
    limit: '200',
    fields: 'event_id_cnty:event_date:event_type:country:latitude:longitude:notes:fatalities',
  })

  const res = await fetch(`${ACLED_BASE}?${params}`)
  if (!res.ok) throw new Error(`ACLED fetch failed: ${res.status}`)
  const json = await res.json()

  return (json.data ?? []).map((e: any): GlobalIncident => ({
    id: `acled:${e.event_id_cnty}`,
    lat: parseFloat(e.latitude),
    lng: parseFloat(e.longitude),
    country: e.country,
    type: e.event_type,
    severity: acledSeverity(e.event_type, parseInt(e.fatalities ?? '0', 10)),
    timestamp: new Date(e.event_date).toISOString(),
    summary: (e.notes ?? e.event_type).slice(0, 200),
    source: 'acled',
  }))
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/sources/acled.test.ts
```
Expected: all 5 tests PASS.

**Step 5: Commit**

```bash
git add server/sources/acled.ts server/sources/acled.test.ts
git commit -m "feat: add ACLED conflict and unrest source normalizer"
```

---

### Task 8: OpenSky Military Flight Source

**Files:**
- Create: `server/sources/opensky.ts`
- Create: `server/sources/opensky.test.ts`

**Step 1: Write the failing tests**

```ts
// server/sources/opensky.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchOpenSky, isMilitary } from './opensky'

describe('isMilitary', () => {
  it('identifies RCH callsign prefix as military', () => expect(isMilitary('ae1234', 'RCH100')).toBe(true))
  it('identifies REACH prefix as military',        () => expect(isMilitary('ae1234', 'REACH100')).toBe(true))
  it('identifies NATO prefix as military',          () => expect(isMilitary('ae1234', 'NATO01')).toBe(true))
  it('identifies US military ICAO range',           () => expect(isMilitary('ae1000', 'DUKE1')).toBe(true))
  it('rejects commercial callsign',                 () => expect(isMilitary('4b1234', 'BAW123')).toBe(false))
  it('rejects empty callsign',                      () => expect(isMilitary('ae1234', '')).toBe(false))
})

describe('fetchOpenSky', () => {
  beforeEach(() => vi.restoreAllMocks())

  // OpenSky state vector: [icao24, callsign, country, time_pos, last_contact, lng, lat, baro_alt, on_ground, velocity, true_track, ...]
  const militaryState = ['ae1234', 'RCH100  ', 'United States', 1700000000, 1700000000, -80.0, 40.0, 10000, false, 250, 90, null, null, null, null, false, 0]
  const civilState    = ['4b1234', 'BAW123  ', 'United Kingdom', 1700000000, 1700000000, -0.1, 51.5, 9000, false, 220, 270, null, null, null, null, false, 0]

  it('returns only military flights', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ states: [militaryState, civilState] }),
    }))
    const result = await fetchOpenSky()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'ae1234',
      callsign: 'RCH100',
      lat: 40.0,
      lng: -80.0,
      heading: 90,
    })
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/sources/opensky.test.ts
```

**Step 3: Implement `server/sources/opensky.ts`**

```ts
// server/sources/opensky.ts
import type { MilitaryFlight } from '../../src/types'

const OPENSKY_URL = 'https://opensky-network.org/api/states/all'

const MILITARY_PREFIXES = [
  'RCH', 'REACH', 'EVAC', 'NATO', 'RRR', 'GAF',
  'BAF', 'IAM', 'DUKE', 'MAROC', 'TOPGUN', 'VIPER',
  'GHOST', 'KNIFE', 'SLAM', 'COBRA', 'HAWK',
]

// ICAO 24-bit hex ranges for military aircraft (country code blocks)
const MILITARY_ICAO_RANGES: Array<[number, number]> = [
  [0xAE0000, 0xAEFFFF], // US military
  [0x43C000, 0x43CFFF], // French military
  [0x3A0000, 0x3AFFFF], // UK military
  [0x68C000, 0x68CFFF], // German military
  [0x710000, 0x71FFFF], // Chinese military
]

export function isMilitary(icao24: string, callsign: string): boolean {
  if (!callsign?.trim()) return false
  const cs = callsign.trim().toUpperCase()
  if (MILITARY_PREFIXES.some((p) => cs.startsWith(p))) return true
  const icaoNum = parseInt(icao24, 16)
  return MILITARY_ICAO_RANGES.some(([min, max]) => icaoNum >= min && icaoNum <= max)
}

export async function fetchOpenSky(clientId?: string, clientSecret?: string): Promise<MilitaryFlight[]> {
  const headers: Record<string, string> = {}
  if (clientId && clientSecret) {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }

  const res = await fetch(OPENSKY_URL, { headers })
  if (!res.ok) throw new Error(`OpenSky fetch failed: ${res.status}`)
  const json = await res.json()

  return (json.states ?? [])
    .filter((s: any[]) => s[5] !== null && s[6] !== null && isMilitary(s[0], s[1]))
    .map((s: any[]): MilitaryFlight => ({
      id: s[0],
      callsign: (s[1] ?? '').trim(),
      lat: s[6],
      lng: s[5],
      altitude: s[7] ?? 0,
      velocity: s[9] ?? 0,
      heading: s[10] ?? 0,
      country: s[2] ?? 'Unknown',
      timestamp: new Date((s[3] ?? Date.now() / 1000) * 1000).toISOString(),
    }))
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/sources/opensky.test.ts
```
Expected: all 7 tests PASS.

**Step 5: Commit**

```bash
git add server/sources/opensky.ts server/sources/opensky.test.ts
git commit -m "feat: add OpenSky military flight source with ICAO and callsign filtering"
```

---

### Task 9: Deduplication Utility

**Files:**
- Create: `server/dedup.ts`
- Create: `server/dedup.test.ts`

**Step 1: Write the failing tests**

```ts
// server/dedup.test.ts
import { describe, it, expect } from 'vitest'
import { deduplicateIncidents } from './dedup'
import type { GlobalIncident } from '../src/types'

const make = (id: string, lat: number, lng: number, type: string, minutesAgo = 0, severity: GlobalIncident['severity'] = 'medium'): GlobalIncident => ({
  id, lat, lng, country: 'X', type, severity,
  timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  summary: 'test', source: 'usgs',
})

describe('deduplicateIncidents', () => {
  it('keeps events from different locations', () => {
    const result = deduplicateIncidents([
      make('a', 35.0, 139.0, 'Earthquake'),
      make('b', 10.0, 20.0, 'Earthquake'),
    ])
    expect(result).toHaveLength(2)
  })

  it('deduplicates same-type events within 0.1° grid and 30min window', () => {
    // Both events are within 0.1° of each other and within 30 minutes
    const result = deduplicateIncidents([
      make('usgs:1', 35.001, 139.001, 'Earthquake', 5),
      make('gdacs:1', 35.002, 139.002, 'Earthquake', 10),
    ])
    expect(result).toHaveLength(1)
  })

  it('keeps the higher-severity event when deduplicating', () => {
    const result = deduplicateIncidents([
      make('a', 35.001, 139.001, 'Earthquake', 5, 'medium'),
      make('b', 35.002, 139.002, 'Earthquake', 10, 'critical'),
    ])
    expect(result[0].severity).toBe('critical')
  })

  it('keeps both events of same type but different locations', () => {
    const result = deduplicateIncidents([
      make('a', 35.0, 139.0, 'Earthquake'),
      make('b', 36.0, 140.0, 'Earthquake'),  // >0.1° away
    ])
    expect(result).toHaveLength(2)
  })

  it('keeps both events of different types at same location', () => {
    const result = deduplicateIncidents([
      make('a', 35.0, 139.0, 'Earthquake'),
      make('b', 35.0, 139.0, 'Flood'),
    ])
    expect(result).toHaveLength(2)
  })

  it('sorts results by timestamp descending', () => {
    const result = deduplicateIncidents([
      make('old', 10.0, 20.0, 'Flood', 60),
      make('new', 11.0, 21.0, 'Flood', 5),
    ])
    expect(result[0].id).toBe('new')
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run server/dedup.test.ts
```

**Step 3: Implement `server/dedup.ts`**

```ts
// server/dedup.ts
import type { GlobalIncident, Severity } from '../src/types'

const GRID_SIZE = 0.1      // degrees (~11km)
const TIME_WINDOW = 30 * 60_000  // 30 minutes

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4, high: 3, medium: 2, low: 1, nominal: 0,
}

function gridCell(lat: number, lng: number): string {
  return `${Math.round(lat / GRID_SIZE)},${Math.round(lng / GRID_SIZE)}`
}

export function deduplicateIncidents(incidents: GlobalIncident[]): GlobalIncident[] {
  const seen = new Map<string, GlobalIncident>()

  for (const incident of incidents) {
    const key = `${gridCell(incident.lat, incident.lng)}:${incident.type}`
    const existing = seen.get(key)

    if (!existing) {
      seen.set(key, incident)
      continue
    }

    const timeDiff = Math.abs(
      new Date(incident.timestamp).getTime() - new Date(existing.timestamp).getTime()
    )

    if (timeDiff <= TIME_WINDOW) {
      // Same spatio-temporal window — keep higher severity
      if (SEVERITY_RANK[incident.severity] > SEVERITY_RANK[existing.severity]) {
        seen.set(key, incident)
      }
    } else {
      // Different time window — both are distinct events, use timestamp-scoped key
      seen.set(`${key}:${incident.timestamp}`, incident)
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/dedup.test.ts
```
Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add server/dedup.ts server/dedup.test.ts
git commit -m "feat: add geo-grid deduplication for cross-source incident merging"
```

---

### Task 10: Poller — Orchestrate All Sources

**Files:**
- Create: `server/poller.ts`

No dedicated unit test (integration behavior — tested implicitly by the running server). The poller is thin orchestration over already-tested source functions.

**Step 1: Create `server/poller.ts`**

```ts
// server/poller.ts
import { fetchUSGS } from './sources/usgs'
import { fetchGDACS } from './sources/gdacs'
import { fetchEONET } from './sources/eonet'
import { fetchACLED } from './sources/acled'
import { fetchOpenSky } from './sources/opensky'
import { setIncidents, setStale, setFlights } from './cache'

const POLL_INTERVAL = 30_000

async function pollIncidents() {
  const disasterSources = [
    { name: 'usgs', fn: fetchUSGS },
    { name: 'gdacs', fn: fetchGDACS },
    { name: 'eonet', fn: fetchEONET },
  ] as const

  await Promise.allSettled(
    disasterSources.map(async ({ name, fn }) => {
      try {
        setIncidents(name, await fn())
        console.log(`[poller] ${name} OK`)
      } catch (e) {
        console.error(`[poller] ${name} failed:`, (e as Error).message)
        setStale(name)
      }
    })
  )

  const apiKey = process.env.ACLED_API_KEY
  const email  = process.env.ACLED_EMAIL
  if (apiKey && email) {
    try {
      setIncidents('acled', await fetchACLED(apiKey, email))
      console.log('[poller] acled OK')
    } catch (e) {
      console.error('[poller] acled failed:', (e as Error).message)
      setStale('acled')
    }
  }
}

async function pollFlights() {
  try {
    setFlights(await fetchOpenSky(process.env.OPENSKY_CLIENT_ID, process.env.OPENSKY_CLIENT_SECRET))
    console.log('[poller] opensky OK')
  } catch (e) {
    console.error('[poller] opensky failed:', (e as Error).message)
  }
}

export async function startPoller() {
  console.log('[poller] initial fetch…')
  await Promise.all([pollIncidents(), pollFlights()])
  console.log('[poller] started — polling every 30s')
  setInterval(pollIncidents, POLL_INTERVAL)
  setInterval(pollFlights, POLL_INTERVAL)
}
```

**Step 2: Commit**

```bash
git add server/poller.ts
git commit -m "feat: add poller to orchestrate 30s source refresh cycle"
```

---

### Task 11: Hono Server Entry Point

**Files:**
- Create: `server/index.ts`

**Step 1: Create `server/index.ts`**

```ts
// server/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIncidents, getFlights } from './cache'
import { deduplicateIncidents } from './dedup'
import { startPoller } from './poller'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
}))

app.get('/api/incidents', (c) => c.json(deduplicateIncidents(getIncidents())))
app.get('/api/flights',   (c) => c.json(getFlights()))

// Block until initial data is fetched, then start accepting connections
await startPoller()

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('GothamHUD server → http://localhost:3001')
})
```

**Step 2: Run the full dev stack**

```bash
npm run dev
```
Expected: Vite starts on 5173, server logs `[poller] initial fetch…` then `GothamHUD server → http://localhost:3001`.

**Step 3: Smoke test the endpoints**

```bash
curl -s http://localhost:3001/api/incidents | python3 -m json.tool | head -30
curl -s http://localhost:3001/api/flights   | python3 -m json.tool | head -20
```
Expected: JSON arrays (may be empty if no keys are configured yet, USGS/GDACS/EONET require no keys so incidents should have data).

**Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add Hono server with /api/incidents and /api/flights routes"
```

---

### Task 12: Zustand — Add globalLayers

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/store.test.ts`

**Step 1: Add failing test to `store.test.ts`**

Add this describe block to the existing test file:

```ts
describe('globalLayers', () => {
  it('starts with all three layers active', () => {
    const { globalLayers } = useHUDStore.getState()
    expect(globalLayers.has('conflict')).toBe(true)
    expect(globalLayers.has('disaster')).toBe(true)
    expect(globalLayers.has('military')).toBe(true)
  })

  it('toggleGlobalLayer removes an active layer', () => {
    useHUDStore.getState().toggleGlobalLayer('conflict')
    expect(useHUDStore.getState().globalLayers.has('conflict')).toBe(false)
  })

  it('toggleGlobalLayer re-adds an inactive layer', () => {
    useHUDStore.getState().toggleGlobalLayer('conflict') // off
    useHUDStore.getState().toggleGlobalLayer('conflict') // on
    expect(useHUDStore.getState().globalLayers.has('conflict')).toBe(true)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run src/store/store.test.ts
```
Expected: FAIL on the new tests.

**Step 3: Update `src/store/index.ts`**

Add to the `HUDStore` interface:
```ts
globalLayers: Set<GlobalLayer>
toggleGlobalLayer: (layer: GlobalLayer) => void
```

Add `GlobalLayer` to the import at the top:
```ts
import type { ViewMode, PanelState, Entity, GlobalLayer } from '../types'
```

Add to `create<HUDStore>((set) => ({`:
```ts
globalLayers: new Set<GlobalLayer>(['conflict', 'disaster', 'military']),
toggleGlobalLayer: (layer) =>
  set((state) => {
    const next = new Set(state.globalLayers)
    if (next.has(layer)) next.delete(layer)
    else next.add(layer)
    return { globalLayers: next }
  }),
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/store/store.test.ts
```
Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/store/index.ts src/store/store.test.ts
git commit -m "feat: add globalLayers Set and toggleGlobalLayer to HUD store"
```

---

### Task 13: Data Fetching Hooks

**Files:**
- Create: `src/hooks/useGlobalData.ts`
- Create: `src/hooks/useFlights.ts`
- Create: `src/hooks/useGlobalData.test.ts`

**Step 1: Write the failing test**

```ts
// src/hooks/useGlobalData.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGlobalData } from './useGlobalData'
import type { GlobalIncident } from '../types'

const incident: GlobalIncident = {
  id: 'usgs:1', lat: 35, lng: 139, country: 'Japan', type: 'Earthquake',
  severity: 'high', timestamp: new Date().toISOString(), summary: 'Test', source: 'usgs',
}

describe('useGlobalData', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('fetches data on mount and sets loading false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [incident] }))

    const { result } = renderHook(() => useGlobalData())
    expect(result.current.loading).toBe(true)

    await act(async () => { await Promise.resolve() })
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0].id).toBe('usgs:1')
  })

  it('keeps previous data on fetch failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [incident] })
      .mockRejectedValueOnce(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useGlobalData())
    await act(async () => { await Promise.resolve() })
    expect(result.current.data).toHaveLength(1)

    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve() })
    // Data preserved despite failure
    expect(result.current.data).toHaveLength(1)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run src/hooks/useGlobalData.test.ts
```

**Step 3: Create `src/hooks/useGlobalData.ts`**

```ts
// src/hooks/useGlobalData.ts
import { useState, useEffect } from 'react'
import type { GlobalIncident } from '../types'

export function useGlobalData() {
  const [data, setData] = useState<GlobalIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/incidents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e) {
      console.error('[useGlobalData]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [])

  return { data, loading, lastUpdated }
}
```

**Step 4: Create `src/hooks/useFlights.ts`** (no separate test — identical pattern)

```ts
// src/hooks/useFlights.ts
import { useState, useEffect } from 'react'
import type { MilitaryFlight } from '../types'

export function useFlights() {
  const [data, setData] = useState<MilitaryFlight[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/flights')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e) {
      console.error('[useFlights]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [])

  return { data, loading, lastUpdated }
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/hooks/useGlobalData.test.ts
```
Expected: all 2 tests PASS.

**Step 6: Commit**

```bash
git add src/hooks/useGlobalData.ts src/hooks/useFlights.ts src/hooks/useGlobalData.test.ts
git commit -m "feat: add useGlobalData and useFlights polling hooks"
```

---

### Task 14: Update GlobalMarkers — Live Data + Flight Layer

**Files:**
- Modify: `src/views/global/GlobalMarkers.tsx`

**Step 1: Replace the file contents**

```tsx
// src/views/global/GlobalMarkers.tsx
import { Marker } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { useGlobalData } from '../../hooks/useGlobalData'
import { useFlights } from '../../hooks/useFlights'
import type { GlobalIncident, MilitaryFlight, GlobalLayer, Severity } from '../../types'

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#ff2d2d',
  high:     '#ffaa00',
  medium:   '#00d4ff',
  low:      '#4a6080',
  nominal:  '#00ff88',
}

const DISASTER_TYPES = new Set([
  'Earthquake', 'Flood', 'Wildfire', 'Volcano',
  'Severe Storm', 'Landslide', 'Drought',
])

function incidentToLayer(incident: GlobalIncident): GlobalLayer {
  if (incident.source === 'usgs' || incident.source === 'gdacs' || incident.source === 'eonet') return 'disaster'
  if (DISASTER_TYPES.has(incident.type)) return 'disaster'
  return 'conflict'
}

function PulseMarker({ incident }: { incident: GlobalIncident }) {
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const color = SEVERITY_COLORS[incident.severity]

  return (
    <Marker longitude={incident.lng} latitude={incident.lat} anchor="center">
      <button
        onClick={() => {
          setSelectedEntity({ type: 'incident', data: incident })
          setPanelVisible('entity', true)
        }}
        className="relative flex items-center justify-center w-8 h-8"
        title={`${incident.type} — ${incident.country}`}
      >
        <span className="absolute w-8 h-8 rounded-full animate-ping opacity-40"
          style={{ backgroundColor: color }} />
        <span className="relative w-3 h-3 rounded-full border-2"
          style={{ backgroundColor: `${color}33`, borderColor: color, boxShadow: `0 0 6px ${color}` }} />
      </button>
    </Marker>
  )
}

function FlightMarker({ flight }: { flight: MilitaryFlight }) {
  return (
    <Marker longitude={flight.lng} latitude={flight.lat} anchor="center">
      <div
        style={{ transform: `rotate(${flight.heading}deg)` }}
        title={`${flight.callsign} — ${flight.country}`}
        className="w-4 h-4 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L10 11L6 8L2 11L6 1Z" fill="#00d4ff" />
        </svg>
      </div>
    </Marker>
  )
}

export function GlobalMarkers() {
  const globalLayers = useHUDStore((s) => s.globalLayers)
  const { data: incidents } = useGlobalData()
  const { data: flights } = useFlights()

  const visibleIncidents = incidents.filter((i) => globalLayers.has(incidentToLayer(i)))
  const showFlights = globalLayers.has('military')

  return (
    <>
      {visibleIncidents.map((incident) => (
        <PulseMarker key={incident.id} incident={incident} />
      ))}
      {showFlights && flights.map((flight) => (
        <FlightMarker key={flight.id} flight={flight} />
      ))}
    </>
  )
}
```

**Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/views/global/GlobalMarkers.tsx
git commit -m "feat: wire GlobalMarkers to live data hooks with layer filtering and flight markers"
```

---

### Task 15: Update EventFeedPanel — Source Badges + Live Count

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx`

**Step 1: Update the global view branch inside `EventFeedPanel`**

In the section that maps `globalIncidents` (the global view case), replace the hardcoded import with hooks and add source badges. Only the global view branch changes — city/cyber/space are untouched.

At the top of the file, replace:
```ts
import { globalIncidents } from '../../../data/global-incidents'
```
with:
```ts
import { useGlobalData } from '../../../hooks/useGlobalData'
import { useFlights } from '../../../hooks/useFlights'
import type { GlobalLayer } from '../../../types'
```

Inside the `EventFeedPanel` component, add the hooks after existing hook calls:
```ts
const globalLayers = useHUDStore((s) => s.globalLayers)
const { data: liveIncidents, loading: incidentsLoading } = useGlobalData()
const { data: liveFlights } = useFlights()
```

Replace the `activeView === 'global'` items branch:
```ts
activeView === 'global'
  ? [
      ...liveIncidents
        .filter((i) => {
          const layer: GlobalLayer =
            i.source === 'usgs' || i.source === 'gdacs' || i.source === 'eonet'
              ? 'disaster' : 'conflict'
          return globalLayers.has(layer)
        })
        .map(i => ({
          id: i.id,
          label: i.country,
          sublabel: i.type,
          severity: i.severity,
          time: i.timestamp.slice(11, 16),
          source: i.source.toUpperCase(),
          onClick: () => setSelectedEntity({ type: 'incident', data: i }),
        })),
      ...(globalLayers.has('military')
        ? liveFlights.map(f => ({
            id: f.id,
            label: f.callsign,
            sublabel: f.country,
            severity: 'medium' as const,
            time: `${Math.round(f.altitude / 1000)}km`,
            source: 'SKY',
            onClick: () => {},
          }))
        : []),
    ]
```

Update the `PanelHeader` call for global view to show live count:
```tsx
<PanelHeader
  title={activeView === 'global'
    ? `LIVE EVENT FEED · ${items.length}`
    : activeView === 'space' ? 'TRACKED OBJECTS' : 'LIVE EVENT FEED'}
/>
```

Update each feed item row to show the `source` badge before the label:
```tsx
{item.source && (
  <span className="font-mono text-[9px] text-hud-dim/50 mr-1">[{item.source}]</span>
)}
```

Add `source?: string` to the items mapping type (TypeScript will require this).

**Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/panels/EventFeedPanel/index.tsx
git commit -m "feat: wire EventFeedPanel to live data with source badges and live count"
```

---

### Task 16: LayerToggles Component

**Files:**
- Create: `src/views/global/LayerToggles.tsx`
- Modify: `src/App.tsx`

**Step 1: Create `src/views/global/LayerToggles.tsx`**

```tsx
// src/views/global/LayerToggles.tsx
import { useHUDStore } from '../../store'
import type { GlobalLayer } from '../../types'

const LAYERS: { key: GlobalLayer; label: string; color: string }[] = [
  { key: 'conflict', label: 'CONFLICT', color: '#ff2d2d' },
  { key: 'disaster', label: 'DISASTER', color: '#ffaa00' },
  { key: 'military', label: 'MILITARY', color: '#00d4ff' },
]

export function LayerToggles() {
  const globalLayers = useHUDStore((s) => s.globalLayers)
  const toggleGlobalLayer = useHUDStore((s) => s.toggleGlobalLayer)

  return (
    <div className="fixed bottom-16 right-4 z-40 flex gap-2">
      {LAYERS.map(({ key, label, color }) => {
        const active = globalLayers.has(key)
        return (
          <button
            key={key}
            onClick={() => toggleGlobalLayer(key)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[10px] tracking-widest border transition-all"
            style={{
              borderColor: active ? color : '#4a6080',
              color:       active ? color : '#4a6080',
              backgroundColor: active ? `${color}15` : 'transparent',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ backgroundColor: active ? color : '#4a6080' }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

**Step 2: Add `LayerToggles` to `App.tsx`**

In `src/App.tsx`, import `LayerToggles` and the active view check. Find the section that renders view-specific overlays and add:

```tsx
import { LayerToggles } from './views/global/LayerToggles'

// Inside JSX, after the map canvas and other panels:
{activeView === 'global' && <LayerToggles />}
```

Use `const activeView = useHUDStore((s) => s.activeView)` if not already present in App.tsx.

**Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/views/global/LayerToggles.tsx src/App.tsx
git commit -m "feat: add LayerToggles pill buttons for conflict/disaster/military filtering"
```

---

### Task 17: Add Environment Variable Documentation

**Files:**
- Create: `.env.example` (if it doesn't exist)

**Step 1: Create `.env.example`**

```bash
# GothamHUD — environment variables
# Copy to .env.local and fill in the keys you need.
# All keys are server-side only (Hono server). The browser never sees them.

# ─── Conflict & Unrest ────────────────────────────────────────────
# ACLED (Armed Conflict Location & Event Data)
# Free for researchers: https://developer.acleddata.com/
ACLED_API_KEY=
ACLED_EMAIL=

# ─── Military Flights ─────────────────────────────────────────────
# OpenSky Network — free account required
# Register at: https://opensky-network.org/index.php?option=com_users&view=registration
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=

# ─── Notes ────────────────────────────────────────────────────────
# USGS, GDACS, and NASA EONET require no keys — disasters will always load.
# ACLED and OpenSky keys are optional — those layers simply won't appear without them.
```

**Step 2: Add `.env.local` to `.gitignore` if not already present**

```bash
grep -q '.env.local' .gitignore || echo '.env.local' >> .gitignore
```

**Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "docs: add .env.example for ACLED and OpenSky credentials"
```

---

### Task 18: Cleanup — Remove Mock Data

**Files:**
- Delete: `src/data/global-incidents.ts`

**Step 1: Verify nothing imports the mock data file anymore**

```bash
grep -r "global-incidents" src/
```
Expected: zero results (we updated all consumers in Tasks 14 and 15).

**Step 2: Delete the file**

```bash
rm src/data/global-incidents.ts
```

**Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove hardcoded mock incident data — global view is now fully live"
```

---

## Verification Checklist

After all tasks are complete, manually verify:

1. `npm run dev` starts both Vite and the Hono server without errors
2. `curl http://localhost:3001/api/incidents` returns real earthquake/disaster data
3. Global view map shows pulse markers for actual events
4. LayerToggles buttons appear bottom-right in global view only
5. Toggling a layer removes its markers from the map and items from the feed
6. EventFeedPanel header shows `LIVE EVENT FEED · N` with a real count
7. Each feed item has a source badge (`[USGS]`, `[GDACS]`, `[EONET]`)
8. Switching to City/Cyber/Space views hides the LayerToggles
9. `npx vitest run` — all tests pass
