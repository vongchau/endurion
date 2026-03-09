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
        course:       v.course,
        heading:      v.heading,
        shipType:     v.shipType,
        shipTypeName: v.shipTypeName,
        destination:  v.destination,
        callSign:     v.callSign,
        imo:          v.imo,
        draught:      v.draught,
        eta:          v.eta,
        lengthOverall: v.lengthOverall,
        beam:         v.beam,
        timestamp:    v.timestamp,
        isMilitary:   v.shipType === 35 || v.shipType === 55,
      },
      geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] },
    })),
  }

  return (
    <Source id="vessel-all" type="geojson" data={geojson}>
      {/* Vessel dots — radius scales with zoom level */}
      <Layer
        id="vessel-points"
        type="circle"
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            2, ['case', ['get', 'isMilitary'], 3, 2],
            5, ['case', ['get', 'isMilitary'], 5, 4],
            8, ['case', ['get', 'isMilitary'], 8, 6],
          ],
          'circle-color': [
            'case', ['get', 'isMilitary'], '#00ff88', '#00d4ff',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-width': ['case', ['get', 'isMilitary'], 1, 0],
          'circle-stroke-color': '#00ff88',
        }}
      />
      {/* Vessel name labels — only show when zoomed in close */}
      <Layer
        id="vessel-labels"
        type="symbol"
        minzoom={6}
        layout={{
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#e0f0ff',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
