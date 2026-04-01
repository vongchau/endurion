// src/views/space/useOverpasses.ts
import { useMemo } from 'react'
import type { SatrecEntry } from './useSatellites'
import {
  computeOverpasses,
  overpassTracksToGeoJSON,
  stationFootprintsToGeoJSON,
  GROUND_STATIONS,
  type OverpassWindow,
} from './groundStations'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function useOverpasses(
  selectedSatId: string | null,
  satrecEntries: SatrecEntry[],
  selectedStationId: string | null = null,
  hoveredOverpassIdx: number | null = null,
) {
  // Compute all overpass windows (memoized on satellite + entries)
  const allWindows = useMemo(() => {
    if (!selectedSatId || satrecEntries.length === 0) return [] as OverpassWindow[]
    const entry = satrecEntries.find(e => e.id === selectedSatId)
    if (!entry) return [] as OverpassWindow[]
    return computeOverpasses(entry.satrec, GROUND_STATIONS, 12, 1)
  }, [selectedSatId, satrecEntries])

  // Filter by selected station
  const windows = useMemo(() => {
    if (!selectedStationId) return allWindows
    return allWindows.filter(w => w.stationId === selectedStationId)
  }, [allWindows, selectedStationId])

  // Build GeoJSON with highlight state
  const tracksGeoJSON = useMemo(() => {
    if (windows.length === 0) return EMPTY_FC
    return overpassTracksToGeoJSON(windows, hoveredOverpassIdx)
  }, [windows, hoveredOverpassIdx])

  // Ground station footprints
  const footprintsGeoJSON = useMemo(() => {
    return stationFootprintsToGeoJSON(GROUND_STATIONS, selectedStationId)
  }, [selectedStationId])

  return { windows, tracksGeoJSON, footprintsGeoJSON }
}
