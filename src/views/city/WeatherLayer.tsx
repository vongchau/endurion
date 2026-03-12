// src/views/city/WeatherLayer.tsx
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { WeatherAlert } from '../../types'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Props { alerts: WeatherAlert[] }

export function WeatherLayer({ alerts }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const withGeom = alerts.filter(a => a.geometry)
    if (withGeom.length === 0) return EMPTY_GEOJSON
    return {
      type: 'FeatureCollection',
      features: withGeom.map(a => ({
        type: 'Feature' as const,
        properties: { id: a.id, event: a.event, severity: a.severity },
        geometry: a.geometry!,
      })),
    }
  }, [alerts])

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
          'fill-opacity': 0.2,
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
          'line-opacity': 0.7,
          'line-dasharray': [4, 2],
        }}
      />
      <Layer
        id="weather-label"
        type="symbol"
        minzoom={5}
        layout={{
          'text-field': ['get', 'event'],
          'text-size': 11,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': '#ffaa00',
          'text-halo-color': '#050810',
          'text-halo-width': 1.5,
          'text-opacity': 0.9,
        }}
      />
    </Source>
  )
}
