// server/ais.ts
import { processVesselMessage, cleanupStaleVessels } from './aisCache'

const WS_URL         = 'wss://stream.aisstream.io/v0/stream'
const RECONNECT_MS   = 10_000
const CLEANUP_MS     = 5 * 60 * 1000

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
export let isConnected = false

function connect(apiKey: string): void {
  if (ws) { try { ws.close() } catch { /* ignore close errors on reconnect */ } }

  console.log('[ais] connecting to AISStream…')
  ws = new WebSocket(WS_URL)

  ws.addEventListener('open', () => {
    isConnected = true
    console.log('[ais] connected — subscribing global coverage')
    ws!.send(JSON.stringify({
      APIKey: apiKey,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'],
    }))
  })

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string)
      const meta = msg.MetaData
      if (!meta) return

      const mmsi = meta.MMSI
      if (!mmsi || mmsi <= 0) return

      const lat = meta.latitude
      const lng = meta.longitude
      if (lat == null || lng == null || lat === 0 || lng === 0) return
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return

      let speed = 0, course = 0, heading = 0
      let shipType = 0, name = (meta.ShipName?.trim() ?? '') as string

      if (msg.MessageType === 'PositionReport' && msg.Message?.PositionReport) {
        const pr = msg.Message.PositionReport
        speed = pr.Sog ?? 0; course = pr.Cog ?? 0; heading = pr.TrueHeading ?? 0
      } else if (msg.MessageType === 'StandardClassBPositionReport' && msg.Message?.StandardClassBPositionReport) {
        const pr = msg.Message.StandardClassBPositionReport
        speed = pr.Sog ?? 0; course = pr.Cog ?? 0; heading = pr.TrueHeading ?? 0
      } else if (msg.MessageType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
        const sd = msg.Message.ShipStaticData
        shipType = sd.Type ?? 0
        name = sd.ShipName?.trim() ?? name
      }

      processVesselMessage(mmsi, lat, lng, shipType, name, speed, course, heading)
    } catch { /* ignore malformed AIS messages */ }
  })

  ws.addEventListener('error', (e) => {
    console.error('[ais] WebSocket error:', (e as ErrorEvent).message ?? e)
  })

  ws.addEventListener('close', (e) => {
    isConnected = false
    console.log(`[ais] disconnected (code=${e.code}), reconnecting in ${RECONNECT_MS / 1000}s`)
    scheduleReconnect(apiKey)
  })
}

function scheduleReconnect(apiKey: string): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => connect(apiKey), RECONNECT_MS)
}

export function startAis(): void {
  const apiKey = process.env.AISSTREAM_API_KEY
  if (!apiKey) {
    console.log('[ais] AISSTREAM_API_KEY not set — maritime layer disabled')
    return
  }
  connect(apiKey)
  setInterval(cleanupStaleVessels, CLEANUP_MS)
}
