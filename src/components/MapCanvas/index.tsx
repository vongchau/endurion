// src/components/MapCanvas/index.tsx
import { useRef, useCallback } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { GlobalMarkers } from '../../views/global/GlobalMarkers'
import { CityMarkers } from '../../views/city/CityMarkers'
import { CyberLayer } from '../../views/cyber/CyberLayer'
import { SpaceLayer } from '../../views/space/SpaceLayer'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const VIEW_CONFIGS = {
  global: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  city: {
    mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
    initialViewState: { longitude: -74.006, latitude: 40.7128, zoom: 11 },
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
  const mapRef = useRef<MapRef>(null)
  const activeView = useHUDStore((s) => s.activeView)
  const config = VIEW_CONFIGS[activeView]

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
