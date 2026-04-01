# Maritime IUU/EEZ Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Maritime page that cross-references live AIS vessel data against an IUU vessel list in SQLite, renders EEZ boundaries from marineregions.org, and alerts when an IUU vessel enters an EEZ.

**Architecture:** Server-side: parse IUU XLS into SQLite + in-memory hash maps, cache EEZ GeoJSON from WFS endpoint, hybrid matching (O(1) identity check per AIS message + 30s point-in-polygon sweep). Client-side: new Maritime view with EEZ polygon layer, IUU vessel markers, alert feed panel, and entity detail.

**Tech Stack:** better-sqlite3, xlsx (new dep), Hono API routes, Mapbox GL (react-map-gl), Zustand, Framer Motion

---

## File Structure

### New Files (Server)
- `server/iuuDb.ts` — Parse XLS, SQLite table, in-memory MMSI/IMO hash maps
- `server/eezCache.ts` — Fetch/cache EEZ GeoJSON from marineregions.org WFS, point-in-polygon
- `server/iuuMatcher.ts` — Real-time AIS tagging + 30s EEZ sweep, alert store

### New Files (Frontend)
- `src/views/maritime/MaritimeLayer.tsx` — Map layers: EEZ polygons, vessel dots, IUU markers
- `src/views/maritime/MaritimeFeedPanel.tsx` — Left panel: IUU alerts + vessel feed
- `src/views/maritime/IUUVesselDetail.tsx` — Entity panel detail for IUU vessels
- `src/hooks/useEEZ.ts` — Fetch and cache EEZ FeatureCollection
- `src/hooks/useIUUAlerts.ts` — Poll IUU alerts
- `src/hooks/useIUUVessels.ts` — Poll IUU-matched vessels

### Modified Files
- `server/index.ts` — Add 4 maritime API routes + start IUU matcher
- `server/ais.ts` — Hook IUU identity check into message handler
- `server/aisCache.ts` — Export `getVesselByMmsi()` helper
- `src/types/index.ts` — Add IUURecord, IUUMatch, IUUAlert types; add `'maritime'` to ViewMode and Entity
- `src/App.tsx` — Mount MaritimeFeedPanel
- `src/components/MapCanvas/index.tsx` — Add MaritimeLayer + VIEW_CONFIGS entry
- `src/components/panels/EntityPanel/index.tsx` — Add IUUVesselDetail rendering
- `src/components/panels/EventFeedPanel/index.tsx` — Hide on maritime view
- `src/hooks/useKeyboardShortcuts.ts` — Add key `5` = maritime
- `src/components/CommandSwitcher/index.tsx` — Add maritime to VIEWS array

---

### Task 1: Install xlsx dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install xlsx**

Run: `npm install xlsx`

- [ ] **Step 2: Verify installation**

Run: `node -e "require('xlsx'); console.log('xlsx OK')"`
Expected: `xlsx OK`

- [ ] **Step 3: Commit**

Stage `package.json` and `package-lock.json`, commit with message: `chore: add xlsx dependency for IUU list parsing`

---

### Task 2: Add types for Maritime view

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `'maritime'` to ViewMode**

In `src/types/index.ts`, change line 4:

```typescript
// Before:
export type ViewMode = 'global' | 'city' | 'cyber' | 'space'

// After:
export type ViewMode = 'global' | 'city' | 'cyber' | 'space' | 'maritime'
```

- [ ] **Step 2: Add IUU types after the AISVessel interface (after line 72)**

```typescript
export type IUUConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface IUURecord {
  mmsi: number
  imo: number
  name: string
  callSign: string
  flag: string
  listedDate: string
  listingAuthority: string
  reason: string
}

export interface IUUMatch {
  confidence: IUUConfidence
  record: IUURecord
  matchedFields: string[]  // e.g. ['mmsi', 'imo'] or ['name', 'callSign']
}

export interface IUUAlert {
  id: string
  vessel: AISVessel
  match: IUUMatch
  eezName: string
  eezMrgid: number
  timestamp: number
}
```

- [ ] **Step 3: Add `'iuuVessel'` to Entity type union**

In `src/types/index.ts`, update the Entity interface (line 423-426):

```typescript
export interface Entity {
  type: 'incident' | 'node' | 'satellite' | 'vessel' | 'drone' | 'news' | 'cyberNews' | 'newsCluster' | 'actorProfile' | 'edgeDetail' | 'cyberCluster' | 'traffic' | 'weatherAlert' | 'crime' | 'aircraft' | 'powerOutage' | 'iuuVessel'
  data: GlobalIncident | CyberNode | Satellite | AISVessel | DroneFlight | NewsArticle | CyberNewsArticle | NewsArticle[] | ActorProfile | CyberNewsArticle[] | CyberClusterData | TrafficIncident | WeatherAlert | CrimeIncident | LowAltAircraft | PowerOutage | IUUAlert
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 5: Commit**

Stage `src/types/index.ts`, commit with message: `feat: add Maritime view mode and IUU types`

---

### Task 3: Build IUU SQLite database

**Files:**
- Create: `server/iuuDb.ts`

- [ ] **Step 1: Create `server/iuuDb.ts`**

```typescript
// server/iuuDb.ts — IUU vessel list stored in SQLite with in-memory hash maps
import Database from 'better-sqlite3'
import path from 'path'
import * as XLSX from 'xlsx'
import type { IUURecord } from '../src/types'

