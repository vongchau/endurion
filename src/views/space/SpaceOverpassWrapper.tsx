// src/views/space/SpaceOverpassWrapper.tsx
import { useCallback } from 'react'
import { useHUDStore } from '../../store'
import { useSatellites } from './useSatellites'
import { useOverpasses } from './useOverpasses'
import { OverpassPanel } from './OverpassPanel'
import { mapRef } from '../../mapRef'
import type { OverpassWindow } from './groundStations'
import type { Satellite } from '../../types'

export function SpaceOverpassWrapper() {
  const selectedEntity = useHUDStore((s) => s.selectedEntity)
  const selectedStationId = useHUDStore((s) => s.selectedStationId)
  const hoveredOverpassIdx = useHUDStore((s) => s.hoveredOverpassIdx)
  const setHoveredOverpassIdx = useHUDStore((s) => s.setHoveredOverpassIdx)
  const { satrecEntries } = useSatellites()

  const isSatSelected = selectedEntity?.type === 'satellite'
  const sat = isSatSelected ? (selectedEntity.data as Satellite) : null
  const { windows } = useOverpasses(
    sat?.id ?? null, satrecEntries, selectedStationId, hoveredOverpassIdx,
  )

  const handleClickWindow = useCallback((w: OverpassWindow) => {
    if (w.trackCoords.length === 0) return
    // Fly to the midpoint of the overpass track
    const mid = w.trackCoords[Math.floor(w.trackCoords.length / 2)]
    mapRef.current?.flyTo({ center: [mid[0], mid[1]], zoom: 3, duration: 1500 })
  }, [])

  if (!sat || windows.length === 0) return null

  return (
    <OverpassPanel
      windows={windows}
      satName={sat.name}
      hoveredIdx={hoveredOverpassIdx}
      onHoverIdx={setHoveredOverpassIdx}
      onClickWindow={handleClickWindow}
      selectedStationId={selectedStationId}
    />
  )
}
