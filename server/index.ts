// server/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIncidents, getFlights } from './cache'
import { deduplicateIncidents } from './dedup'
import { startPoller } from './poller'
import { crimeRoute } from './routes/crime'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
}))

app.get('/api/incidents', (c) => c.json(deduplicateIncidents(getIncidents())))
app.get('/api/flights',   (c) => c.json(getFlights()))
app.route('/api/crime', crimeRoute)

// Start serving immediately — polling runs in background so Vite proxy
// is never connection-refused on cold start. Cache returns [] until first
// poll completes (~5-8s), then fills on subsequent 30s cycles.
serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('GothamHUD server → http://localhost:3001')
})

startPoller().catch((e) => console.error('[poller] startup failed:', e))
