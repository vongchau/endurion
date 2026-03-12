// src/views/city/PowerLayer.tsx
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { PowerOutage } from '../../types'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Props { outages: PowerOutage[] }

export function PowerLayer({ outages }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const withGeom = outages.filter(o => o.geometry)
    if (withGeom.length === 0) return EMPTY_GEOJSON
    return {
      type: 'FeatureCollection',
      features: withGeom.map(o => ({
        type: 'Feature' as const,
        properties: {
          id: o.id,
          county: o.county,
          customersAffected: o.customersAffected,
          utility: o.utility,
          cause: o.cause ?? '',
        },
        geometry: o.geometry!,
      })),
    }
  }, [outages])

  const maxAffected = Math.max(...outages.map(o => o.customersAffected), 1)

  return (
    <Source id="power-outages" type="geojson" data={geojson}>
      <Layer
        id="power-fill"
        type="fill"
        paint={{
          'fill-color': '#fbbf24',
          'fill-opacity': [
            'interpolate', ['linear'],
            ['get', 'customersAffected'],
            0, 0.05,
            maxAffected * 0.5, 0.2,
            maxAffected, 0.4,
          ],
        }}
      />
      <Layer
        id="power-line"
        type="line"
        paint={{
          'line-color': '#fbbf24',
          'line-width': 1,
          'line-opacity': 0.5,
        }}
      />
      <Layer
        id="power-label"
        type="symbol"
        minzoom={8}
        layout={{
          'text-field': ['concat', ['get', 'county'], '\n', ['to-string', ['get', 'customersAffected']], ' affected'],
          'text-size': 9,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': '#fbbf24',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
