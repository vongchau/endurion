// server/droneDb.ts — SQLite-backed drone position history (7-day retention)
import Database from 'better-sqlite3'
import path from 'path'

const isProd = process.env.NODE_ENV === 'production'
const dbPath = isProd
  ? path.join(process.env.HOME ?? '/home', 'endurion-drone-history.db')
  : path.join(process.cwd(), 'data', 'drone-history.db')

const db = new Database(dbPath)

// WAL mode for concurrent reads during writes
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS drone_positions (
    operation_id   TEXT    NOT NULL,
    sensor_id      TEXT    NOT NULL,
    lng            REAL    NOT NULL,
    lat            REAL    NOT NULL,
    altitude       REAL    NOT NULL,
    speed          REAL    NOT NULL,
    vertical_speed REAL    NOT NULL,
    heading        REAL    NOT NULL,
    state          TEXT    NOT NULL,
    timestamp      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drone_ts ON drone_positions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_drone_op_ts ON drone_positions(operation_id, timestamp);
`)

console.log(`[droneDb] opened ${dbPath}`)

// --- Write ---

interface DroneRow {
  operationId: string
  sensorId: string
  lng: number
  lat: number
  altitude: number
  speed: number
  verticalSpeed: number
  heading: number
  state: string
  timestamp: number
}

const insertStmt = db.prepare(`
  INSERT INTO drone_positions (operation_id, sensor_id, lng, lat, altitude, speed, vertical_speed, heading, state, timestamp)
  VALUES (@operationId, @sensorId, @lng, @lat, @altitude, @speed, @verticalSpeed, @heading, @state, @timestamp)
`)

const insertMany = db.transaction((rows: DroneRow[]) => {
  for (const row of rows) insertStmt.run(row)
})

export function insertPositions(rows: DroneRow[]) {
  if (rows.length === 0) return
  insertMany(rows)
}

// --- Read (downsampled to ~30s intervals) ---

export interface HistoryPosition {
  operationId: string
  sensorId: string
  lng: number
  lat: number
  altitude: number
  speed: number
  verticalSpeed: number
  heading: number
  state: string
  timestamp: number
}

const queryStmt = db.prepare(`
  SELECT
    operation_id AS operationId,
    sensor_id AS sensorId,
    lng, lat, altitude, speed,
    vertical_speed AS verticalSpeed,
    heading, state, timestamp
  FROM drone_positions
  WHERE timestamp BETWEEN ? AND ?
    AND (timestamp / 30000) != ((timestamp - 5000) / 30000)
  ORDER BY timestamp ASC
`)

export function getHistory(fromMs: number, toMs: number): HistoryPosition[] {
  return queryStmt.all(fromMs, toMs) as HistoryPosition[]
}

// --- Purge (7-day retention) ---

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

const purgeStmt = db.prepare('DELETE FROM drone_positions WHERE timestamp < ?')

export function purgeOldData() {
  const cutoff = Date.now() - RETENTION_MS
  const result = purgeStmt.run(cutoff)
  if (result.changes > 0) {
    console.log(`[droneDb] purged ${result.changes} rows older than 7 days`)
  }
}

// Run purge on startup and every hour
purgeOldData()
setInterval(purgeOldData, 60 * 60 * 1000)
