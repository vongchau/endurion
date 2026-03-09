// src/views/global/VesselDensityLayer.tsx
import { Source, Layer } from 'react-map-gl/mapbox'
import type { VesselDensityZone } from '../../types'

interface VesselDensityLayerProps {
  zones: VesselDensityZone[]
}

export function VesselDensityLayer({ zones }: VesselDensityLayerProps) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: zones.map((z) => ({
      type: 'Feature' as const,
      properties: { intensity: z.intensity, count: z.vesselCount },
      geometry: { type: 'Point' as const, coordinates: [z.lng, z.lat] },
    })),
  }

  return (
    <Source id="vessel-density" type="geojson" data={geojson}>
      <Layer
        id="vessel-density-heat"
        type="heatmap"
        paint={{
          'heatmap-weight':     ['get', 'intensity'],
          'heatmap-intensity':  1.5,
          'heatmap-radius':     40,
          'heatmap-opacity':    0.65,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.3, 'rgba(0,255,136,0.5)',
            0.6, 'rgba(255,170,0,0.8)',
            1.0, 'rgba(255,45,45,1)',
          ],
        }}
      />
    </Source>
  )
}
