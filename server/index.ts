// server/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIncidents, getFlights } from './cache'
import { deduplicateIncidents } from './dedup'
import { startPoller } from './poller'
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats, getAllVessels, getVesselsInBounds, getSnapshot, getVesselIntel } from './aisCache'
import { startAis, isConnected as aisConnected } from './ais'
import { getDrones, setDroneBbox, startDronePoller, droneEvents } from './droneCache'
import { getZones } from './zoneCache'
import { getTLEs } from './tleCache'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
}))

app.get('/api/incidents', (c) => c.json(deduplicateIncidents(getIncidents())))
app.get('/api/flights',   (c) => c.json(getFlights()))

app.get('/api/vessels/density',     (c) => c.json(getDensityZones()))
app.get('/api/vessels/military',    (c) => c.json(getMilitaryCandidates()))
app.get('/api/vessels/chokepoints', (c) => c.json(getChokepoints()))
app.get('/api/vessels/disruptions', (c) => c.json(getDisruptions()))
app.get('/api/vessels/stats',       (c) => c.json({ ...getStats(), connected: aisConnected }))
app.get('/api/vessels/all',         (c) => c.json(getAllVessels()))
app.get('/api/vessels/viewport',   (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json(getAllVessels())
  }
  return c.json(getVesselsInBounds(minLng, minLat, maxLng, maxLat))
})
app.get('/api/vessels/snapshot',   (c) => c.json(getSnapshot()))
app.get('/api/vessels/:mmsi/intel', (c) => {
  const mmsi = parseInt(c.req.param('mmsi'), 10)
  if (isNaN(mmsi)) return c.json({ error: 'Invalid MMSI' }, 400)
  return c.json(getVesselIntel(mmsi))
})

app.get('/api/drones/stream', (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json({ error: 'Missing bounds' }, 400)
  }

  setDroneBbox(minLng, minLat, maxLng, maxLat)

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* client disconnected */ }
      }
      send(getDrones())
      const onUpdate = (drones: unknown) => send(drones)
      droneEvents.on('update', onUpdate)
      c.req.raw.signal.addEventListener('abort', () => {
        droneEvents.off('update', onUpdate)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

app.get('/api/drones/viewport', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json([])
  }
  setDroneBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getDrones())
})

app.get('/api/airspace/zones', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json([])
  }
  const zones = await getZones(minLng, minLat, maxLng, maxLat)
  return c.json(zones)
})

app.get('/api/tle', async (c) => {
  const tles = await getTLEs()
  if (!tles) return c.json({ error: 'TLE data unavailable' }, 503)
  return c.json(tles)
})

// Start serving immediately — polling runs in background so Vite proxy
// is never connection-refused on cold start. Cache returns [] until first
// poll completes (~5-8s), then fills on subsequent 30s cycles.
serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('GothamHUD server → http://localhost:3001')
})

startPoller().catch((e) => console.error('[poller] startup failed:', e))
startAis()
startDronePoller()
