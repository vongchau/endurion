// server/iuuDb.ts — IUU vessel list stored in SQLite with in-memory hash maps
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'
import type { IUURecord, IUUConfidence } from '../src/types'

const dataDir = path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = path.join(dataDir, 'iuu-vessels.db')
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

// --- IUU match + alert persistence tables ---

db.exec(`
  CREATE TABLE IF NOT EXISTS iuu_matches (
    mmsi              INTEGER PRIMARY KEY,
    imo               INTEGER,
    vessel_name       TEXT,
    call_sign         TEXT,
    confidence        TEXT    NOT NULL,
    matched_fields    TEXT    NOT NULL,
    iuu_name          TEXT,
    iuu_flag          TEXT,
    iuu_authority     TEXT,
    iuu_reason        TEXT,
    first_seen        INTEGER NOT NULL,
    last_seen         INTEGER NOT NULL,
    last_lat          REAL,
    last_lng          REAL
  );

  CREATE TABLE IF NOT EXISTS iuu_eez_alerts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    mmsi              INTEGER NOT NULL,
    vessel_name       TEXT,
    confidence        TEXT    NOT NULL,
    eez_name          TEXT    NOT NULL,
    eez_mrgid         INTEGER NOT NULL,
    lat               REAL,
    lng               REAL,
    timestamp         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_eez_alerts_ts ON iuu_eez_alerts(timestamp);
  CREATE INDEX IF NOT EXISTS idx_eez_alerts_mmsi ON iuu_eez_alerts(mmsi);
`)

console.log(`[iuuDb] opened ${dbPath}`)

const byMmsi = new Map<number, IUURecord>()
const byImo = new Map<number, IUURecord>()
const byName = new Map<string, IUURecord>()
const byCallSign = new Map<string, IUURecord>()

function collectReasons(row: any): string {
  // Reason fields are spread across Reason_7, Reason_11, Reason_12, etc.
  const reasons: string[] = []
  for (const key of Object.keys(row)) {
    if (key.startsWith('Reason') && row[key]) {
      const val = String(row[key]).trim()
      if (val && val !== 'Cross-listing') reasons.push(val)
    }
  }
  // Deduplicate
  return [...new Set(reasons)].join(' | ') || 'Cross-listing'
}

function collectListingAuthorities(row: any): string {
  // RFMO columns contain date ranges when listed (e.g. "2023-10-11 - ")
  const rfmos: string[] = []
  const rfmoKeys = ['NAFO', 'NEAFC', 'NPFC', 'SIOFA', 'CCAMLR', 'ICCAT', 'IATTC', 'IOTC', 'WCPFC', 'SPRFMO', 'GFCM', 'SEAFO', 'CCSBT']
  for (const key of rfmoKeys) {
    if (row[key] && String(row[key]).trim()) rfmos.push(key)
  }
  return rfmos.join(', ') || String(row.RFMOName ?? '').trim() || ''
}

function toRecord(row: any): IUURecord {
  const mmsiRaw = row.mmsi ?? row.MMSI ?? 0
  const imoRaw = row.imo ?? row.IMO ?? 0
  return {
    mmsi: typeof mmsiRaw === 'number' ? mmsiRaw : parseInt(String(mmsiRaw), 10) || 0,
    imo: typeof imoRaw === 'number' ? imoRaw : parseInt(String(imoRaw), 10) || 0,
    name: String(row.name ?? row.Name ?? '').trim(),
    callSign: String(row.call_sign ?? row.callSign ?? row.IRCS ?? '').trim(),
    flag: String(row.flag ?? row.Flag ?? '').trim(),
    listedDate: String(row.listed_date ?? row.listedDate ?? '').trim(),
    listingAuthority: row.listing_authority ?? row.listingAuthority ?? collectListingAuthorities(row),
    reason: row.reason ?? row.Reason ?? collectReasons(row),
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
  db.exec('DELETE FROM iuu_vessels')
  insertMany(records)
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
    if (!fs.existsSync(xlsPath)) {
      console.warn(`[iuuDb] XLS not found at ${xlsPath} — IUU matching disabled until file is provided`)
      return
    }
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

// --- IUU match persistence ---

export interface PersistedMatch {
  mmsi: number
  imo: number
  vesselName: string
  callSign: string
  confidence: IUUConfidence
  matchedFields: string[]
  iuuName: string
  iuuFlag: string
  iuuAuthority: string
  iuuReason: string
  firstSeen: number
  lastSeen: number
  lastLat: number
  lastLng: number
}

const upsertMatch = db.prepare(`
  INSERT INTO iuu_matches (mmsi, imo, vessel_name, call_sign, confidence, matched_fields,
    iuu_name, iuu_flag, iuu_authority, iuu_reason, first_seen, last_seen, last_lat, last_lng)
  VALUES (@mmsi, @imo, @vesselName, @callSign, @confidence, @matchedFields,
    @iuuName, @iuuFlag, @iuuAuthority, @iuuReason, @firstSeen, @lastSeen, @lastLat, @lastLng)
  ON CONFLICT(mmsi) DO UPDATE SET
    imo = @imo, vessel_name = @vesselName, call_sign = @callSign,
    confidence = @confidence, matched_fields = @matchedFields,
    last_seen = @lastSeen, last_lat = @lastLat, last_lng = @lastLng
`)

export function persistMatch(m: PersistedMatch): void {
  upsertMatch.run({
    ...m,
    matchedFields: m.matchedFields.join(','),
  })
}

const selectMatches = db.prepare('SELECT * FROM iuu_matches ORDER BY last_seen DESC')

export function loadPersistedMatches(): PersistedMatch[] {
  const rows = selectMatches.all() as any[]
  return rows.map(r => ({
    mmsi: r.mmsi,
    imo: r.imo,
    vesselName: r.vessel_name ?? '',
    callSign: r.call_sign ?? '',
    confidence: r.confidence as IUUConfidence,
    matchedFields: (r.matched_fields ?? '').split(',').filter(Boolean),
    iuuName: r.iuu_name ?? '',
    iuuFlag: r.iuu_flag ?? '',
    iuuAuthority: r.iuu_authority ?? '',
    iuuReason: r.iuu_reason ?? '',
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    lastLat: r.last_lat ?? 0,
    lastLng: r.last_lng ?? 0,
  }))
}

// --- EEZ alert persistence ---

const insertAlert = db.prepare(`
  INSERT INTO iuu_eez_alerts (mmsi, vessel_name, confidence, eez_name, eez_mrgid, lat, lng, timestamp)
  VALUES (@mmsi, @vesselName, @confidence, @eezName, @eezMrgid, @lat, @lng, @timestamp)
`)

export function persistEEZAlert(alert: {
  mmsi: number; vesselName: string; confidence: string;
  eezName: string; eezMrgid: number; lat: number; lng: number; timestamp: number;
}): void {
  insertAlert.run(alert)
}

const selectRecentAlerts = db.prepare(
  'SELECT * FROM iuu_eez_alerts ORDER BY timestamp DESC LIMIT 200'
)

export function loadPersistedAlerts(): any[] {
  return selectRecentAlerts.all()
}

// --- Get all known IUU MMSIs (for eviction exemption) ---

const selectMatchMMSIs = db.prepare('SELECT mmsi FROM iuu_matches')

export function getPersistedMatchMMSIs(): Set<number> {
  const rows = selectMatchMMSIs.all() as { mmsi: number }[]
  return new Set(rows.map(r => r.mmsi))
}
