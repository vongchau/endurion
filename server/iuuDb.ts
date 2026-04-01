// server/iuuDb.ts — IUU vessel list stored in SQLite with in-memory hash maps
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'
import type { IUURecord } from '../src/types'

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
