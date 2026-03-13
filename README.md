# Endurion

All-source intelligence HUD — a cinematic dark ops-room frontend for real-time situational awareness. Four switchable views overlay live data feeds onto a full-viewport Mapbox canvas.

## Views

| Key | View | Description |
|-----|------|-------------|
| `1` | **Global** | World threat map — earthquakes, volcanoes, armed conflicts, military flights, AIS vessel tracking, maritime chokepoints, and geolocated news from 70+ RSS sources |
| `2` | **City** | Urban surveillance — drone activity, traffic incidents, crime data, weather alerts, low-altitude aircraft, airspace zones, and power outages |
| `3` | **Cyber** | Threat intelligence — network attack graph, CVE timeline, MITRE ATT&CK heatmap, actor profiles, and campaign tracking |
| `4` | **Space** | Orbital awareness — Starlink & ISS tracking via TLE propagation, NOAA space weather alerts, and geomagnetic indices |

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Framer Motion
- **Map:** Mapbox GL JS via react-map-gl
- **State:** Zustand
- **Server:** Hono on Node.js (port 3001)
- **Data:** 18+ real-time sources via polling, WebSocket, and RSS

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Add your API keys (see Environment Variables below)

# Run (starts both Vite dev server and API server)
npm run dev
```

The app opens at `http://localhost:5173`. The API server runs on `:3001` and Vite proxies `/api` requests to it.

## Environment Variables

Create a `.env.local` file in the project root.

**Required:**

| Variable | Purpose |
|----------|---------|
| `VITE_MAPBOX_TOKEN` | Mapbox GL map rendering |

**Optional — layers degrade gracefully without these:**

| Variable | Purpose |
|----------|---------|
| `AISSTREAM_API_KEY` | Maritime vessel tracking (aisstream.io) |
| `TOMTOM_API_KEY` | Traffic incidents (developer.tomtom.com) |
| `DRONETAG_API_KEY` | Drone activity layer |
| `FBI_CDE_API_KEY` | Crime data via FBI CDE (api.data.gov) |
| `GEMINI_API_KEY` | News headline geocoding (aistudio.google.com) |
| `CF_API_KEY` + `CF_ACCOUNT_ID` | Cloudflare threat data |
| `ACLED_API_KEY` + `ACLED_EMAIL` | Armed conflict events |
| `OPENSKY_CLIENT_ID` + `OPENSKY_CLIENT_SECRET` | Military flight tracking |
| `SOCRATA_APP_TOKEN` | Improved crime API rate limits |

**Free sources (no key needed):** USGS earthquakes, GDACS disasters, NASA EONET, NOAA space weather, NWS alerts, FAA airspace zones, ODIN power outages, Celestrak TLEs.

## Project Structure

```
src/
├── views/
│   ├── global/      # Vessels, news, incidents on world map
│   ├── city/        # Traffic, crime, drones, weather, aircraft, power
│   ├── cyber/       # Attack graph, MITRE heatmap, actor profiles
│   └── space/       # Satellite tracking, space weather
├── components/
│   ├── MapCanvas/   # Mapbox wrapper (key={activeView} forces remount)
│   ├── CommandSwitcher/  # View selector (keys 1-4)
│   └── panels/      # EventFeed, Entity, Timeline, StatusBar
├── hooks/           # Data fetching hooks, keyboard shortcuts
├── store/           # Zustand store (activeView, panels, entities)
└── types/           # TypeScript interfaces

server/
├── index.ts         # Hono API server, all /api/* routes
├── poller.ts        # Orchestrates polling cycles
├── sources/         # 19 API client modules
└── *Cache.ts        # Per-source cache + polling logic
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite + API server concurrently |
| `npm run build` | TypeScript check + Vite production build |
| `npm run server` | API server only |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

## Architecture

- Full-viewport Mapbox canvas with all UI as fixed overlays
- `key={activeView}` on `<Map>` forces clean remount on view switch
- Cyber network graph uses raw HTML canvas overlay
- Server polls 18+ data sources on independent intervals (5s–5min)
- AIS vessel data streams via WebSocket
- News geocoded in batches via Gemini AI
- Event feed caps items per layer to prevent data flooding
