// src/views/maritime/MaritimeLayer.tsx
import { useEffect, useCallback } from 'react'
import { Marker, Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { FillLayerSpecification, LineLayerSpecification, MapMouseEvent } from 'mapbox-gl'
import { useHUDStore } from '../../store'
import { useEEZ } from '../../hooks/useEEZ'
import { useIUUAlerts } from '../../hooks/useIUUAlerts'
import { useIUUVessels } from '../../hooks/useIUUVessels'
import type { IUUConfidence } from '../../types'

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

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const CONFIDENCE_STYLES: Record<IUUConfidence, { size: string; color: string; glow: string }> = {
  HIGH:   { size: 'w-4 h-4', color: '#ff2d2d', glow: '0 0 12px #ff2d2d' },
  MEDIUM: { size: 'w-3.5 h-3.5', color: '#ffaa00', glow: '0 0 8px #ffaa00' },
  LOW:    { size: 'w-3 h-3', color: '#ff8800', glow: '0 0 6px #ff8800' },
}

export function MaritimeLayer() {
  const { current: map } = useMap()
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const { eezData } = useEEZ(true)
  const { alerts } = useIUUAlerts(true)
  const { flaggedVessels } = useIUUVessels(true)

  const eezGeoJSON = eezData ?? EMPTY_FC

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!map) return
    const hits = map.queryRenderedFeatures(e.point, { layers: ['eez-fill'] })
    if (hits.length === 0) {
      setSelectedEntity(null)
      setPanelVisible('entity', false)
    }
  }, [map, setSelectedEntity, setPanelVisible])

  useEffect(() => {
    if (!map) return
    map.on('click', handleMapClick)
    return () => { map.off('click', handleMapClick) }
  }, [map, handleMapClick])

  return (
    <>
      <Source id="eez" type="geojson" data={eezGeoJSON}>
        <Layer {...EEZ_FILL} />
        <Layer {...EEZ_LINE} />
      </Source>

      {flaggedVessels.map(({ vessel, match }) => {
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
