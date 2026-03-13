// src/views/global/NewsLayer.tsx — clustered news markers on the globe
import { Source, Layer } from 'react-map-gl/mapbox'

interface NewsLayerProps {
  geoJSON: object | null
}

const CATEGORY_COLORS: Record<string, string> = {
  defense_security: '#ff2d2d',
  osint: '#ff2d2d',
  humanitarian: '#ffaa00',
  government: '#00d4ff',
  world_news: '#7b2fff',
  regional: '#7b2fff',
  economic: '#00ff88',
  tech: '#00ff88',
  think_tanks: '#4a6080',
  energy_resources: '#4a6080',
}

const EMPTY_GEOJSON = { type: 'FeatureCollection' as const, features: [] }

export function NewsLayer({ geoJSON }: NewsLayerProps) {
  return (
    <Source
      id="news-articles"
      type="geojson"
      data={(geoJSON as GeoJSON.FeatureCollection) ?? EMPTY_GEOJSON}
      cluster={true}
      clusterMaxZoom={14}
      clusterRadius={50}
    >
      {/* Cluster circles — clickable, shows all events in EntityPanel */}
      <Layer
        id="news-clusters"
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': '#7b2fff',
          'circle-opacity': 0.7,
          'circle-radius': [
            'step', ['get', 'point_count'],
            12,   // default
            10, 16,
            30, 22,
            50, 28,
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#7b2fff',
          'circle-stroke-opacity': 0.4,
        }}
      />

      {/* Cluster count labels */}
      <Layer
        id="news-cluster-count"
        type="symbol"
        filter={['has', 'point_count']}
        layout={{
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 10,
        }}
        paint={{
          'text-color': '#e0f0ff',
        }}
      />

      {/* Individual (unclustered) news markers */}
      <Layer
        id="news-points"
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-radius': 5,
          'circle-color': [
            'match', ['get', 'category'],
            ...Object.entries(CATEGORY_COLORS).flat(),
            '#7b2fff', // fallback
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#e0f0ff',
          'circle-stroke-opacity': 0.3,
        }}
      />
    </Source>
  )
}
