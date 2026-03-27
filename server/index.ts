// server/index.ts
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIncidents, getFlights } from './cache'
import { deduplicateIncidents } from './dedup'
import { startPoller } from './poller'
import { getDensityZones, getMilitaryCandidates, getChokepoints, getDisruptions, getStats, getAllVessels, getVesselsInBounds, getSnapshot, getVesselIntel } from './aisCache'
import { startAis, isConnected as aisConnected } from './ais'
import { getDrones, setDroneBbox, startDronePoller, droneEvents } from './droneCache'
import { getHistory } from './droneDb'
import { getTrafficIncidents, setTrafficBbox, startTrafficPoller } from './trafficCache'
import { getWeatherAlerts, setWeatherPoint, startWeatherPoller } from './weatherCache'
import { getCrimeIncidents, setCrimeBbox, startCrimePoller } from './crimeCache'
import { getLowAltAircraft, setAircraftBbox, startAircraftPoller } from './aircraftCache'
import { getPowerOutages, setPowerLocation, startPowerPoller } from './powerCache'
import { getZones } from './zoneCache'
import { getTLEs } from './tleCache'
import { getSpaceWeather } from './spaceWeatherCache'
import { getNewsFiltered, getNewsGeolocated, getNewsSources, startNewsPoller } from './rssNewsCache'
import { getCyberNews, getCyberNewsGraph, getCyberNewsSources, startCyberNewsPoller } from './cyberNewsCache'
import { getCveDetails } from './cveCache'
import { getTactics } from './mitreData'
import { getThreatStats, getMitreHeatmap, getCampaigns, getActorProfile, getTemporalData, getGeoHeatmap, getEdgeArticles } from './cyberAggregations'

const app = new Hono()
const isProd = process.env.NODE_ENV === 'production'

if (!isProd) {
  app.use('*', cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
  }))
}

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

app.get('/api/drones/history', (c) => {
  const from = parseInt(c.req.query('from') ?? '', 10)
  const to   = parseInt(c.req.query('to') ?? '', 10)
  if (isNaN(from) || isNaN(to)) return c.json({ error: 'Missing from/to params' }, 400)
  const maxRange = 25 * 60 * 60 * 1000 // 25h max to prevent huge queries
  if (to - from > maxRange) return c.json({ error: 'Range too large (max 25h)' }, 400)
  return c.json(getHistory(from, to))
})

app.get('/api/city/weather', async (c) => {
  const lat = parseFloat(c.req.query('lat') ?? '')
  const lng = parseFloat(c.req.query('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) return c.json([])
  await setWeatherPoint(lat, lng)
  return c.json(getWeatherAlerts())
})

app.get('/api/city/crime', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) return c.json([])
  await setCrimeBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getCrimeIncidents())
})

app.get('/api/city/traffic', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) return c.json([])
  await setTrafficBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getTrafficIncidents())
})

app.get('/api/city/aircraft', async (c) => {
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  if ([minLng, minLat, maxLng, maxLat].some(isNaN)) return c.json([])
  await setAircraftBbox(minLng, minLat, maxLng, maxLat)
  return c.json(getLowAltAircraft())
})

