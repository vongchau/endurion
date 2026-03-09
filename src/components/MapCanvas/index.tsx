// src/components/MapCanvas/index.tsx
import { useCallback } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapLayerMouseEvent } from 'react-map-gl/mapbox'
import type { AISVessel } from '../../types'
import { useHUDStore } from '../../store'
import { GlobalMarkers } from '../../views/global/GlobalMarkers'
import { CityMarkers } from '../../views/city/CityMarkers'
import { CityPins } from '../../views/city/CityPins'
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
  const selectedCity = useHUDStore((s) => s.selectedCity)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible   = useHUDStore((s) => s.setPanelVisible)
  const config = VIEW_CONFIGS[activeView]

  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature || feature.layer?.id !== 'vessel-points') return
    const p = feature.properties as Record<string, unknown>
    const vessel: AISVessel = {
      mmsi:         Number(p.mmsi),
      name:         String(p.name ?? ''),
      lat:          event.lngLat.lat,
      lng:          event.lngLat.lng,
      speed:        Number(p.speed ?? 0),
      heading:      Number(p.heading ?? 0),
      shipType:     Number(p.shipType ?? 0),
      shipTypeName: String(p.shipTypeName ?? ''),
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
  }, [activeView])

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        key={activeView}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={config.mapStyle}
        initialViewState={config.initialViewState}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        interactiveLayerIds={activeView === 'global' ? ['vessel-points'] : []}
        projection={activeView === 'global' || activeView === 'space' ? 'globe' : 'mercator'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {activeView === 'global' && <GlobalMarkers />}
        {activeView === 'city' && !selectedCity && <CityPins mapRef={mapRef} />}
        {activeView === 'city' && <CityMarkers />}
        {activeView === 'cyber' && <CyberLayer />}
        {activeView === 'space' && <SpaceLayer />}
      </Map>
    </div>
  )
}
