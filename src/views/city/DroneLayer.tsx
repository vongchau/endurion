// src/views/city/DroneLayer.tsx — tactical UAS visualization
import { useMemo, useEffect } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/mapbox'
import type { DroneFlight } from '../../types'
import { droneTrailsRef } from '../../droneTrails'
import { useHUDStore } from '../../store'

// Altitude color bands (meters)
// green: <50m | cyan: 50-120m | amber: 120-200m | red: >200m (above FAA 400ft limit)
const ALT_COLOR_EXPR: mapboxgl.Expression = [
  'interpolate', ['linear'], ['get', 'altitude'],
  0,   '#00ff88',
  50,  '#00ff88',
  51,  '#00d4ff',
  120, '#00d4ff',
  121, '#ffaa00',
  200, '#ffaa00',
  201, '#ff2d2d',
]

// Speed color for trail segments (m/s)
// dim: <2 (hovering) | purple: 2-10 | cyan: 10-20 | amber: 20-30 | red: >30
const SPEED_COLOR_EXPR: mapboxgl.Expression = [
  'interpolate', ['linear'], ['get', 'speed'],
  0,  '#4a6080',
  2,  '#7b2fff',
  10, '#00d4ff',
  20, '#ffaa00',
  30, '#ff2d2d',
]

interface DroneLayerProps {
  drones: DroneFlight[]
}

