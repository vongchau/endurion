// src/views/city/TrafficLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { TrafficIncident } from '../../types'

interface Props { incidents: TrafficIncident[] }

export function TrafficLayer({ incidents }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: incidents.map(i => ({
      type: 'Feature' as const,
      properties: {
        id: i.id,
        category: i.category,
        severity: i.severity,
        description: i.description,
        delay: i.delay,
      },
      geometry: { type: 'Point' as const, coordinates: [i.lng, i.lat] },
    })),
  }

  return (
    <Source id="traffic-incidents" type="geojson" data={geojson}>
      <Layer
        id="traffic-points"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 13, 7, 16, 12],
          'circle-color': [
            'match', ['get', 'category'],
            'accident',    '#ff2d2d',   // red
            'congestion',  '#ffaa00',   // amber
            'roadClosed',  '#ff4080',   // magenta-pink
            'roadWorks',   '#7b2fff',   // purple
            'weather',     '#00d4ff',   // cyan
            '#4a6080',                  // other — dim
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#050810',
        }}
      />
      <Layer
        id="traffic-labels"
        type="symbol"
        minzoom={12}
        layout={{
          'text-field': ['get', 'category'],
          'text-size': 8,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-transform': 'uppercase',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': [
            'match', ['get', 'category'],
            'accident',    '#ff2d2d',
            'congestion',  '#ffaa00',
            'roadClosed',  '#ff4080',
            'roadWorks',   '#7b2fff',
            'weather',     '#00d4ff',
            '#4a6080',
          ],
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.7,
        }}
      />
    </Source>
  )
}
