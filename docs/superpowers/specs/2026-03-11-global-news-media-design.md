# Global News Media Layer — Design Spec

## Overview
Add an RSS news aggregation layer to the global view. Server polls ~70 curated RSS feeds, caches articles, optionally geocodes headlines via Gemini, and exposes them as both a filterable list and GeoJSON FeatureCollection. Frontend renders news in the EventFeedPanel and as clustered markers on the map.

## Server: `server/rssNewsCache.ts`

### Data Model
```typescript
type FeedCategory = 'world_news' | 'regional' | 'defense_security' | 'think_tanks' | 'government' | 'tech' | 'economic' | 'humanitarian' | 'osint' | 'energy_resources'
type FeedRegion = 'global' | 'americas' | 'europe' | 'mena' | 'asia' | 'africa' | 'russia_eurasia'
type NewsPriority = 'critical' | 'high' | 'medium' | 'low'

interface NewsArticle {
  id: string              // hash of link URL
  title: string
  link: string
  source: string
  category: FeedCategory
  region: FeedRegion
  pubDate: string
  timestamp: number
  description?: string
  priority: NewsPriority  // computed from category weight + keyword scan + recency
  latitude?: number
  longitude?: number
  locationName?: string
}
```

### Priority Scoring
- Category weights: `government`/`humanitarian`/`defense_security` = high base, `think_tanks`/`tech` = low base
- Keyword boost: crisis terms ("attack", "outbreak", "sanctions", "invasion", "missile", "explosion") bump +1 tier
- Recency: articles < 1h old get +1 tier

### RSS Feed List
Curated ~70 high-signal sources (trimmed from the original 100+ by removing redundant feeds). Grouped by category/region. Full list in implementation.

### Caching & Polling
- 5-minute cache TTL, background polling via `startNewsPoller()`
- Batch 15 feeds at a time with 500ms delay between batches
- Dedup by article link URL
- 7-day rolling window

### Gemini Geocoding (Optional)
- If `GEMINI_API_KEY` is set, batch-geocode headlines via `gemini-2.5-flash`
- 30 headlines per batch, cap at 500 per refresh cycle
- Cache geocode results by article link (never re-geocode same article)
- Graceful degradation: no API key = no geocoding, articles still render in feed

### API Endpoints (Hono)
- `GET /api/news` — filtered article list (query: `category`, `region`, `search`, `limit`, `offset`)
- `GET /api/news/geolocated` — GeoJSON FeatureCollection of geocoded articles (max 300)
- `GET /api/news/sources` — list of configured feed sources

## Frontend

### Types (`src/types/index.ts`)
- Add `NewsArticle` interface
- Add `'news'` to `GlobalLayer` union
- Add `'news'` to `Entity.type` union

### Store (`src/store/index.ts`)
- Add `'news'` to default `globalLayers` Set

### Hook: `src/hooks/useNews.ts`
- Pattern 1 polling (60s interval)
- Conditional on `enabled` flag
- Fetches `/api/news?limit=200` for feed, `/api/news/geolocated` for map
- Returns `{ articles, geoArticles, loading, lastUpdated }`

### EventFeedPanel Integration
- When `globalLayers.has('news')`, render news items in the global feed
- Mapped to standard feed item shape with category-colored badges
- Priority-sorted (critical → high → medium → low), then by timestamp
- Click → select entity → EntityPanel shows NewsDetail

### Category-to-Color Mapping
| Category | Color | Hex |
|----------|-------|-----|
| defense_security, osint | Red | #ff2d2d |
| humanitarian | Amber | #ffaa00 |
| government | Cyan | #00d4ff |
| world_news, regional | Purple | #7b2fff |
| economic, tech | Green | #00ff88 |
| think_tanks, energy_resources | Dim | #4a6080 |

### Map Layer: `src/views/global/NewsLayer.tsx`
- Mapbox `geojson` source with `cluster: true`
- Cluster circles: sized by point count, colored by dominant category
- Individual markers: small circles colored by category
- Click unclustered point → select entity → EntityPanel

### EntityPanel: `NewsDetail` component
- Source badge, category tag, region tag
- Headline, description, publish time
- Location (if geocoded)
- "OPEN SOURCE" link to original article

### LayerToggles
- Add NEWS button with purple (#7b2fff) color

## Environment
- Add `GEMINI_API_KEY=` to `.env.example`

## Dependencies
- Add `rss-parser` (npm) for RSS fetching
- Add `@google/genai` (npm) for optional Gemini geocoding