const dbPath = path.join(process.cwd(), 'data', 'iuu-vessels.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS iuu_vessels (
    mmsi              INTEGER,
    imo               INTEGER,
    name              TEXT    NOT NULL,
    call_sign         TEXT,
    flag              TEXT,
    listed_date       TEXT,
    listing_authority TEXT,
    reason            TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_iuu_mmsi ON iuu_vessels(mmsi);
  CREATE INDEX IF NOT EXISTS idx_iuu_imo  ON iuu_vessels(imo);
  CREATE INDEX IF NOT EXISTS idx_iuu_name ON iuu_vessels(name);
`)

console.log(`[iuuDb] opened ${dbPath}`)

// In-memory hash maps for O(1) lookups
const byMmsi = new Map<number, IUURecord>()
const byImo = new Map<number, IUURecord>()
const byName = new Map<string, IUURecord>()
const byCallSign = new Map<string, IUURecord>()

function toRecord(row: any): IUURecord {
  return {
    mmsi: row.mmsi ?? row.MMSI ?? 0,
    imo: row.imo ?? row.IMO ?? 0,
    name: String(row.name ?? row.Name ?? row['Vessel Name'] ?? '').trim(),
    callSign: String(row.call_sign ?? row.callSign ?? row['Call Sign'] ?? '').trim(),
    flag: String(row.flag ?? row.Flag ?? '').trim(),
    listedDate: String(row.listed_date ?? row.listedDate ?? row['Listed Date'] ?? '').trim(),
    listingAuthority: String(row.listing_authority ?? row.listingAuthority ?? row['Listed by'] ?? '').trim(),
    reason: String(row.reason ?? row.Reason ?? '').trim(),
  }
}

function indexRecord(rec: IUURecord): void {
  if (rec.mmsi > 0) byMmsi.set(rec.mmsi, rec)
  if (rec.imo > 0) byImo.set(rec.imo, rec)
  if (rec.name) byName.set(rec.name.toLowerCase(), rec)
  if (rec.callSign) byCallSign.set(rec.callSign.toLowerCase(), rec)
}

const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM iuu_vessels')
const selectAll = db.prepare('SELECT * FROM iuu_vessels')
const insertStmt = db.prepare(`
  INSERT INTO iuu_vessels (mmsi, imo, name, call_sign, flag, listed_date, listing_authority, reason)
  VALUES (@mmsi, @imo, @name, @callSign, @flag, @listedDate, @listingAuthority, @reason)
`)
const insertMany = db.transaction((records: IUURecord[]) => {
  for (const r of records) insertStmt.run(r)
})

export function importFromXls(xlsPath: string): number {
  const workbook = XLSX.readFile(xlsPath)
  const sheetName = workbook.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[]

  const records = rows.map(toRecord).filter(r => r.name.length > 0)

  // Clear and re-import
  db.exec('DELETE FROM iuu_vessels')
  insertMany(records)

  // Build indexes
  byMmsi.clear(); byImo.clear(); byName.clear(); byCallSign.clear()
  for (const r of records) indexRecord(r)

  console.log(`[iuuDb] imported ${records.length} IUU vessels from XLS`)
  return records.length
}

export function loadFromDb(): number {
  const rows = selectAll.all() as any[]
  byMmsi.clear(); byImo.clear(); byName.clear(); byCallSign.clear()
  for (const row of rows) {
    const rec = toRecord(row)
    indexRecord(rec)
  }
  console.log(`[iuuDb] loaded ${rows.length} IUU vessels from SQLite`)
  return rows.length
}

export function initIUU(xlsPath: string): void {
  const { cnt } = countStmt.get() as { cnt: number }
  if (cnt === 0) {
    importFromXls(xlsPath)
  } else {
    loadFromDb()
  }
}

export function lookupByMmsi(mmsi: number): IUURecord | undefined {
  return byMmsi.get(mmsi)
}

export function lookupByImo(imo: number): IUURecord | undefined {
  return byImo.get(imo)
}

export function lookupByName(name: string): IUURecord | undefined {
  return byName.get(name.toLowerCase())
}

export function lookupByCallSign(callSign: string): IUURecord | undefined {
  return byCallSign.get(callSign.toLowerCase())
}

export function getAllIUURecords(): IUURecord[] {
  return selectAll.all().map(toRecord)
}
```

- [ ] **Step 2: Create `data/` directory if it doesn't exist**

Run: `mkdir -p data`

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

Stage `server/iuuDb.ts`, commit with message: `feat: IUU vessel SQLite database with XLS import and hash map lookups`

---

### Task 4: Build EEZ cache

**Files:**
- Create: `server/eezCache.ts`

- [ ] **Step 1: Create `server/eezCache.ts`**

```typescript
// server/eezCache.ts — Fetch and cache EEZ GeoJSON polygons from marineregions.org
import fs from 'fs'
import path from 'path'

const CACHE_PATH = path.join(process.cwd(), 'data', 'eez-cache.json')
const GAZETTEER_URL = 'https://www.marineregions.org/rest/getGazetteerRecordsByType.json/EEZ/'
const WFS_BASE = 'https://geo.vliz.be/geoserver/MarineRegions/ows'
const PAGE_SIZE = 50

interface EEZRecord {
  MRGID: number
  preferredGazetteerName: string
  latitude: number | null
  longitude: number | null
  minLatitude: number | null
  minLongitude: number | null
  maxLatitude: number | null
  maxLongitude: number | null
  status: string
}

let featureCollection: GeoJSON.FeatureCollection | null = null

// --- Point-in-polygon (ray casting) ---

function pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInMultiPolygon(lat: number, lng: number, geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, geometry.coordinates[0])
  }
  for (const polygon of geometry.coordinates) {
    if (pointInPolygon(lat, lng, polygon[0])) return true
  }
  return false
}

export interface EEZHit {
  name: string
  mrgid: number
}

export function findEEZsContainingPoint(lat: number, lng: number): EEZHit[] {
  if (!featureCollection) return []
  const hits: EEZHit[] = []
  for (const feature of featureCollection.features) {
    const geom = feature.geometry as GeoJSON.MultiPolygon | GeoJSON.Polygon
    if (pointInMultiPolygon(lat, lng, geom)) {
      hits.push({
        name: (feature.properties?.geoname ?? feature.properties?.preferredGazetteerName ?? 'Unknown EEZ') as string,
        mrgid: (feature.properties?.mrgid ?? 0) as number,
      })
    }
  }
  return hits
}

export function getEEZFeatureCollection(): GeoJSON.FeatureCollection {
  return featureCollection ?? { type: 'FeatureCollection', features: [] }
}

// --- Fetch all EEZ records from gazetteer ---

async function fetchEEZRecords(): Promise<EEZRecord[]> {
  const all: EEZRecord[] = []
  let offset = 0
  while (true) {
    const url = `${GAZETTEER_URL}?offset=${offset}&count=${PAGE_SIZE}`
    console.log(`[eezCache] fetching records offset=${offset}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Gazetteer API ${res.status}`)
    const page = await res.json() as EEZRecord[]
    if (page.length === 0) break
    all.push(...page.filter(r => r.status === 'standard'))
    offset += PAGE_SIZE
    // Be polite to the API
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[eezCache] fetched ${all.length} EEZ records`)
  return all
}

