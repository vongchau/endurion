// src/views/space/SpaceLayer.tsx
import { useEffect, useCallback, useMemo, useState, useRef } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type {
  CircleLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  FillLayerSpecification,
  MapMouseEvent,
} from 'mapbox-gl'
import * as satellite from 'satellite.js'
import { useHUDStore } from '../../store'
import { useSatellites, computeOrbitTrack } from './useSatellites'
import { useOverpasses } from './useOverpasses'
import { GROUND_STATIONS } from './groundStations'
import type { Satellite } from '../../types'

// --- Layer specs ---

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

const HIT_LAYER: CircleLayerSpecification = {
  id: 'satellites-hit',
  type: 'circle',
  source: 'satellites',
  paint: { 'circle-radius': 10, 'circle-opacity': 0, 'circle-stroke-width': 0 },
}

const ORBIT_TRACK_LAYER: LineLayerSpecification = {
  id: 'orbit-track',
  type: 'line',
  source: 'orbit-track',
  paint: {
    'line-color': '#00d4ff',
    'line-width': 1.5,
    'line-opacity': 0.6,
    'line-dasharray': [4, 3],
  },
}

// Overpass tracks: data-driven opacity from feature properties
const OVERPASS_TRACK_LAYER: LineLayerSpecification = {
  id: 'overpass-tracks',
  type: 'line',
  source: 'overpass-tracks',
  paint: {
    'line-color': ['case', ['==', ['get', 'highlighted'], 1], '#ffffff', '#00ff88'] as any,
    'line-width': ['case', ['==', ['get', 'highlighted'], 1], 3.5, 2] as any,
    'line-opacity': ['get', 'opacity'] as any,
  },
}

const OVERPASS_LABEL_LAYER: SymbolLayerSpecification = {
  id: 'overpass-labels',
  type: 'symbol',
  source: 'overpass-tracks',
  layout: {
    'symbol-placement': 'line-center',
    'text-field': ['get', 'label'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    'text-size': 9,
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-anchor': 'bottom',
    'text-offset': [0, -0.8],
  },
  paint: {
    'text-color': '#00ff88',
    'text-halo-color': '#050810',
    'text-halo-width': 1.5,
    'text-opacity': 0.85,
  },
}

// Ground station visibility footprints
const FOOTPRINT_LAYER: FillLayerSpecification = {
  id: 'station-footprints',
  type: 'fill',
  source: 'station-footprints',
  paint: {
    'fill-color': '#00ff88',
    'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.08, 0.03] as any,
  },
}

const FOOTPRINT_BORDER_LAYER: LineLayerSpecification = {
  id: 'station-footprint-borders',
  type: 'line',
  source: 'station-footprints',
  paint: {
    'line-color': '#00ff88',
    'line-width': 0.5,
    'line-opacity': ['case', ['==', ['get', 'selected'], 1], 0.4, 0.15] as any,
    'line-dasharray': [3, 3],
  },
}

const EMPTY_TRACK: GeoJSON.Feature<GeoJSON.MultiLineString> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'MultiLineString', coordinates: [] },
}

const EMPTY_POINT: GeoJSON.Feature<GeoJSON.Point> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Point', coordinates: [0, 0] },
}

// --- Components ---

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
        <span className="absolute w-10 h-10 rounded-full animate-ping opacity-30 bg-hud-amber" />
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

/** Animated dot showing future satellite position traveling along the orbit track. */
function usePlayhead(
  satrec: satellite.SatRec | null,
  active: boolean,
): GeoJSON.Feature<GeoJSON.Point> {
  const [point, setPoint] = useState(EMPTY_POINT)
  const rafRef = useRef(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!active || !satrec) {
      setPoint(EMPTY_POINT)
      return
    }

    startRef.current = Date.now()

    const animate = () => {
      // Cycle through +45 min of future positions over a 10-second animation loop
      const elapsed = (Date.now() - startRef.current) % 10_000
      const progress = elapsed / 10_000
      const offsetMin = progress * 45 // 0 → 45 min ahead

      const t = new Date(Date.now() + offsetMin * 60_000)
      const gmst = satellite.gstime(t)
      try {
        const pv = satellite.propagate(satrec!, t)
        if (pv && pv.position && typeof pv.position !== 'boolean') {
          const pos = pv.position as satellite.EciVec3<number>
          const geo = satellite.eciToGeodetic(pos, gmst)
          const lat = satellite.degreesLat(geo.latitude)
          const lng = satellite.degreesLong(geo.longitude)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setPoint({
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [lng, lat] },
            })
          }
        }
      } catch { /* skip */ }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, satrec])

  return point
}

