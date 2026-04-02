// server/ais.ts
import { processVesselMessage, cleanupStaleVessels } from './aisCache'
import { checkVesselIdentity } from './iuuMatcher'

const WS_URL         = 'wss://stream.aisstream.io/v0/stream'
const BASE_RECONNECT_MS = 10_000
const MAX_RECONNECT_MS  = 120_000  // Cap at 2 minutes
const CLEANUP_MS     = 5 * 60 * 1000
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let firstMessageLogged = false
export let isConnected = false

function connect(apiKey: string): void {
  // Ensure previous connection is fully torn down
  if (ws) {
    const old = ws
    ws = null
    isConnected = false
    try { old.close() } catch { /* ignore */ }
  }

  console.log('[ais] connecting to AISStream…')
  ws = new WebSocket(WS_URL)

  ws.addEventListener('open', () => {
    isConnected = true
    firstMessageLogged = false
    console.log(`[ais] connected — subscribing (attempt ${reconnectAttempts + 1})`)
    const sub = {
      APIKey: apiKey.trim(),
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'],
    }
    console.log(`[ais] subscription key length: ${apiKey.trim().length}, payload: ${JSON.stringify(sub).length} bytes`)
    ws!.send(JSON.stringify(sub))

  })

  ws.addEventListener('message', async (event) => {
    try {
      const raw = event.data instanceof Blob ? await event.data.text() : String(event.data)

      // Log first message for debugging connection issues
      if (!firstMessageLogged) {
        firstMessageLogged = true
        reconnectAttempts = 0  // Reset on successful data
        console.log(`[ais] first message received (${raw.length} bytes): ${raw.slice(0, 200)}`)
      }

      const msg = JSON.parse(raw)
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
      let destination: string | undefined
      let callSign: string | undefined
      let imo: number | undefined
      let draught: number | undefined
      let eta: string | undefined
      let dimA: number | undefined, dimB: number | undefined
      let dimC: number | undefined, dimD: number | undefined

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
        destination = sd.Destination?.trim() || undefined
        callSign = sd.CallSign?.trim() || undefined
        imo = sd.ImoNumber ?? undefined
        draught = sd.MaximumStaticDraught ?? undefined
        if (sd.Eta) {
          eta = `${sd.Eta.Month}/${sd.Eta.Day} ${sd.Eta.Hour}:${String(sd.Eta.Minute).padStart(2, '0')}`
        }
        if (sd.Dimension) {
          dimA = sd.Dimension.A ?? 0
          dimB = sd.Dimension.B ?? 0
          dimC = sd.Dimension.C ?? 0
          dimD = sd.Dimension.D ?? 0
        }
      }

      processVesselMessage(
        mmsi, lat, lng, shipType, name, speed, course, heading,
        destination, callSign, imo, draught, eta, dimA, dimB, dimC, dimD,
      )

      // IUU identity check (O(1) hash lookup)
      checkVesselIdentity(mmsi, imo ?? 0, name, callSign ?? '')
    } catch { /* ignore malformed AIS messages */ }
  })

  ws.addEventListener('error', (e) => {
    const err = e as ErrorEvent
    console.error('[ais] WebSocket error:', err.message ?? err.error ?? 'unknown')
  })

  ws.addEventListener('close', (e) => {
    console.log(`[ais] close reason: "${e.reason || 'none'}"`)
    isConnected = false
    reconnectAttempts++
    const delay = Math.min(BASE_RECONNECT_MS * Math.pow(2, Math.min(reconnectAttempts - 1, 4)), MAX_RECONNECT_MS)
    console.log(`[ais] disconnected (code=${e.code}), reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${reconnectAttempts})`)
    scheduleReconnect(apiKey, delay)
  })
}

function scheduleReconnect(apiKey: string, delayMs?: number): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => connect(apiKey), delayMs ?? BASE_RECONNECT_MS)
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