// --- Fetch GeoJSON polygon for a single MRGID ---

async function fetchEEZGeometry(mrgid: number): Promise<GeoJSON.Feature | null> {
  const url = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature` +
    `&typeName=MarineRegions:eez&outputFormat=application/json` +
    `&CQL_FILTER=mrgid=${mrgid}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const fc = await res.json() as GeoJSON.FeatureCollection
    return fc.features[0] ?? null
  } catch {
    return null
  }
}

// --- Build and cache the full FeatureCollection ---

async function buildCache(): Promise<GeoJSON.FeatureCollection> {
  const records = await fetchEEZRecords()
  const features: GeoJSON.Feature[] = []

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    console.log(`[eezCache] fetching geometry ${i + 1}/${records.length}: ${rec.preferredGazetteerName}`)
    const feature = await fetchEEZGeometry(rec.MRGID)
    if (feature) {
      feature.properties = {
        ...feature.properties,
        mrgid: rec.MRGID,
        geoname: rec.preferredGazetteerName,
      }
      features.push(feature)
    }
    // Rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1000))
  }

  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
  console.log(`[eezCache] built ${features.length} EEZ polygons`)
  return fc
}

export async function initEEZ(): Promise<void> {
  // Try loading from disk cache first
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_PATH, 'utf-8')
      featureCollection = JSON.parse(raw) as GeoJSON.FeatureCollection
      console.log(`[eezCache] loaded ${featureCollection.features.length} EEZs from cache`)
      return
    } catch (e) {
      console.warn('[eezCache] cache file corrupt, rebuilding...')
    }
  }

  // Fetch from API and save to disk
  featureCollection = await buildCache()
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(featureCollection))
  console.log(`[eezCache] saved cache to ${CACHE_PATH}`)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

Stage `server/eezCache.ts`, commit with message: `feat: EEZ boundary cache with marineregions.org WFS fetch and point-in-polygon`

---

### Task 5: Build IUU matcher

**Files:**
- Create: `server/iuuMatcher.ts`
- Modify: `server/aisCache.ts` — export `getVesselByMmsi`

- [ ] **Step 1: Add `getVesselByMmsi` export to `server/aisCache.ts`**

Add after the `getAllVessels` function:

```typescript
export function getVesselByMmsi(mmsi: number): AISVessel | undefined {
  return vesselCache.get(mmsi)
}
```

- [ ] **Step 2: Create `server/iuuMatcher.ts`**

