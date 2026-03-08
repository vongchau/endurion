// server/poller.ts
import { fetchUSGS } from './sources/usgs'
import { fetchGDACS } from './sources/gdacs'
import { fetchEONET } from './sources/eonet'
import { fetchACLED } from './sources/acled'
import { fetchOpenSky } from './sources/opensky'
import { setIncidents, setStale, setFlights } from './cache'

const POLL_INTERVAL = 30_000

async function pollIncidents() {
  const disasterSources = [
    { name: 'usgs', fn: fetchUSGS },
    { name: 'gdacs', fn: fetchGDACS },
    { name: 'eonet', fn: fetchEONET },
  ] as const

  await Promise.allSettled(
    disasterSources.map(async ({ name, fn }) => {
      try {
        setIncidents(name, await fn())
        console.log(`[poller] ${name} OK`)
      } catch (e) {
        console.error(`[poller] ${name} failed:`, (e as Error).message)
        setStale(name)
      }
    })
  )

  const apiKey = process.env.ACLED_API_KEY
  const email  = process.env.ACLED_EMAIL
  if (apiKey && email) {
    try {
      setIncidents('acled', await fetchACLED(apiKey, email))
      console.log('[poller] acled OK')
    } catch (e) {
      console.error('[poller] acled failed:', (e as Error).message)
      setStale('acled')
    }
  }
}

async function pollFlights() {
  try {
    setFlights(await fetchOpenSky(process.env.OPENSKY_CLIENT_ID, process.env.OPENSKY_CLIENT_SECRET))
    console.log('[poller] opensky OK')
  } catch (e) {
    console.error('[poller] opensky failed:', (e as Error).message)
  }
}

export async function startPoller() {
  console.log('[poller] initial fetch…')
  await Promise.all([pollIncidents(), pollFlights()])
  console.log('[poller] started — polling every 30s')
  setInterval(pollIncidents, POLL_INTERVAL)
  setInterval(pollFlights, POLL_INTERVAL)
}
