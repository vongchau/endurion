// src/views/maritime/MaritimeLayer.tsx
import { useEffect, useCallback, useState } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification, SymbolLayerSpecification, MapMouseEvent } from 'mapbox-gl'
import { useHUDStore } from '../../store'
import { useEEZ } from '../../hooks/useEEZ'
import { useIUUAlerts } from '../../hooks/useIUUAlerts'
import { useIUUVessels } from '../../hooks/useIUUVessels'
import type { AISVessel, IUUConfidence } from '../../types'

// --- Layer specs ---

const EEZ_FILL: FillLayerSpecification = {
  id: 'eez-fill',
  type: 'fill',
  source: 'eez',
  paint: { 'fill-color': '#00d4ff', 'fill-opacity': 0.05 },
}

const EEZ_LINE: LineLayerSpecification = {
  id: 'eez-line',
  type: 'line',
  source: 'eez',
  paint: {
    'line-color': '#00d4ff',
    'line-width': 1,
    'line-opacity': 0.3,
    'line-dasharray': [4, 4],
  },
}

const VESSEL_DOTS: CircleLayerSpecification = {
  id: 'maritime-vessels',
  type: 'circle',
  source: 'maritime-vessel-data',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2, 5, 4, 8, 6] as any,
    'circle-color': '#4a6080',
    'circle-opacity': 0.6,
  },
}

const VESSEL_HIT: CircleLayerSpecification = {
  id: 'maritime-vessels-hit',
  type: 'circle',
  source: 'maritime-vessel-data',
  paint: { 'circle-radius': 10, 'circle-opacity': 0 },
}

const VESSEL_LABELS: SymbolLayerSpecification = {
  id: 'maritime-vessel-labels',
  type: 'symbol',
  source: 'maritime-vessel-data',
  minzoom: 6,
  layout: {
    'text-field': ['get', 'name'],
    'text-size': 10,
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
    'text-optional': true,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#e0f0ff',
    'text-halo-color': '#050810',
    'text-halo-width': 1,
    'text-opacity': 0.8,
  },
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const CONFIDENCE_STYLES: Record<IUUConfidence, { size: string; color: string; glow: string }> = {
  HIGH:   { size: 'w-4 h-4', color: '#ff2d2d', glow: '0 0 12px #ff2d2d' },
  MEDIUM: { size: 'w-3.5 h-3.5', color: '#ffaa00', glow: '0 0 8px #ffaa00' },
  LOW:    { size: 'w-3 h-3', color: '#ff8800', glow: '0 0 6px #ff8800' },
}

// --- Vessel data hook ---

function useMaritimeVessels() {
  const [vessels, setVessels] = useState<AISVessel[]>([])

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      fetch('/api/maritime/vessels')
        .then(res => res.ok ? res.json() : [])
        .then(data => { if (!cancelled) setVessels(data) })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return vessels
}

function buildVesselGeoJSON(vessels: AISVessel[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vessels.map(v => ({
      type: 'Feature' as const,
      properties: {
        mmsi: v.mmsi, name: v.name, speed: v.speed, course: v.course,
        heading: v.heading, shipType: v.shipType, shipTypeName: v.shipTypeName,
        destination: v.destination, callSign: v.callSign, imo: v.imo,
        draught: v.draught, eta: v.eta, lengthOverall: v.lengthOverall,
        beam: v.beam, timestamp: v.timestamp, lat: v.lat, lng: v.lng,
      },
      geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] },
    })),
  }
}

// --- Main component ---

