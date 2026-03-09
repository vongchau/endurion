// src/views/city/CityMarkers.tsx
import { Marker, Source, Layer } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { useDrones } from '../../hooks/useDrones'
import { DroneLayer } from './DroneLayer'
import { cityPOIs } from '../../data/city-pois'
import type { CityPOI } from '../../types'

const TYPE_ICONS: Record<CityPOI['type'], string> = {
  surveillance: '◉',
  incident: '⚠',
  asset: '◆',
}

const TYPE_COLORS: Record<CityPOI['type'], string> = {
  surveillance: '#00d4ff',
  incident: '#ff2d2d',
  asset: '#00ff88',
}

// GeoJSON for heat map
const heatmapData = {
  type: 'FeatureCollection' as const,
  features: cityPOIs.map(p => ({
    type: 'Feature' as const,
    properties: { weight: p.activityLevel / 100 },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  })),
}

export function CityMarkers() {
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const selectedCity = useHUDStore((s) => s.selectedCity)
  if (!selectedCity) return null

  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const showUAS    = cityLayers.has('uas')
  const { drones } = useDrones(showUAS, mapBounds)

  return (
    <>
      {/* Heat map layer */}
      <Source id="city-heat" type="geojson" data={heatmapData}>
        <Layer
          id="city-heatmap"
          type="heatmap"
          paint={{
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': 1.5,
            'heatmap-radius': 40,
            'heatmap-opacity': 0.6,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,255,136,0)',
              0.4, 'rgba(0,255,136,0.6)',
              0.7, 'rgba(255,170,0,0.8)',
              1, 'rgba(255,45,45,1)',
            ],
          }}
        />
      </Source>

      {/* POI markers */}
      {cityPOIs.map((poi) => (
        <Marker key={poi.id} longitude={poi.lng} latitude={poi.lat} anchor="center">
          <button
            onClick={() => {
              setSelectedEntity({ type: 'poi', data: poi })
              setPanelVisible('entity', true)
            }}
            className="flex items-center justify-center w-7 h-7 rounded-full border backdrop-blur-sm transition-transform hover:scale-125"
            style={{
              color: TYPE_COLORS[poi.type],
              borderColor: `${TYPE_COLORS[poi.type]}60`,
              backgroundColor: `${TYPE_COLORS[poi.type]}15`,
              boxShadow: `0 0 8px ${TYPE_COLORS[poi.type]}40`,
            }}
          >
            <span className="text-xs">{TYPE_ICONS[poi.type]}</span>
          </button>
        </Marker>
      ))}

      {showUAS && <DroneLayer drones={drones} />}
    </>
  )
}
