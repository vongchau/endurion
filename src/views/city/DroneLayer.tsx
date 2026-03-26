// src/views/city/DroneLayer.tsx
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { DroneFlight } from '../../types'

interface DroneLayerProps {
  drones: DroneFlight[]
}

export function DroneLayer({ drones }: DroneLayerProps) {
  const pointGeoJSON = useMemo(() => ({
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
  }), [drones])

  const trailGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: drones
      .filter((d) => d.trail && d.trail.length >= 2)
      .map((d) => ({
        type: 'Feature' as const,
        properties: {
          id: d.id,
          trailLength: d.trail.length,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: d.trail.map((p) => [p.lng, p.lat]),
        },
      })),
  }), [drones])

  return (
    <>
      {/* Flight path trails — rendered behind drone dots */}
      <Source id="drone-trails" type="geojson" data={trailGeoJSON}>
        <Layer
          id="drone-trail-lines"
          type="line"
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color': '#7b2fff',
            'line-opacity': 0.4,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 1,
              13, 2,
              16, 3,
            ],
          }}
        />
        {/* Brighter glow on top of the trail */}
        <Layer
          id="drone-trail-glow"
          type="line"
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color': '#7b2fff',
            'line-opacity': 0.15,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 4,
              13, 6,
              16, 10,
            ],
            'line-blur': 4,
          }}
        />
      </Source>

      {/* Drone position dots */}
      <Source id="drone-all" type="geojson" data={pointGeoJSON}>
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
    </>
  )
}
