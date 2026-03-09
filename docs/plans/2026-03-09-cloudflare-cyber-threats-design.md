# Cloudflare Threat Events — Cyber View Integration

## Overview

Replace the static mock data in the Cyber view with live threat intelligence from the Cloudflare Cloudforce One Threat Events API. Threat events become the sole data source for the network graph, with attackers as primary nodes, target industries as asset nodes, and individual events as burst clusters.

## Architecture: Server-Side Proxy with Poller

Follows the established pattern (USGS, NOAA, AIS): server polls external API, caches transformed data, exposes REST endpoint to frontend.

### Server Pipeline

**New file: `server/sources/cloudflare.ts`**

Poller (30s interval) calls two Cloudflare endpoints:
- `GET /accounts/{account_id}/cloudforce-one/events` — threat events
- `GET /accounts/{account_id}/cloudforce-one/events/attackers` — attacker enrichment

Authentication: `Authorization: Bearer ${CF_API_KEY}` header.

**Transformation: Cloudflare Events → CyberGraph**

| Cloudflare field    | Graph mapping                                                                 |
|---------------------|-------------------------------------------------------------------------------|
| `attacker`          | Primary node, type `actor`, geo-positioned by `attackerCountry` centroid      |
| `targetIndustry`    | Primary node, type `asset`, positioned in ring around map center              |
| `category` + tags   | Edge connecting attacker → target, `protocol` = category name                 |
| Individual events   | Burst nodes, type `cluster`, clustered around parent attacker (±0.5° offset)  |
| Event severity      | Maps to `threatScore` on nodes and edges                                      |

**Country → coordinates:** Lightweight lookup table (~200 entries) mapping ISO country codes to centroid lat/lng. Multiple attackers in same country fan out in a circle (radius ~2°).

**Cache:** In-memory `CyberGraph` object, replaced each poll cycle.

**New route:** `GET /api/cyber/graph` — returns cached CyberGraph JSON.

### Environment Variables

```
CF_API_KEY=<cloudflare-api-key>
CF_ACCOUNT_ID=<cloudflare-account-id>
```

Stored in `.env.local`, accessed server-side only (no `VITE_` prefix).

## Frontend Integration

### New hook: `src/hooks/useCyberGraph.ts`

- Fetches `GET /api/cyber/graph` on mount + every 30s
- Returns `{ graph: CyberGraph | null, loading: boolean, error: string | null }`

### CyberLayer.tsx changes

- Replace static `cyberGraph` import with `useCyberGraph()` hook
- Handle loading state: rotating scan-line with "SYNCING THREAT FEED..."
- Handle empty state: grid overlay with "NO ACTIVE THREATS DETECTED"
- Burst nodes rendered at 5x5px (smaller than primary 8-10px nodes)

### EventFeedPanel changes

- Cyber feed shows: `CRIT [PHISHING] APT-29 → Financial Services → 92 threat`
- Click feed item → select corresponding node

### EntityPanel changes

- Actor nodes: attacker name, country, event count, top categories
- Asset nodes: industry, number of targeting actors
- Burst nodes: individual event details, category, tags

### Type extensions

```typescript
export interface CyberNode {
  id: string
  lat: number
  lng: number
  label: string
  type: 'actor' | 'asset' | 'cluster' | 'compromised'
  threatScore: number
  country?: string
  category?: string
  targetIndustry?: string
  eventCount?: number
  tags?: string[]
}
```

### File cleanup

Delete `src/data/cyber-graph.ts` (mock data replaced by live feed).

## Graph Layout & Visual Hierarchy

### Node positioning

- **Actors:** Country centroid coordinates. Multiple actors per country fan out in a circle.
- **Assets (target industries):** Ring around the centroid of all attacker positions.
- **Burst nodes:** Tight cluster around parent attacker (±0.5° random offset).

### Visual differentiation

| Node type   | Size   | Color             | Label              |
|-------------|--------|-------------------|--------------------|
| Actor       | 10x10  | Red `#ff2d2d`     | Attacker name      |
| Asset       | 8x8    | Cyan `#00d4ff`    | Industry name      |
| Burst       | 5x5    | Purple `#7b2fff`  | Category shortcode |
| Compromised | 6x6    | Amber `#ffaa00`   | Event ID fragment  |

### Edge animation

- Actor → Target: 2px thick, high opacity, animated dots
- Actor → Burst: 1px thin, low opacity, subtle pulse
- Color by threatScore: red > 80, amber > 60, cyan otherwise

### Loading/empty states

- Loading: slow rotating scan-line effect, "SYNCING THREAT FEED..."
- Empty: static grid overlay, "NO ACTIVE THREATS DETECTED"
