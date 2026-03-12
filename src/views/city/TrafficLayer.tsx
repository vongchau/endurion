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
            'match', ['get', 'severity'],
            1, '#00ff88',
            2, '#ffaa00',
            3, '#ff8c00',
            4, '#ff2d2d',
            '#4a6080',
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
          'text-color': '#ff2d2d',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.7,
        }}
      />
    </Source>
  )
}