```typescript
// server/iuuMatcher.ts — Hybrid IUU matching: real-time identity + periodic EEZ sweep
import { lookupByMmsi, lookupByImo, lookupByName, lookupByCallSign } from './iuuDb'
import { findEEZsContainingPoint } from './eezCache'
import { getVesselByMmsi } from './aisCache'
import type { AISVessel, IUUMatch, IUUAlert, IUUConfidence } from '../src/types'

const MAX_ALERTS = 200
const SWEEP_INTERVAL_MS = 30_000

// Vessels currently flagged as IUU matches (mmsi -> match info)
const flaggedVessels = new Map<number, IUUMatch>()

// Recent IUU-in-EEZ alerts
const alertStore: IUUAlert[] = []

let alertIdCounter = 0

// --- Real-time identity check (called on every AIS message) ---

export function checkVesselIdentity(
  mmsi: number, imo: number, name: string, callSign: string,
): IUUMatch | null {
  const matchedFields: string[] = []
  let confidence: IUUConfidence = 'LOW'
  let record = lookupByMmsi(mmsi)

  if (record) matchedFields.push('mmsi')

  const imoRec = imo > 0 ? lookupByImo(imo) : undefined
  if (imoRec) {
    record = record ?? imoRec
    matchedFields.push('imo')
  }

  const nameRec = name ? lookupByName(name) : undefined
  if (nameRec) {
    record = record ?? nameRec
    matchedFields.push('name')
  }

  const csRec = callSign ? lookupByCallSign(callSign) : undefined
  if (csRec) {
    record = record ?? csRec
    matchedFields.push('callSign')
  }

  if (!record || matchedFields.length === 0) return null

  // Determine confidence tier
  if (matchedFields.includes('mmsi') && matchedFields.includes('imo')) {
    confidence = 'HIGH'
  } else if (matchedFields.includes('name') && matchedFields.includes('callSign')) {
    confidence = 'MEDIUM'
  } else if (matchedFields.length >= 2) {
    confidence = 'MEDIUM'
  } else {
    confidence = 'LOW'
  }

  const match: IUUMatch = { confidence, record, matchedFields }
  flaggedVessels.set(mmsi, match)
  return match
}

// --- Periodic EEZ sweep (every 30s) ---

function sweepEEZ(): void {
  const now = Date.now()

  for (const [mmsi, match] of flaggedVessels) {
    const vessel = getVesselByMmsi(mmsi)
    if (!vessel) continue

    const eezHits = findEEZsContainingPoint(vessel.lat, vessel.lng)
    if (eezHits.length === 0) continue

    for (const eez of eezHits) {
      // Deduplicate: don't re-alert for same vessel+EEZ within 30 minutes
      const isDuplicate = alertStore.some(a =>
        a.vessel.mmsi === mmsi &&
        a.eezMrgid === eez.mrgid &&
        now - a.timestamp < 30 * 60 * 1000,
      )
      if (isDuplicate) continue

      const alert: IUUAlert = {
        id: `iuu-${++alertIdCounter}`,
        vessel: { ...vessel },
        match,
        eezName: eez.name,
        eezMrgid: eez.mrgid,
        timestamp: now,
      }
      alertStore.unshift(alert)
      console.log(`[iuuMatcher] ALERT: ${vessel.name} (MMSI ${mmsi}) in ${eez.name} [${match.confidence}]`)
    }
  }

  // Cap alert history
  while (alertStore.length > MAX_ALERTS) alertStore.pop()
}

// --- Exports ---

export function getIUUAlerts(): IUUAlert[] {
  return alertStore
}

export function getFlaggedVessels(): { vessel: AISVessel; match: IUUMatch }[] {
  const results: { vessel: AISVessel; match: IUUMatch }[] = []
  for (const [mmsi, match] of flaggedVessels) {
    const vessel = getVesselByMmsi(mmsi)
    if (vessel) results.push({ vessel, match })
  }
  return results
}

let sweepTimer: ReturnType<typeof setInterval> | undefined

export function startIUUMatcher(): void {
  sweepTimer = setInterval(sweepEEZ, SWEEP_INTERVAL_MS)
  console.log('[iuuMatcher] started (30s EEZ sweep)')
}

export function stopIUUMatcher(): void {
  if (sweepTimer) clearInterval(sweepTimer)
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

Stage `server/iuuMatcher.ts server/aisCache.ts`, commit with message: `feat: IUU matcher with real-time identity check and periodic EEZ sweep`

---

### Task 6: Wire server — API routes, AIS hook, startup

**Files:**
- Modify: `server/index.ts`
- Modify: `server/ais.ts`

- [ ] **Step 1: Add imports to `server/index.ts`**

Add near the top imports:

```typescript
import path from 'path'
import { initIUU } from './iuuDb'
import { initEEZ, getEEZFeatureCollection } from './eezCache'
import { getIUUAlerts, getFlaggedVessels, startIUUMatcher } from './iuuMatcher'
```

- [ ] **Step 2: Add API routes to `server/index.ts`**

Add after the existing `/api/vessels/*` routes:

```typescript
// Maritime / IUU
app.get('/api/maritime/eez', (c) => c.json(getEEZFeatureCollection()))
app.get('/api/maritime/iuu/alerts', (c) => c.json(getIUUAlerts()))
app.get('/api/maritime/iuu/vessels', (c) => c.json(getFlaggedVessels()))
app.get('/api/maritime/vessels', (c) => c.json(getAllVessels()))
```

Make sure `getAllVessels` is already imported from `./aisCache`.

- [ ] **Step 3: Add startup calls to `server/index.ts`**

Add in the startup section (after the existing poller starts):

```typescript
// IUU / Maritime
initIUU(path.join(process.cwd(), 'IUUList-20260401.xls'))
initEEZ().catch((e) => console.error('[eezCache] init failed:', e))
startIUUMatcher()
```

- [ ] **Step 4: Hook identity check into `server/ais.ts`**

Add import at top of `server/ais.ts`:

```typescript
import { checkVesselIdentity } from './iuuMatcher'
```

Add after the `processVesselMessage(...)` call (around line 83):

```typescript
    // IUU identity check (O(1) hash lookup)
    checkVesselIdentity(mmsi, imo ?? 0, name, callSign ?? '')
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 6: Commit**

Stage `server/index.ts server/ais.ts`, commit with message: `feat: wire IUU/EEZ server — API routes, AIS hook, startup init`

---

### Task 7: Add Maritime to navigation (ViewMode, shortcuts, switcher)

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/components/CommandSwitcher/index.tsx`
- Modify: `src/components/MapCanvas/index.tsx`

- [ ] **Step 1: Add key `5` to keyboard shortcuts**

In `src/hooks/useKeyboardShortcuts.ts`, add after the `case '4':` line:

```typescript
        case '5': setActiveView('maritime'); break
```

- [ ] **Step 2: Add maritime to CommandSwitcher VIEWS array**

In `src/components/CommandSwitcher/index.tsx`, add to the VIEWS array:

```typescript
  { id: 'maritime', label: 'MARITIME', key: '5' },
```

- [ ] **Step 3: Add maritime to MapCanvas**

In `src/components/MapCanvas/index.tsx`, add to VIEW_CONFIGS:

```typescript
  maritime: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 2.5 },
  },
```

Add after the existing view conditionals (around line 295):

```typescript
        {activeView === 'maritime' && <MaritimeLayer />}
```

Add import at top:

```typescript
import { MaritimeLayer } from '../../views/maritime/MaritimeLayer'
```

- [ ] **Step 4: Commit**

Stage the three files, commit with message: `feat: add Maritime to navigation — key 5, CommandSwitcher, MapCanvas`

Note: This will have a TypeScript error until MaritimeLayer is created in Task 9. That is expected.

---

### Task 8: Create frontend hooks

**Files:**
- Create: `src/hooks/useEEZ.ts`
- Create: `src/hooks/useIUUAlerts.ts`
- Create: `src/hooks/useIUUVessels.ts`

- [ ] **Step 1: Create `src/hooks/useEEZ.ts`**

```typescript
// src/hooks/useEEZ.ts
import { useState, useEffect } from 'react'

export function useEEZ(enabled: boolean) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)

    fetch('/api/maritime/eez')
      .then(res => res.ok ? res.json() : null)
      .then(fc => { if (!cancelled && fc) setData(fc) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [enabled])

  return { eezData: enabled ? data : null, eezLoading: loading }
}
```

- [ ] **Step 2: Create `src/hooks/useIUUAlerts.ts`**

```typescript
// src/hooks/useIUUAlerts.ts
import { useState, useEffect } from 'react'
import type { IUUAlert } from '../types'

export function useIUUAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<IUUAlert[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const poll = () => {
      fetch('/api/maritime/iuu/alerts')
        .then(res => res.ok ? res.json() : [])
        .then(data => { if (!cancelled) setAlerts(data) })
        .catch(() => {})
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return { alerts: enabled ? alerts : [] }
}
```

- [ ] **Step 3: Create `src/hooks/useIUUVessels.ts`**

```typescript
// src/hooks/useIUUVessels.ts
import { useState, useEffect } from 'react'
import type { AISVessel, IUUMatch } from '../types'

export interface FlaggedVessel {
  vessel: AISVessel
  match: IUUMatch
}

export function useIUUVessels(enabled: boolean) {
  const [vessels, setVessels] = useState<FlaggedVessel[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const poll = () => {
      fetch('/api/maritime/iuu/vessels')
        .then(res => res.ok ? res.json() : [])
        .then(data => { if (!cancelled) setVessels(data) })
        .catch(() => {})
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return { flaggedVessels: enabled ? vessels : [] }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 5: Commit**

Stage the three hook files, commit with message: `feat: frontend hooks for EEZ data, IUU alerts, and IUU vessels`

---

### Task 9: Build MaritimeLayer map component

**Files:**
- Create: `src/views/maritime/MaritimeLayer.tsx`

- [ ] **Step 1: Create `src/views/maritime/MaritimeLayer.tsx`**

```typescript
// src/views/maritime/MaritimeLayer.tsx
import { useEffect, useCallback } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { FillLayerSpecification, LineLayerSpecification, MapMouseEvent } from 'mapbox-gl'
import { useHUDStore } from '../../store'
import { useEEZ } from '../../hooks/useEEZ'
import { useIUUAlerts } from '../../hooks/useIUUAlerts'
import { useIUUVessels } from '../../hooks/useIUUVessels'
import type { AISVessel, IUUConfidence } from '../../types'

const EEZ_FILL: FillLayerSpecification = {
  id: 'eez-fill',
  type: 'fill',
  source: 'eez',
  paint: { 'fill-color': '#00d4ff', 'fill-opacity': 0.05 },
}

const EEZ_LINE: LineLayerSpecification = {
  id: 'eez-line',
  type: 'line',
  source: 'eez',
  paint: {
    'line-color': '#00d4ff',
    'line-width': 1,
    'line-opacity': 0.3,
    'line-dasharray': [4, 4],
  },
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const CONFIDENCE_STYLES: Record<IUUConfidence, { size: string; color: string; glow: string }> = {
  HIGH:   { size: 'w-4 h-4', color: '#ff2d2d', glow: '0 0 12px #ff2d2d' },
  MEDIUM: { size: 'w-3.5 h-3.5', color: '#ffaa00', glow: '0 0 8px #ffaa00' },
  LOW:    { size: 'w-3 h-3', color: '#ff8800', glow: '0 0 6px #ff8800' },
}

export function MaritimeLayer() {
  const { current: map } = useMap()
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const { eezData } = useEEZ(true)
  const { alerts } = useIUUAlerts(true)
  const { flaggedVessels } = useIUUVessels(true)

  const eezGeoJSON = eezData ?? EMPTY_FC

  // Clear selection on empty click
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const hits = map.queryRenderedFeatures(e.point, { layers: ['eez-fill'] })
    // Only clear if nothing interactive was hit (markers handle their own clicks)
    if (hits.length === 0) {
      setSelectedEntity(null)
      setPanelVisible('entity', false)
    }
  }, [map, setSelectedEntity, setPanelVisible])

  useEffect(() => {
    if (!map) return
    map.on('click', handleMapClick)
    return () => { map.off('click', handleMapClick) }
  }, [map, handleMapClick])

  return (
    <>
      {/* EEZ boundaries */}
      <Source id="eez" type="geojson" data={eezGeoJSON}>
        <Layer {...EEZ_FILL} />
        <Layer {...EEZ_LINE} />
      </Source>

      {/* IUU vessel markers */}
      {flaggedVessels.map(({ vessel, match }) => {
        const style = CONFIDENCE_STYLES[match.confidence]
        return (
          <Marker key={`iuu-${vessel.mmsi}`} longitude={vessel.lng} latitude={vessel.lat} anchor="center">
            <button
              onClick={() => {
                const alert = alerts.find(a => a.vessel.mmsi === vessel.mmsi)
                if (alert) {
                  setSelectedEntity({ type: 'iuuVessel', data: alert })
                } else {
                  setSelectedEntity({ type: 'vessel', data: vessel })
                }
                setPanelVisible('entity', true)
              }}
              className="relative flex items-center justify-center"
              title={`IUU: ${vessel.name} [${match.confidence}]`}
            >
              <span
                className={`absolute ${style.size} rounded-full animate-ping opacity-30`}
                style={{ backgroundColor: style.color }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full border-2"
                style={{
                  backgroundColor: style.color,
                  borderColor: style.color,
                  boxShadow: style.glow,
                }}
              />
            </button>
          </Marker>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

Stage `src/views/maritime/MaritimeLayer.tsx`, commit with message: `feat: MaritimeLayer with EEZ polygons and IUU vessel markers`

---

### Task 10: Build MaritimeFeedPanel

**Files:**
- Create: `src/views/maritime/MaritimeFeedPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/views/maritime/MaritimeFeedPanel.tsx`**

```typescript
// src/views/maritime/MaritimeFeedPanel.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../store'
import { useIUUAlerts } from '../../hooks/useIUUAlerts'
import { useIUUVessels } from '../../hooks/useIUUVessels'
import type { IUUConfidence } from '../../types'
import { mapRef } from '../../mapRef'

const CONFIDENCE_COLORS: Record<IUUConfidence, string> = {
  HIGH: 'text-hud-red border-hud-red/40',
  MEDIUM: 'text-hud-amber border-hud-amber/40',
  LOW: 'text-hud-dim border-hud-dim/40',
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 16)
}

export function MaritimeFeedPanel() {
  const panels = useHUDStore((s) => s.panels)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const { alerts } = useIUUAlerts(true)
  const { flaggedVessels } = useIUUVessels(true)

  return (
    <AnimatePresence>
      {panels.eventFeed && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="fixed left-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-red/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-red/20">
            <div className="w-1 h-4 bg-hud-red rounded-full" />
            <span className="font-mono text-[10px] tracking-widest text-hud-red">MARITIME IUU</span>
            {alerts.length > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-hud-red animate-pulse" />
            )}
            <span className="font-mono text-[8px] text-hud-dim">{alerts.length} alerts</span>
          </div>

          {/* Stats bar */}
          <div className="flex gap-3 px-3 py-1.5 border-b border-hud-dim/10 font-mono text-[9px]">
            <span className="text-hud-red">
              {flaggedVessels.filter(v => v.match.confidence === 'HIGH').length} HIGH
            </span>
            <span className="text-hud-amber">
              {flaggedVessels.filter(v => v.match.confidence === 'MEDIUM').length} MED
            </span>
            <span className="text-hud-dim">
              {flaggedVessels.filter(v => v.match.confidence === 'LOW').length} LOW
            </span>
            <span className="ml-auto text-hud-dim/50">
              {flaggedVessels.length} flagged
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* IUU-in-EEZ Alerts */}
            {alerts.length > 0 && (
              <div className="px-3 pt-2 pb-1">
                <span className="font-mono text-[8px] tracking-[0.2em] text-hud-red">EEZ VIOLATIONS</span>
              </div>
            )}
            {alerts.slice(0, 50).map((alert) => (
              <button
                key={alert.id}
                onClick={() => {
                  setSelectedEntity({ type: 'iuuVessel', data: alert })
                  setPanelVisible('entity', true)
                  mapRef.current?.flyTo({
                    center: [alert.vessel.lng, alert.vessel.lat],
                    zoom: 6,
                    duration: 1500,
                  })
                }}
                className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-red/5 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-mono border px-1 rounded ${CONFIDENCE_COLORS[alert.match.confidence]}`}>
                    {alert.match.confidence}
                  </span>
                  <span className="font-mono text-xs text-hud-text truncate flex-1">
                    {alert.vessel.name || `MMSI ${alert.vessel.mmsi}`}
                  </span>
                  <span className="font-mono text-[10px] text-hud-dim/60 shrink-0">
                    {formatTime(alert.timestamp)}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-hud-dim mt-0.5 truncate">
                  {alert.eezName}
                </div>
                <div className="font-mono text-[9px] text-hud-dim/50 mt-0.5">
                  matched: {alert.match.matchedFields.join(', ')}
                </div>
              </button>
            ))}

            {/* Flagged vessels not in EEZ */}
            {flaggedVessels.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                <span className="font-mono text-[8px] tracking-[0.2em] text-hud-amber">FLAGGED VESSELS</span>
              </div>
            )}
            {flaggedVessels
              .filter(fv => !alerts.some(a => a.vessel.mmsi === fv.vessel.mmsi))
              .slice(0, 50)
              .map(({ vessel, match }) => (
                <button
                  key={`fv-${vessel.mmsi}`}
                  onClick={() => {
                    setSelectedEntity({ type: 'vessel', data: vessel })
                    setPanelVisible('entity', true)
                    mapRef.current?.flyTo({
                      center: [vessel.lng, vessel.lat],
                      zoom: 6,
                      duration: 1500,
                    })
                  }}
                  className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-amber/5 transition-colors"
                  style={{ borderLeft: `2px solid ${match.confidence === 'HIGH' ? '#ff2d2d' : match.confidence === 'MEDIUM' ? '#ffaa00' : '#4a6080'}` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-mono border px-1 rounded ${CONFIDENCE_COLORS[match.confidence]}`}>
                      {match.confidence}
                    </span>
                    <span className="font-mono text-[10px] text-hud-text truncate flex-1">
                      {vessel.name || `MMSI ${vessel.mmsi}`}
                    </span>
                    <span className="font-mono text-[10px] text-hud-dim/60">{vessel.speed.toFixed(1)} kn</span>
                  </div>
                  <div className="font-mono text-[9px] text-hud-dim/50 mt-0.5">
                    {match.matchedFields.join(', ')} | MMSI {vessel.mmsi}
                  </div>
                </button>
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Mount in `src/App.tsx`**

Add import:

```typescript
import { MaritimeFeedPanel } from './views/maritime/MaritimeFeedPanel'
```

Add after the space wrapper line:

```typescript
        {activeView === 'maritime' && <MaritimeFeedPanel />}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

Stage `src/views/maritime/MaritimeFeedPanel.tsx src/App.tsx`, commit with message: `feat: MaritimeFeedPanel with IUU alerts and flagged vessel feed`

---

### Task 11: Build IUUVesselDetail entity panel

**Files:**
- Create: `src/views/maritime/IUUVesselDetail.tsx`
- Modify: `src/components/panels/EntityPanel/index.tsx`

- [ ] **Step 1: Create `src/views/maritime/IUUVesselDetail.tsx`**

```typescript
// src/views/maritime/IUUVesselDetail.tsx
import type { IUUAlert, IUUConfidence } from '../../types'

const CONFIDENCE_BG: Record<IUUConfidence, string> = {
  HIGH: 'bg-hud-red/10 border-hud-red/30 text-hud-red',
  MEDIUM: 'bg-hud-amber/10 border-hud-amber/30 text-hud-amber',
  LOW: 'bg-hud-dim/10 border-hud-dim/30 text-hud-dim',
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-hud-dim/10">
      <span className="font-mono text-[9px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-[10px] text-hud-text">{value}</span>
    </div>
  )
}

export function IUUVesselDetail({ data }: { data: IUUAlert }) {
  const { vessel, match, eezName, timestamp } = data

  return (
    <div className="px-3 pt-2">
      {/* Confidence badge */}
      <div className={`mb-2 px-2 py-1.5 rounded border text-center ${CONFIDENCE_BG[match.confidence]}`}>
        <div className="font-mono text-[10px] tracking-wider">{match.confidence} CONFIDENCE IUU MATCH</div>
        <div className="font-mono text-[8px] mt-0.5 opacity-70">
          matched: {match.matchedFields.join(', ').toUpperCase()}
        </div>
      </div>

      {/* Vessel info */}
      <DataRow label="NAME" value={vessel.name || '\u2014'} />
      <DataRow label="MMSI" value={String(vessel.mmsi)} />
      <DataRow label="IMO" value={vessel.imo > 0 ? String(vessel.imo) : '\u2014'} />
      <DataRow label="CALL SIGN" value={vessel.callSign || '\u2014'} />
      <DataRow label="FLAG" value={match.record.flag || '\u2014'} />
      <DataRow label="LAT/LNG" value={`${vessel.lat.toFixed(4)}, ${vessel.lng.toFixed(4)}`} />
      <DataRow label="SPEED" value={`${vessel.speed.toFixed(1)} kn`} />
      <DataRow label="COURSE" value={`${vessel.course.toFixed(1)}\u00B0`} />

      {/* EEZ violation */}
      {eezName && (
        <div className="mt-3 px-2 py-1.5 rounded border border-hud-red/30 bg-hud-red/5">
          <div className="font-mono text-[8px] tracking-wider text-hud-red">EEZ VIOLATION</div>
          <div className="font-mono text-[10px] text-hud-text mt-0.5">{eezName}</div>
          <div className="font-mono text-[9px] text-hud-dim mt-0.5">
            {new Date(timestamp).toISOString().slice(0, 19)} UTC
          </div>
        </div>
      )}

      {/* IUU listing details */}
      <div className="mt-3">
        <div className="font-mono text-[8px] tracking-[0.2em] text-hud-amber mb-1">IUU LISTING</div>
        <DataRow label="AUTHORITY" value={match.record.listingAuthority || '\u2014'} />
        <DataRow label="LISTED" value={match.record.listedDate || '\u2014'} />
        {match.record.reason && (
          <div className="mt-1.5 font-mono text-[9px] text-hud-dim leading-relaxed">
            {match.record.reason}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to EntityPanel**

In `src/components/panels/EntityPanel/index.tsx`, add import:

```typescript
import { IUUVesselDetail } from '../../../views/maritime/IUUVesselDetail'
import type { IUUAlert } from '../../../types'
```

Add after the `powerOutage` conditional (around line 893):

```typescript
              {selectedEntity.type === 'iuuVessel' && <IUUVesselDetail data={selectedEntity.data as IUUAlert} />}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

Stage `src/views/maritime/IUUVesselDetail.tsx src/components/panels/EntityPanel/index.tsx`, commit with message: `feat: IUUVesselDetail entity panel with confidence, EEZ, and listing info`

---

### Task 12: Hide default EventFeedPanel on Maritime view

**Files:**
- Modify: `src/components/panels/EventFeedPanel/index.tsx`

- [ ] **Step 1: Gate EventFeedPanel to not render on Maritime view**

The Maritime view uses its own `MaritimeFeedPanel`. Add an early return after the `activeView` store read in the EventFeedPanel component:

```typescript
  // Maritime view has its own dedicated feed panel
  if (activeView === 'maritime') return null
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

Stage `src/components/panels/EventFeedPanel/index.tsx`, commit with message: `feat: hide default EventFeedPanel on Maritime view`

---

### Task 13: Final integration verification

- [ ] **Step 1: Verify full type check passes**

Run: `npx tsc --noEmit --pretty`
Expected: Clean (no errors)

- [ ] **Step 2: Start the server and verify startup logs**

Run: `npm run dev`

Expected in logs:
- `[iuuDb] imported N IUU vessels from XLS` (or `loaded N from SQLite` on subsequent runs)
- `[eezCache] loaded N EEZs from cache` (or fetch progress messages on first run)
- `[iuuMatcher] started (30s EEZ sweep)`

- [ ] **Step 3: Test API endpoints**

Run: `curl -s http://localhost:3001/api/maritime/iuu/alerts | head -c 200`
Run: `curl -s http://localhost:3001/api/maritime/iuu/vessels | head -c 200`
Run: `curl -s http://localhost:3001/api/maritime/eez | head -c 200`

- [ ] **Step 4: Test the Maritime page in browser**

- Press `5` to switch to Maritime view
- Verify EEZ polygons render on the map
- Verify MaritimeFeedPanel appears on the left (not the default EventFeedPanel)
- If any IUU vessels are in the AIS stream, verify red pulsing markers appear
- Click an IUU marker to see the IUUVesselDetail in the entity panel

- [ ] **Step 5: Final commit**

Stage all remaining files, commit with message: `feat: Maritime IUU/EEZ detection page — complete integration`
