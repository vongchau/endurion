// src/views/city/WeatherLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { WeatherAlert } from '../../types'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Props { alerts: WeatherAlert[] }

export function WeatherLayer({ alerts }: Props) {
  const geojson: GeoJSON.FeatureCollection = alerts.length === 0 ? EMPTY_GEOJSON : {
    type: 'FeatureCollection',
    features: alerts
      .filter(a => a.geometry)
      .map(a => ({
        type: 'Feature' as const,
        properties: { id: a.id, event: a.event, severity: a.severity },
        geometry: a.geometry!,
      })),
  }

  return (
    <Source id="weather-alerts" type="geojson" data={geojson}>
      <Layer
        id="weather-fill"
        type="fill"
        paint={{
          'fill-color': [
            'match', ['get', 'severity'],
            'extreme', '#ff2d2d',
            'severe', '#ff8c00',
            'moderate', '#ffaa00',
            'minor', '#00d4ff',
            '#4a6080',
          ],
          'fill-opacity': 0.15,
        }}
      />
      <Layer
        id="weather-line"
        type="line"
        paint={{
          'line-color': [
            'match', ['get', 'severity'],
            'extreme', '#ff2d2d',
            'severe', '#ff8c00',
            'moderate', '#ffaa00',
            'minor', '#00d4ff',
            '#4a6080',
          ],
          'line-width': 2,
          'line-opacity': 0.6,
          'line-dasharray': [4, 2],
        }}
      />
      <Layer
        id="weather-label"
        type="symbol"
        minzoom={8}
        layout={{
          'text-field': ['get', 'event'],
          'text-size': 10,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': '#ffaa00',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