export function MaritimeLayer() {
  const { current: map } = useMap()
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const maritimeLayers = useHUDStore((s) => s.maritimeLayers)

  const showEEZ = maritimeLayers.has('eez')
  const showTraffic = maritimeLayers.has('traffic')
  const showIUU = maritimeLayers.has('iuu')

  const { eezData } = useEEZ(true)
  const { alerts } = useIUUAlerts(true)
  const { flaggedVessels } = useIUUVessels(true)
  const allVessels = useMaritimeVessels()

  const eezGeoJSON = eezData ?? EMPTY_FC
  const vesselGeoJSON = buildVesselGeoJSON(allVessels)

  // Click vessel dot
  const handleVesselClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['maritime-vessels-hit'] })
    if (features.length === 0) return
    const p = features[0].properties
    if (!p) return

    const vessel: AISVessel = {
      mmsi: Number(p.mmsi), name: String(p.name ?? ''),
      lat: Number(p.lat), lng: Number(p.lng),
      speed: Number(p.speed ?? 0), course: Number(p.course ?? 0),
      heading: Number(p.heading ?? 0), shipType: Number(p.shipType ?? 0),
      shipTypeName: String(p.shipTypeName ?? ''), destination: String(p.destination ?? ''),
      callSign: String(p.callSign ?? ''), imo: Number(p.imo ?? 0),
      draught: Number(p.draught ?? 0), eta: String(p.eta ?? ''),
      lengthOverall: Number(p.lengthOverall ?? 0), beam: Number(p.beam ?? 0),
      timestamp: Number(p.timestamp),
    }
    setSelectedEntity({ type: 'vessel', data: vessel })
    setPanelVisible('entity', true)
  }, [map, setSelectedEntity, setPanelVisible])

  // Clear selection on empty click
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    // Only query layers that currently exist
    const queryLayers: string[] = []
    if (showTraffic) queryLayers.push('maritime-vessels-hit')
    if (showEEZ) queryLayers.push('eez-fill')
    const hits = queryLayers.length > 0
      ? map.queryRenderedFeatures(e.point, { layers: queryLayers })
      : []
    if (hits.length === 0) {
      setSelectedEntity(null)
      setPanelVisible('entity', false)
    }
  }, [map, setSelectedEntity, setPanelVisible, showTraffic, showEEZ])

  // Cursor
  const handleMouseEnter = useCallback(() => {
    if (map) map.getCanvas().style.cursor = 'pointer'
  }, [map])
  const handleMouseLeave = useCallback(() => {
    if (map) map.getCanvas().style.cursor = ''
  }, [map])

  // General map click (always active)
  useEffect(() => {
    if (!map) return
    map.on('click', handleMapClick)
    return () => { map.off('click', handleMapClick) }
  }, [map, handleMapClick])

  // Vessel layer click/hover (only when traffic layer is visible)
  useEffect(() => {
    if (!map || !showTraffic) return
    map.on('click', 'maritime-vessels-hit', handleVesselClick)
    map.on('mouseenter', 'maritime-vessels-hit', handleMouseEnter)
    map.on('mouseleave', 'maritime-vessels-hit', handleMouseLeave)
    return () => {
      map.off('click', 'maritime-vessels-hit', handleVesselClick)
      map.off('mouseenter', 'maritime-vessels-hit', handleMouseEnter)
      map.off('mouseleave', 'maritime-vessels-hit', handleMouseLeave)
    }
  }, [map, showTraffic, handleVesselClick, handleMouseEnter, handleMouseLeave])

  return (
    <>
      {/* EEZ boundaries */}
      {showEEZ && (
        <Source id="eez" type="geojson" data={eezGeoJSON}>
          <Layer {...EEZ_FILL} />
          <Layer {...EEZ_LINE} />
        </Source>
      )}

      {/* All AIS vessels */}
      {showTraffic && (
        <Source id="maritime-vessel-data" type="geojson" data={vesselGeoJSON}>
          <Layer {...VESSEL_DOTS} />
          <Layer {...VESSEL_HIT} />
          <Layer {...VESSEL_LABELS} />
        </Source>
      )}

      {/* IUU vessel markers (on top) */}
      {showIUU && flaggedVessels.map(({ vessel, match }) => {
        const style = CONFIDENCE_STYLES[match.confidence]
        return (
          <Marker key={`iuu-${vessel.mmsi}`} longitude={vessel.lng} latitude={vessel.lat} anchor="center">
            <button
              onClick={() => {
                const alert = alerts.find(a => a.vessel.mmsi === vessel.mmsi)
                if (alert) {
                  setSelectedEntity({ type: 'iuuVessel', data: alert })
                } else {
                  setSelectedEntity({ type: 'vessel', data: vessel })
                }
                setPanelVisible('entity', true)
              }}
              className="relative flex items-center justify-center"
              title={`IUU: ${vessel.name} [${match.confidence}]`}
            >
              <span
                className={`absolute ${style.size} rounded-full animate-ping opacity-30`}
                style={{ backgroundColor: style.color }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full border-2"
                style={{
                  backgroundColor: style.color,
                  borderColor: style.color,
                  boxShadow: style.glow,
                }}
              />
            </button>
          </Marker>
        )
      })}
    </>
  )
}
