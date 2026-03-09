// server/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIncidents, getFlights } from './cache'
import { deduplicateIncidents } from './dedup'
import { startPoller } from './poller'
import { crimeRoute } from './routes/crime'
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats } from './aisCache'
import { startAis, isConnected as aisConnected } from './ais'

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

// Block until initial data is fetched, then start accepting connections
await startPoller()
startAis()

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('GothamHUD server → http://localhost:3001')
})
