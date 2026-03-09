// src/views/global/VesselLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { AISVessel } from '../../types'

interface VesselLayerProps {
  vessels: AISVessel[]
}

export function VesselLayer({ vessels }: VesselLayerProps) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: vessels.map((v) => ({
      type: 'Feature' as const,
      properties: {
        mmsi:         v.mmsi,
        name:         v.name,
        speed:        v.speed,
        heading:      v.heading,
        shipType:     v.shipType,
        shipTypeName: v.shipTypeName,
        timestamp:    v.timestamp,
        isMilitary:   v.shipType === 35 || v.shipType === 55,
      },
      geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] },
    })),
  }

  return (
    <Source id="vessel-all" type="geojson" data={geojson}>
      <Layer
        id="vessel-points"
        type="circle"
        paint={{
          'circle-radius': [
            'case', ['get', 'isMilitary'], 5, 3,
          ],
          'circle-color': [
            'case', ['get', 'isMilitary'], '#00ff88', '#00d4ff',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-width': ['case', ['get', 'isMilitary'], 1, 0],
          'circle-stroke-color': '#00ff88',
        }}
      />
    </Source>
  )
}