app.get('/api/city/power', async (c) => {
  const lat = parseFloat(c.req.query('lat') ?? '')
  const lng = parseFloat(c.req.query('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) return c.json([])
  await setPowerLocation(lat, lng)
  return c.json(getPowerOutages())
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

app.get('/api/space-weather', async (c) => {
  const data = await getSpaceWeather()
  return c.json(data)
})

app.get('/api/tle', async (c) => {
  const tles = await getTLEs()
  if (!tles) return c.json({ error: 'TLE data unavailable' }, 503)
  return c.json(tles)
})

app.get('/api/news', async (c) => {
  return c.json(getNewsFiltered({
    category: c.req.query('category'),
    region: c.req.query('region'),
    search: c.req.query('search'),
    limit: parseInt(c.req.query('limit') ?? '') || 200,
    offset: parseInt(c.req.query('offset') ?? '') || 0,
  }))
})
app.get('/api/news/geolocated', (c) => c.json(getNewsGeolocated()))
app.get('/api/news/sources', (c) => c.json(getNewsSources()))

app.get('/api/cyber/news', (c) => {
  return c.json(getCyberNews({
    attackType: c.req.query('attackType'),
    severity: c.req.query('severity'),
    search: c.req.query('search'),
    limit: parseInt(c.req.query('limit') ?? '') || 200,
    offset: parseInt(c.req.query('offset') ?? '') || 0,
  }))
})
app.get('/api/cyber/news/graph', (c) => c.json(getCyberNewsGraph()))
app.get('/api/cyber/news/sources', (c) => c.json(getCyberNewsSources()))

app.get('/api/cyber/cve', async (c) => {
  const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? []
  if (ids.length === 0) return c.json({ error: 'Missing ids param' }, 400)
  if (ids.length > 10) return c.json({ error: 'Max 10 CVEs per request' }, 400)
  const details = await getCveDetails(ids)
  return c.json(details)
})

app.get('/api/cyber/mitre/tactics', (c) => c.json(getTactics()))

app.get('/api/cyber/stats', (c) => c.json(getThreatStats()))
app.get('/api/cyber/mitre/heatmap', (c) => c.json(getMitreHeatmap()))
app.get('/api/cyber/campaigns', (c) => c.json(getCampaigns()))
app.get('/api/cyber/actor/:name', (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const profile = getActorProfile(name)
  if (!profile) return c.json({ error: 'Actor not found' }, 404)
  return c.json(profile)
})
app.get('/api/cyber/temporal', (c) => {
  const hours = parseInt(c.req.query('hours') ?? '') || 168
  return c.json(getTemporalData(hours))
})
app.get('/api/cyber/heatmap', (c) => c.json(getGeoHeatmap()))
app.get('/api/cyber/edge-articles', (c) => {
  const actorId = c.req.query('actorId') ?? ''
  const targetId = c.req.query('targetId') ?? ''
  if (!actorId || !targetId) return c.json({ error: 'Missing actorId or targetId' }, 400)
  return c.json(getEdgeArticles(actorId, targetId))
})

// Expose Mapbox token at runtime so it doesn't need to be baked in at build time.
// In production, restrict to same-origin requests to avoid leaking the token.
app.get('/api/config', (c) => {
  if (isProd) {
    const origin = c.req.header('origin') ?? ''
    const referer = c.req.header('referer') ?? ''
    const host = c.req.header('host') ?? ''
    const isSameOrigin = origin.includes(host) || referer.includes(host) || !origin
    if (!isSameOrigin) {
      return c.json({ mapboxToken: '' })
    }
  }
  return c.json({
    mapboxToken: process.env.VITE_MAPBOX_TOKEN ?? process.env.MAPBOX_ACCESS_TOKEN ?? '',
  })
})

// In production, serve the Vite-built frontend from dist/
if (isProd) {
  app.use('*', serveStatic({ root: './dist' }))
  // SPA fallback — serve index.html for any non-API route
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

// Start serving immediately — polling runs in background so Vite proxy
// is never connection-refused on cold start. Cache returns [] until first
// poll completes (~5-8s), then fills on subsequent 30s cycles.
const port = parseInt(process.env.PORT ?? '3001', 10)
serve({ fetch: app.fetch, port }, () => {
  console.log(`Endurion server → http://localhost:${port}`)
})

startPoller().catch((e) => console.error('[poller] startup failed:', e))
startAis()
startDronePoller()
startNewsPoller().catch((e) => console.error('[news] startup failed:', e))
startCyberNewsPoller().catch((e) => console.error('[cyberNews] startup failed:', e))
startTrafficPoller()
startWeatherPoller()
startCrimePoller()
startAircraftPoller()
startPowerPoller()
