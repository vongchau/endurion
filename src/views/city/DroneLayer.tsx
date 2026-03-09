// src/views/city/DroneLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { DroneFlight } from '../../types'

interface DroneLayerProps {
  drones: DroneFlight[]
}

export function DroneLayer({ drones }: DroneLayerProps) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: drones.map((d) => ({
      type: 'Feature' as const,
      properties: {
        id:            d.id,
        sensorId:      d.sensorId,
        altitude:      d.altitude,
        speed:         d.speed,
        verticalSpeed: d.verticalSpeed,
        heading:       d.heading,
        state:         d.state,
        timestamp:     d.timestamp,
        altLabel:      `${Math.round(d.altitude)}m`,
      },
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] },
    })),
  }

  return (
    <Source id="drone-all" type="geojson" data={geojson}>
      {/* Drone dots — purple, radius scales with zoom */}
      <Layer
        id="drone-points"
        type="circle"
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 4,
            13, 6,
            16, 10,
          ],
          'circle-color': '#7b2fff',
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#7b2fff',
        }}
      />
      {/* Altitude labels — only at high zoom */}
      <Layer
        id="drone-labels"
        type="symbol"
        minzoom={13}
        layout={{
          'text-field': ['get', 'altLabel'],
          'text-size': 9,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#7b2fff',
          'text-halo-color': '#050810',
          'text-halo-width': 1,
          'text-opacity': 0.8,
        }}
      />
    </Source>
  )
}
