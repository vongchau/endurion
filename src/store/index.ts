// src/store/index.ts
import { create } from 'zustand'
import type { ViewMode, PanelState, Entity, GlobalLayer, CityLayer, MapBounds } from '../types'

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
  globalLayers: new Set<GlobalLayer>(['conflict', 'disaster', 'military', 'maritime']),
  toggleGlobalLayer: (layer) =>
    set((state) => {
      const next = new Set(state.globalLayers)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return { globalLayers: next }
    }),
  cityLayers: new Set<CityLayer>(['uas', 'zones']),
  toggleCityLayer: (layer) =>
    set((state) => {
      const next = new Set(state.cityLayers)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return { cityLayers: next }
    }),
}))
