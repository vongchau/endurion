// src/views/space/SpaceLayer.tsx
import { useEffect, useCallback } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { CircleLayerSpecification, MapMouseEvent } from 'mapbox-gl'
import { useHUDStore } from '../../store'
import { useSatellites } from './useSatellites'
import type { Satellite } from '../../types'

const CIRCLE_LAYER: CircleLayerSpecification = {
  id: 'satellites-layer',
  type: 'circle',
  source: 'satellites',
  paint: {
    'circle-radius': 3,
    'circle-color': '#00d4ff',
    'circle-opacity': 0.7,
    'circle-stroke-width': 0.5,
    'circle-stroke-color': '#00d4ff',
    'circle-stroke-opacity': 0.4,
  },
}

// Invisible wider hit area for easier clicking
const HIT_LAYER: CircleLayerSpecification = {
  id: 'satellites-hit',
  type: 'circle',
  source: 'satellites',
  paint: {
    'circle-radius': 10,
    'circle-opacity': 0,
    'circle-stroke-width': 0,
  },
}

function ISSMarker({ sat }: { sat: Satellite }) {
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  return (
    <Marker longitude={sat.lng} latitude={sat.lat} anchor="center">
      <button
        onClick={() => {
          setSelectedEntity({ type: 'satellite', data: sat })
          setPanelVisible('entity', true)
        }}
        className="relative flex items-center justify-center w-10 h-10"
        title="ISS"
      >
        {/* Pulse ring */}
        <span className="absolute w-10 h-10 rounded-full animate-ping opacity-30 bg-hud-amber" />
        {/* Core */}
        <span
          className="relative w-4 h-4 rounded-full border-2 border-hud-amber flex items-center justify-center"
          style={{ backgroundColor: '#ffaa0033', boxShadow: '0 0 8px #ffaa00' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-hud-amber" />
        </span>
      </button>
    </Marker>
  )
}

export function SpaceLayer() {
  const { current: map } = useMap()
  const { iss, geojson, loading, usingMockData } = useSatellites()
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const handleClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['satellites-hit'] })
    if (features.length === 0) return

    const props = features[0].properties
    if (!props) return

    const sat: Satellite = {
      id: props.id,
      name: props.name,
      lat: props.lat,
      lng: props.lng,
      altitude: props.altitude,
      velocity: props.velocity,
      inclination: props.inclination,
      type: props.type,
    }

    setSelectedEntity({ type: 'satellite', data: sat })
    setPanelVisible('entity', true)
  }, [map, setSelectedEntity, setPanelVisible])

  // Pointer cursor on hover
  const handleMouseEnter = useCallback(() => {
    if (map) map.getCanvas().style.cursor = 'pointer'
  }, [map])

  const handleMouseLeave = useCallback(() => {
    if (map) map.getCanvas().style.cursor = ''
  }, [map])

  useEffect(() => {
    if (!map) return
    map.on('click', 'satellites-hit', handleClick)
    map.on('mouseenter', 'satellites-hit', handleMouseEnter)
    map.on('mouseleave', 'satellites-hit', handleMouseLeave)
    return () => {
      map.off('click', 'satellites-hit', handleClick)
      map.off('mouseenter', 'satellites-hit', handleMouseEnter)
      map.off('mouseleave', 'satellites-hit', handleMouseLeave)
    }
  }, [map, handleClick, handleMouseEnter, handleMouseLeave])

  if (loading) return null

  return (
    <>
      {usingMockData && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 mt-2 px-3 py-1 rounded border border-hud-amber/40 bg-hud-panel/80 font-mono text-[10px] text-hud-amber"
          style={{ pointerEvents: 'none' }}
        >
          CELESTRAK UNREACHABLE — SHOWING MOCK DATA
        </div>
      )}

      <Source id="satellites" type="geojson" data={geojson}>
        <Layer {...CIRCLE_LAYER} />
        <Layer {...HIT_LAYER} />
      </Source>

      {iss && <ISSMarker sat={iss} />}
    </>
  )
}
