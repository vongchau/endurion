// src/views/city/AirspaceZoneLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { AirspaceZone } from '../../hooks/useAirspaceZones'

interface Props {
  zones: AirspaceZone[]
}

export function AirspaceZoneLayer({ zones }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: zones.filter((z) => z.geometry),
  }

  return (
    <Source id="airspace-zones" type="geojson" data={geojson}>
      {/* Fill layer */}
      <Layer
        id="airspace-zone-fill"
        type="fill"
        paint={{
          'fill-color': [
            'match', ['get', 'zoneType'],
            'prohibited', '#ff2d2d',
            'restricted', '#ffaa00',
            'controlled', '#00d4ff',
            '#4a6080',
          ],
          'fill-opacity': 0.08,
        }}
      />
      {/* Border layer */}
      <Layer
        id="airspace-zone-line"
        type="line"
        paint={{
          'line-color': [
            'match', ['get', 'zoneType'],
            'prohibited', '#ff2d2d',
            'restricted', '#ffaa00',
            'controlled', '#00d4ff',
            '#4a6080',
          ],
          'line-width': 1,
          'line-opacity': 0.4,
          'line-dasharray': [2, 2],
        }}
      />
      {/* Labels at higher zoom */}
      <Layer
        id="airspace-zone-label"
        type="symbol"
        minzoom={9}
        layout={{
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-allow-overlap': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': [
            'match', ['get', 'zoneType'],
            'prohibited', '#ff2d2d',
            'restricted', '#ffaa00',
            'controlled', '#00d4ff',
            '#4a6080',
          ],
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.6,
        }}
      />
    </Source>
  )
}
