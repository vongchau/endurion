// src/store/index.ts
import { create } from 'zustand'
import type { ViewMode, PanelState, Entity, GlobalLayer, CityLayer, CityBasemap, MapBounds, CyberPanel, DronePlaybackMode } from '../types'

interface HUDStore {
  activeView: ViewMode
  setActiveView: (view: ViewMode) => void
  panels: PanelState
  togglePanel: (panel: keyof PanelState) => void
  setPanelVisible: (panel: keyof PanelState, visible: boolean) => void
  selectedEntity: Entity | null
  setSelectedEntity: (entity: Entity | null) => void
  mapZoom: number
  setMapZoom: (zoom: number) => void
  mapBounds: MapBounds | null
  setMapBounds: (bounds: MapBounds) => void
  globalLayers: Set<GlobalLayer>
  toggleGlobalLayer: (layer: GlobalLayer) => void
  cityLayers: Set<CityLayer>
  toggleCityLayer: (layer: CityLayer) => void
  cityBasemap: CityBasemap
  setCityBasemap: (basemap: CityBasemap) => void
  // Drone playback
  dronePlayback: DronePlaybackMode
  dronePlaybackTime: number | null
  dronePlaybackSpeed: number
  droneTimelineVisible: boolean
  setDronePlayback: (mode: DronePlaybackMode) => void
  setDronePlaybackTime: (time: number | null) => void
  setDronePlaybackSpeed: (speed: number) => void
  setDroneTimelineVisible: (visible: boolean) => void
  // Drone telemetry scrub marker (shown on map when hovering chart)
  droneScrubPoint: { lng: number; lat: number; altitude: number; speed: number } | null
  setDroneScrubPoint: (point: { lng: number; lat: number; altitude: number; speed: number } | null) => void
  // Extended history trail for the selected drone (from SQLite, aligned with chart)
  droneHistoryTrail: { lng: number; lat: number; speed: number; timestamp: number }[]
  setDroneHistoryTrail: (trail: { lng: number; lat: number; speed: number; timestamp: number }[]) => void
  // Cyber view state
  cyberPanel: CyberPanel
  setCyberPanel: (panel: CyberPanel) => void
  mitreTacticFilter: string | null  // selected MITRE tactic name, null = show all
  setMitreTacticFilter: (tactic: string | null) => void
  watchlist: Set<string>  // watched actor names, CVE IDs, malware names
  addToWatchlist: (term: string) => void
  removeFromWatchlist: (term: string) => void
}

export const useHUDStore = create<HUDStore>((set) => ({
  activeView: 'global',
  setActiveView: (view) => set({ activeView: view, selectedEntity: null }),
  panels: {
    eventFeed: true,
    entity: false,
    statusBar: true,
    timeline: false,
  },
  togglePanel: (panel) =>
    set((state) => ({
      panels: { ...state.panels, [panel]: !state.panels[panel] },
    })),
  setPanelVisible: (panel, visible) =>
    set((state) => ({
      panels: { ...state.panels, [panel]: visible },
    })),
  selectedEntity: null,
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  mapZoom: 1.8,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  mapBounds: null,
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
  globalLayers: new Set<GlobalLayer>(['conflict', 'disaster', 'military', 'maritime', 'news']),
  toggleGlobalLayer: (layer) =>
    set((state) => {
      const next = new Set(state.globalLayers)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return { globalLayers: next }
    }),
  cityLayers: new Set<CityLayer>(['uas']),
  toggleCityLayer: (layer) =>
    set((state) => {
      const next = new Set(state.cityLayers)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return { cityLayers: next }
    }),
  cityBasemap: 'streets-dark',
  setCityBasemap: (basemap) => set({ cityBasemap: basemap }),
  dronePlayback: 'live',
  dronePlaybackTime: null,
  dronePlaybackSpeed: 1,
  droneTimelineVisible: true,
  setDronePlayback: (mode) => set({
    dronePlayback: mode,
    dronePlaybackTime: mode === 'live' ? null : Date.now() - 60 * 60 * 1000,
  }),
  setDronePlaybackTime: (time) => set({ dronePlaybackTime: time }),
  setDronePlaybackSpeed: (speed) => set({ dronePlaybackSpeed: speed }),
  setDroneTimelineVisible: (visible) => set({ droneTimelineVisible: visible }),
  droneScrubPoint: null,
  setDroneScrubPoint: (point) => set({ droneScrubPoint: point }),
  droneHistoryTrail: [],
  setDroneHistoryTrail: (trail) => set({ droneHistoryTrail: trail }),
  cyberPanel: 'graph',
  setCyberPanel: (panel) => set((state) => ({
    cyberPanel: panel,
    // Clear tactic filter when leaving the MITRE panel
    mitreTacticFilter: panel === 'mitre' ? state.mitreTacticFilter : null,
  })),
  mitreTacticFilter: null,
  setMitreTacticFilter: (tactic) => set({ mitreTacticFilter: tactic }),
  watchlist: new Set<string>(),
  addToWatchlist: (term) =>
    set((state) => {
      const next = new Set(state.watchlist)
      next.add(term.toLowerCase())
      return { watchlist: next }
    }),
  removeFromWatchlist: (term) =>
    set((state) => {
      const next = new Set(state.watchlist)
      next.delete(term.toLowerCase())
      return { watchlist: next }
    }),
}))

// Persist watchlist to localStorage
const WATCHLIST_KEY = 'endurion-watchlist'
try {
  const saved = localStorage.getItem(WATCHLIST_KEY)
  if (saved) {
    const terms = JSON.parse(saved) as string[]
    useHUDStore.setState({ watchlist: new Set(terms) })
  }
} catch { /* ignore */ }

useHUDStore.subscribe((state, prev) => {
  if (state.watchlist !== prev.watchlist) {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...state.watchlist]))
  }
})