const PLAYHEAD_LAYER: CircleLayerSpecification = {
  id: 'orbit-playhead',
  type: 'circle',
  source: 'orbit-playhead',
  paint: {
    'circle-radius': 5,
    'circle-color': '#00d4ff',
    'circle-opacity': 0.9,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-opacity': 0.6,
  },
}

// --- Main component ---

export function SpaceLayer() {
  const { current: map } = useMap()
  const { iss, geojson, loading, usingMockData, satrecEntries } = useSatellites()
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const selectedEntity = useHUDStore((s) => s.selectedEntity)
  const selectedStationId = useHUDStore((s) => s.selectedStationId)
  const setSelectedStationId = useHUDStore((s) => s.setSelectedStationId)
  const hoveredOverpassIdx = useHUDStore((s) => s.hoveredOverpassIdx)
  const setHoveredOverpassIdx = useHUDStore((s) => s.setHoveredOverpassIdx)

  const isSatSelected = selectedEntity?.type === 'satellite'
  const selectedSatId = isSatSelected ? (selectedEntity.data as Satellite).id : null

  // Compute overpasses with station filter + hover highlight
  const { tracksGeoJSON, footprintsGeoJSON } = useOverpasses(
    selectedSatId, satrecEntries, selectedStationId, hoveredOverpassIdx,
  )

  // Orbit track
  const orbitTrack = useMemo(() => {
    if (!isSatSelected) return EMPTY_TRACK
    const sat = selectedEntity.data as Satellite
    const entry = satrecEntries.find(e => e.id === sat.id)
    if (!entry) return EMPTY_TRACK
    return computeOrbitTrack(entry.satrec) ?? EMPTY_TRACK
  }, [selectedEntity, isSatSelected, satrecEntries])

  // Animated playhead
  const playheadSatrec = useMemo(() => {
    if (!selectedSatId) return null
    return satrecEntries.find(e => e.id === selectedSatId)?.satrec ?? null
  }, [selectedSatId, satrecEntries])
  const playheadPoint = usePlayhead(playheadSatrec, isSatSelected)

  // --- Map event handlers ---

  const handleSatelliteClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['satellites-hit'] })
    if (features.length === 0) return
    const props = features[0].properties
    if (!props) return
    const sat: Satellite = {
      id: props.id, name: props.name, lat: props.lat, lng: props.lng,
      altitude: props.altitude, velocity: props.velocity,
      inclination: props.inclination, type: props.type,
    }
    setSelectedEntity({ type: 'satellite', data: sat })
    setPanelVisible('entity', true)
  }, [map, setSelectedEntity, setPanelVisible])

  // Hover overpass track segments
  const handleOverpassHover = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['overpass-tracks'] })
    if (features.length > 0 && features[0].properties) {
      setHoveredOverpassIdx(features[0].properties.idx as number)
      map.getCanvas().style.cursor = 'pointer'
    }
  }, [map, setHoveredOverpassIdx])

  const handleOverpassLeave = useCallback(() => {
    setHoveredOverpassIdx(null)
    if (map) map.getCanvas().style.cursor = ''
  }, [map, setHoveredOverpassIdx])

  // Click empty space to clear selection
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const hits = map.queryRenderedFeatures(e.point, {
      layers: ['satellites-hit', 'overpass-tracks'],
    })
    if (hits.length === 0) {
      setSelectedEntity(null)
      setPanelVisible('entity', false)
      setSelectedStationId(null)
    }
  }, [map, setSelectedEntity, setPanelVisible, setSelectedStationId])

  // Pointer cursor on satellite hover
  const handleMouseEnter = useCallback(() => {
    if (map) map.getCanvas().style.cursor = 'pointer'
  }, [map])
  const handleMouseLeave = useCallback(() => {
    if (map) map.getCanvas().style.cursor = ''
  }, [map])

  useEffect(() => {
    if (!map) return
    map.on('click', 'satellites-hit', handleSatelliteClick)
    map.on('click', handleMapClick)
    map.on('mouseenter', 'satellites-hit', handleMouseEnter)
    map.on('mouseleave', 'satellites-hit', handleMouseLeave)
    map.on('mousemove', 'overpass-tracks', handleOverpassHover)
    map.on('mouseleave', 'overpass-tracks', handleOverpassLeave)
    return () => {
      map.off('click', 'satellites-hit', handleSatelliteClick)
      map.off('click', handleMapClick)
      map.off('mouseenter', 'satellites-hit', handleMouseEnter)
      map.off('mouseleave', 'satellites-hit', handleMouseLeave)
      map.off('mousemove', 'overpass-tracks', handleOverpassHover)
      map.off('mouseleave', 'overpass-tracks', handleOverpassLeave)
    }
  }, [map, handleSatelliteClick, handleMapClick, handleMouseEnter, handleMouseLeave, handleOverpassHover, handleOverpassLeave])

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

      {/* Ground station visibility footprints */}
      <Source id="station-footprints" type="geojson" data={footprintsGeoJSON}>
        <Layer {...FOOTPRINT_LAYER} />
        <Layer {...FOOTPRINT_BORDER_LAYER} />
      </Source>

      <Source id="satellites" type="geojson" data={geojson}>
        <Layer {...CIRCLE_LAYER} />
        <Layer {...HIT_LAYER} />
      </Source>

      {iss && <ISSMarker sat={iss} />}

      {/* Orbit track for selected satellite */}
      <Source id="orbit-track" type="geojson" data={orbitTrack}>
        <Layer {...ORBIT_TRACK_LAYER} />
      </Source>

      {/* Animated playhead dot */}
      <Source id="orbit-playhead" type="geojson" data={playheadPoint}>
        <Layer {...PLAYHEAD_LAYER} />
      </Source>

      {/* Overpass track segments (green, brightness = elevation quality) */}
      <Source id="overpass-tracks" type="geojson" data={tracksGeoJSON}>
        <Layer {...OVERPASS_TRACK_LAYER} />
        <Layer {...OVERPASS_LABEL_LAYER} />
      </Source>

      {/* Ground station markers (clickable to filter) */}
      {GROUND_STATIONS.map(gs => (
        <Marker key={gs.id} longitude={gs.lng} latitude={gs.lat} anchor="center">
          <button
            onClick={() => setSelectedStationId(gs.id)}
            className="flex flex-col items-center"
            title={`${gs.name} (${gs.operator}) — Click to filter passes`}
          >
            <div
              className="w-2.5 h-2.5 rotate-45 border transition-all"
              style={{
                borderColor: selectedStationId === gs.id ? '#00ff88' : '#00ff8899',
                backgroundColor: selectedStationId === gs.id ? '#00ff8844' : '#00ff8822',
                boxShadow: selectedStationId === gs.id ? '0 0 10px #00ff88' : '0 0 6px #00ff8840',
                transform: selectedStationId === gs.id ? 'rotate(45deg) scale(1.4)' : 'rotate(45deg)',
              }}
            />
            <span
              className="font-mono mt-0.5 whitespace-nowrap transition-colors"
              style={{
                fontSize: selectedStationId === gs.id ? '8px' : '7px',
                color: selectedStationId === gs.id ? '#00ff88' : '#00ff8899',
              }}
            >
              {gs.name.toUpperCase()}
            </span>
          </button>
        </Marker>
      ))}
    </>
  )
}
