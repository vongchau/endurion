// src/views/cyber/CyberHeatmap.tsx — geographic attack density heatmap
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import { useGeoHeatmap } from '../../hooks/useCyberAggregations'
import { useHUDStore } from '../../store'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function CyberHeatmap() {
  const cyberPanel = useHUDStore((s) => s.cyberPanel)
  const points = useGeoHeatmap(cyberPanel === 'heatmap')

  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (points.length === 0) return EMPTY_GEOJSON
    return {
      type: 'FeatureCollection',
      features: points.map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { weight: p.weight, type: p.type },
      })),
    }
  }, [points])

  if (cyberPanel !== 'heatmap') return null

  return (
    <Source id="cyber-heatmap" type="geojson" data={geojson}>
      <Layer
        id="cyber-heat-layer"
        type="heatmap"
        paint={{
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 40],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.1, 'rgba(0,212,255,0.2)',
            0.3, 'rgba(123,47,255,0.4)',
            0.5, 'rgba(255,170,0,0.6)',
            0.7, 'rgba(255,45,45,0.7)',
            1, 'rgba(255,45,45,1)',
          ],
          'heatmap-opacity': 0.8,
        }}
      />
    </Source>
  )
}
