// server/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIncidents, getFlights } from './cache'
import { deduplicateIncidents } from './dedup'
import { startPoller } from './poller'
import { crimeRoute } from './routes/crime'
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats, getAllVessels } from './aisCache'
import { startAis, isConnected as aisConnected } from './ais'
import { getDrones } from './droneCache'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
}))

app.get('/api/incidents', (c) => c.json(deduplicateIncidents(getIncidents())))
app.get('/api/flights',   (c) => c.json(getFlights()))
app.route('/api/crime', crimeRoute)

app.get('/api/vessels/density',     (c) => c.json(getDensityZones()))
app.get('/api/vessels/military',    (c) => c.json(getMilitaryCandidates()))
app.get('/api/vessels/chokepoints', (c) => c.json(getChokepoints()))
app.get('/api/vessels/disruptions', (c) => c.json(getDisruptions()))
app.get('/api/vessels/stats',       (c) => c.json({ ...getStats(), connected: aisConnected }))
app.get('/api/vessels/all',         (c) => c.json(getAllVessels()))

app.get('/api/drones/viewport', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
    return c.json([])
  }
  const drones = await getDrones(minLng, minLat, maxLng, maxLat)
  return c.json(drones)
})

// Start serving immediately — polling runs in background so Vite proxy
// is never connection-refused on cold start. Cache returns [] until first
// poll completes (~5-8s), then fills on subsequent 30s cycles.
serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('GothamHUD server → http://localhost:3001')
})

startPoller().catch((e) => console.error('[poller] startup failed:', e))
startAis()
