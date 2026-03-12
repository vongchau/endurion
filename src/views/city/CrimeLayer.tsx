// src/views/city/CrimeLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { CrimeIncident } from '../../types'

interface Props { incidents: CrimeIncident[] }

export function CrimeLayer({ incidents }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: incidents.map(i => ({
      type: 'Feature' as const,
      properties: { id: i.id, type: i.type, severity: i.severity, city: i.city },
      geometry: { type: 'Point' as const, coordinates: [i.lng, i.lat] },
    })),
  }

  return (
    <Source id="crime-incidents" type="geojson" data={geojson}>
      <Layer
        id="crime-points"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 13, 5, 16, 8],
          'circle-color': [
            'match', ['get', 'severity'],
            'violent', '#ff2d2d',
            'property', '#ffaa00',
            'other', '#4a6080',
            '#4a6080',
          ],
          'circle-opacity': 0.7,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#050810',
        }}
      />
      <Layer
        id="crime-labels"
        type="symbol"
        minzoom={14}
        layout={{
          'text-field': ['get', 'type'],
          'text-size': 8,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ff6b35',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.7,
        }}
      />
    </Source>
  )
}