export function DroneLayer({ drones }: DroneLayerProps) {
  const scrubPoint = useHUDStore((s) => s.droneScrubPoint)
  const historyTrail = useHUDStore((s) => s.droneHistoryTrail)

  // Sync trail data to shared ref so MapCanvas can read it on click
  useEffect(() => {
    droneTrailsRef.clear()
    for (const d of drones) {
      if (d.trail && d.trail.length > 0) {
        droneTrailsRef.set(d.id, d.trail)
      }
    }
  }, [drones])

  // --- Drone position points ---
  const pointGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: drones.map((d) => {
      const isGrounded = d.state === 'grounded' || d.altitude < 2
      return {
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
          isGrounded:    isGrounded ? 1 : 0,
          altLabel:      `${Math.round(d.altitude)}m · ${d.speed.toFixed(1)}m/s`,
        },
        geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] },
      }
    }),
  }), [drones])

  // --- Trail segments (2-point lines with per-segment properties) ---
  const trailGeoJSON = useMemo(() => {
    const features: GeoJSON.Feature[] = []

    for (const d of drones) {
      if (!d.trail || d.trail.length < 2) continue
      const totalPts = d.trail.length

      for (let i = 0; i < totalPts - 1; i++) {
        const p0 = d.trail[i]
        const p1 = d.trail[i + 1]
        // Recency: 0 = oldest segment, 1 = most recent
        const recency = (i + 1) / (totalPts - 1)
        // Use average speed between points (approximate from distance/time)
        const dt = (p1.timestamp - p0.timestamp) / 1000
        const dlng = (p1.lng - p0.lng) * 111320 * Math.cos(p0.lat * Math.PI / 180)
        const dlat = (p1.lat - p0.lat) * 110540
        const dist = Math.sqrt(dlng * dlng + dlat * dlat)
        const segSpeed = dt > 0 ? dist / dt : d.speed

        features.push({
          type: 'Feature',
          properties: {
            droneId: d.id,
            speed: segSpeed,
            altitude: d.altitude,
            recency,
          },
          geometry: {
            type: 'LineString',
            coordinates: [[p0.lng, p0.lat], [p1.lng, p1.lat]],
          },
        })
      }
    }

    return { type: 'FeatureCollection' as const, features }
  }, [drones])

  // --- Extended history trail (from SQLite, aligned with chart) ---
  const historyGeoJSON = useMemo(() => {
    if (historyTrail.length < 2) return { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] }
    const features: GeoJSON.Feature[] = []
    for (let i = 0; i < historyTrail.length - 1; i++) {
      const p0 = historyTrail[i]
      const p1 = historyTrail[i + 1]
      const recency = (i + 1) / (historyTrail.length - 1)
      features.push({
        type: 'Feature',
        properties: { speed: p1.speed, recency },
        geometry: {
          type: 'LineString',
          coordinates: [[p0.lng, p0.lat], [p1.lng, p1.lat]],
        },
      })
    }
    return { type: 'FeatureCollection' as const, features }
  }, [historyTrail])

  return (
    <>
      {/* === EXTENDED HISTORY TRAIL (from SQLite, shown when drone is selected) === */}
      {historyTrail.length >= 2 && (
        <Source id="drone-history-trail" type="geojson" data={historyGeoJSON}>
          <Layer
            id="drone-history-glow"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': SPEED_COLOR_EXPR,
              'line-opacity': ['interpolate', ['linear'], ['get', 'recency'], 0, 0.01, 1, 0.1],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 13, 4, 16, 6],
              'line-blur': 3,
            }}
          />
          <Layer
            id="drone-history-lines"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': SPEED_COLOR_EXPR,
              'line-opacity': ['interpolate', ['linear'], ['get', 'recency'], 0, 0.05, 1, 0.5],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 1.5, 16, 2.5],
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
      )}

      {/* === LIVE TRAIL SEGMENTS === */}
      <Source id="drone-trail-segments" type="geojson" data={trailGeoJSON}>
        {/* Trail glow (wide, blurred, behind) */}
        <Layer
          id="drone-trail-glow"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': SPEED_COLOR_EXPR,
            'line-opacity': ['interpolate', ['linear'], ['get', 'recency'], 0, 0.02, 1, 0.15],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 3,
              13, 5,
              16, 8,
            ],
            'line-blur': 4,
          }}
        />
        {/* Trail line (crisp, speed-colored, recency-faded) */}
        <Layer
          id="drone-trail-lines"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': SPEED_COLOR_EXPR,
            'line-opacity': ['interpolate', ['linear'], ['get', 'recency'], 0, 0.1, 1, 0.7],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, ['interpolate', ['linear'], ['get', 'altitude'], 0, 1, 200, 1.5],
              13, ['interpolate', ['linear'], ['get', 'altitude'], 0, 1.5, 200, 3],
              16, ['interpolate', ['linear'], ['get', 'altitude'], 0, 2, 200, 5],
            ],
          }}
        />
      </Source>

      {/* === DRONE MARKERS === */}
      <Source id="drone-all" type="geojson" data={pointGeoJSON}>
        {/* Speed glow ring — larger radius for fast drones, invisible for slow */}
        <Layer
          id="drone-speed-glow"
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'speed'],
              0, 0,
              5, 0,
              10, ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 16],
              30, ['interpolate', ['linear'], ['zoom'], 10, 14, 16, 24],
            ],
            'circle-color': ALT_COLOR_EXPR,
            'circle-opacity': ['interpolate', ['linear'], ['get', 'speed'], 0, 0, 5, 0, 10, 0.12, 30, 0.25],
            'circle-blur': 1,
          }}
        />

        {/* Base dot — colored by altitude, visible at all zooms as click target */}
        <Layer
          id="drone-points"
          type="circle"
          paint={{
            'circle-radius': [
              'case',
              ['==', ['get', 'isGrounded'], 1],
              ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 3, 13, 4, 16, 5],
              ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 5, 13, 7, 16, 10],
            ],
            'circle-color': ALT_COLOR_EXPR,
            'circle-opacity': [
              'case',
              ['==', ['get', 'isGrounded'], 1],
              0.3,
              0.9,
            ],
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'isGrounded'], 1],
              1.5,
              0,
            ],
            'circle-stroke-color': ALT_COLOR_EXPR,
          }}
        />

        {/* Directional arrow — altitude-colored, rotated by heading, airborne only */}
        <Layer
          id="drone-direction"
          type="symbol"
          filter={['==', ['get', 'isGrounded'], 0]}
          layout={{
            'text-field': '▲',
            'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 14, 13, 18, 16, 24],
            'text-rotate': ['get', 'heading'],
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{
            'text-color': ALT_COLOR_EXPR,
            'text-opacity': 0.9,
            'text-halo-color': '#050810',
            'text-halo-width': 1,
          }}
        />

        {/* Grounded indicator — square symbol, altitude-colored */}
        <Layer
          id="drone-grounded-icon"
          type="symbol"
          filter={['==', ['get', 'isGrounded'], 1]}
          layout={{
            'text-field': '■',
            'text-size': ['interpolate', ['linear'], ['zoom'], 3, 8, 10, 10, 13, 14, 16, 18],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{
            'text-color': ALT_COLOR_EXPR,
            'text-opacity': 0.6,
            'text-halo-color': '#050810',
            'text-halo-width': 1,
          }}
        />

        {/* Info label — altitude + speed at high zoom */}
        <Layer
          id="drone-labels"
          type="symbol"
          minzoom={13}
          layout={{
            'text-field': ['get', 'altLabel'],
            'text-size': 9,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
            'text-optional': true,
            'text-allow-overlap': false,
          }}
          paint={{
            'text-color': ALT_COLOR_EXPR,
            'text-halo-color': '#050810',
            'text-halo-width': 1,
            'text-opacity': 0.8,
          }}
        />
      </Source>

      {/* Telemetry scrub marker — shown when hovering the altitude/speed chart */}
      {scrubPoint && (
        <Marker longitude={scrubPoint.lng} latitude={scrubPoint.lat} anchor="center">
          <div className="relative flex items-center justify-center">
            {/* Outer pulse ring */}
            <span className="absolute w-8 h-8 rounded-full border-2 border-hud-amber animate-ping opacity-30" />
            {/* Inner marker */}
            <span
              className="relative w-3 h-3 rounded-full border-2"
              style={{
                borderColor: '#ffaa00',
                backgroundColor: '#ffaa0040',
                boxShadow: '0 0 10px #ffaa00, 0 0 20px #ffaa0060',
              }}
            />
            {/* Label */}
            <span className="absolute -top-5 whitespace-nowrap font-mono text-[8px] tracking-wider text-hud-amber bg-hud-panel/80 px-1 rounded">
              {scrubPoint.altitude}m · {scrubPoint.speed}m/s
            </span>
          </div>
        </Marker>
      )}
    </>
  )
}
