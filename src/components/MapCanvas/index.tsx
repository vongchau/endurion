// src/components/MapCanvas/index.tsx
import { useCallback } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl/mapbox'
import type { AISVessel, DroneFlight } from '../../types'
import { useHUDStore } from '../../store'
import { GlobalMarkers } from '../../views/global/GlobalMarkers'
import { CityMarkers } from '../../views/city/CityMarkers'
import { CyberLayer } from '../../views/cyber/CyberLayer'
import { SpaceLayer } from '../../views/space/SpaceLayer'
import { mapRef } from '../../mapRef'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const VIEW_CONFIGS = {
  global: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  city: {
    mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
    initialViewState: { longitude: -96, latitude: 38, zoom: 3.5 },
  },
  cyber: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  space: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
}

export function MapCanvas() {
  const activeView = useHUDStore((s) => s.activeView)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible   = useHUDStore((s) => s.setPanelVisible)
  const setMapZoom   = useHUDStore((s) => s.setMapZoom)
  const setMapBounds = useHUDStore((s) => s.setMapBounds)
  const config = VIEW_CONFIGS[activeView]

  const handleMoveEnd = useCallback((evt: ViewStateChangeEvent) => {
    const map = mapRef.current?.getMap()
    if (!map) return
    setMapZoom(evt.viewState.zoom)
    const b = map.getBounds()
    if (b) {
      setMapBounds({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      })
    }
  }, [setMapZoom, setMapBounds])

  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return

    if (feature.layer?.id === 'drone-points') {
      const p = feature.properties as Record<string, unknown>
      const drone: DroneFlight = {
        id:            String(p.id ?? ''),
        sensorId:      String(p.sensorId ?? ''),
        lat:           event.lngLat.lat,
        lng:           event.lngLat.lng,
        altitude:      Number(p.altitude ?? 0),
        speed:         Number(p.speed ?? 0),
        verticalSpeed: Number(p.verticalSpeed ?? 0),
        heading:       Number(p.heading ?? 0),
        state:         String(p.state ?? 'unknown'),
        timestamp:     Number(p.timestamp ?? 0),
      }
      setSelectedEntity({ type: 'drone', data: drone })
      setPanelVisible('entity', true)
      return
    }

    if (feature.layer?.id !== 'vessel-points') return
    const p = feature.properties as Record<string, unknown>
    const vessel: AISVessel = {
      mmsi:         Number(p.mmsi),
      name:         String(p.name ?? ''),
      lat:          event.lngLat.lat,
      lng:          event.lngLat.lng,
      speed:        Number(p.speed ?? 0),
      course:       Number(p.course ?? 0),
      heading:      Number(p.heading ?? 0),
      shipType:     Number(p.shipType ?? 0),
      shipTypeName: String(p.shipTypeName ?? ''),
      destination:  String(p.destination ?? ''),
      callSign:     String(p.callSign ?? ''),
      imo:          Number(p.imo ?? 0),
      draught:      Number(p.draught ?? 0),
      eta:          String(p.eta ?? ''),
      lengthOverall: Number(p.lengthOverall ?? 0),
      beam:         Number(p.beam ?? 0),
      timestamp:    Number(p.timestamp ?? 0),
    }
    setSelectedEntity({ type: 'vessel', data: vessel })
    setPanelVisible('entity', true)
  }, [setSelectedEntity, setPanelVisible])

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    if (activeView === 'global') {
      map.setFog({ color: 'rgb(5, 8, 16)', 'high-color': 'rgb(0, 50, 80)', 'horizon-blend': 0.02 })
    }
    if (activeView === 'space') {
      map.setFog({ color: 'rgb(2, 4, 8)', 'high-color': 'rgb(0, 0, 20)', 'horizon-blend': 0.01 })
    }
    // Capture initial zoom & bounds
    setMapZoom(map.getZoom())
    const b = map.getBounds()
    if (b) {
      setMapBounds({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      })
    }
  }, [activeView, setMapZoom, setMapBounds])

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        key={activeView}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={config.mapStyle}
        initialViewState={config.initialViewState}
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        interactiveLayerIds={
          activeView === 'global' ? ['vessel-points'] :
          activeView === 'city' ? ['drone-points'] :
          []
        }
        projection={activeView === 'global' || activeView === 'space' ? 'globe' : 'mercator'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {activeView === 'global' && <GlobalMarkers />}
        {activeView === 'city' && <CityMarkers />}
        {activeView === 'cyber' && <CyberLayer />}
        {activeView === 'space' && <SpaceLayer />}
      </Map>
    </div>
  )
}
