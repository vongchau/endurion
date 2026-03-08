// src/store/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHUDStore } from './index'
import { act } from '@testing-library/react'
import type { CityProfile } from '../types'

describe('HUD Store', () => {
  beforeEach(() => {
    useHUDStore.setState({
      activeView: 'global',
      panels: { eventFeed: true, entity: false, statusBar: true, timeline: false },
      selectedEntity: null,
    })
  })

  it('starts with global view', () => {
    expect(useHUDStore.getState().activeView).toBe('global')
  })

  it('switches views', () => {
    act(() => useHUDStore.getState().setActiveView('city'))
    expect(useHUDStore.getState().activeView).toBe('city')
  })

  it('toggles panels', () => {
    act(() => useHUDStore.getState().togglePanel('entity'))
    expect(useHUDStore.getState().panels.entity).toBe(true)
  })

  it('sets selected entity', () => {
    const entity = { type: 'incident' as const, data: { id: 'g1' } as any }
    act(() => useHUDStore.getState().setSelectedEntity(entity))
    expect(useHUDStore.getState().selectedEntity).toEqual(entity)
  })
})

describe('selectedCity', () => {
  beforeEach(() => {
    useHUDStore.setState({ selectedCity: null })
  })

  it('selectedCity starts null', () => {
    const { selectedCity } = useHUDStore.getState()
    expect(selectedCity).toBeNull()
  })

  it('setSelectedCity updates selectedCity', () => {
    const city: CityProfile = {
      id: 'nyc', name: 'New York City', state: 'NY', ori: 'NY0303000',
      lat: 40.7128, lng: -74.006, zoom: 11,
    }
    useHUDStore.getState().setSelectedCity(city)
    expect(useHUDStore.getState().selectedCity).toEqual(city)
  })

  it('setSelectedCity(null) clears city', () => {
    useHUDStore.getState().setSelectedCity(null)
    expect(useHUDStore.getState().selectedCity).toBeNull()
  })
})

describe('globalLayers', () => {
  beforeEach(() => {
    useHUDStore.setState({
      globalLayers: new Set(['conflict', 'disaster', 'military']),
    })
  })

  it('starts with all three layers active', () => {
    const { globalLayers } = useHUDStore.getState()
    expect(globalLayers.has('conflict')).toBe(true)
    expect(globalLayers.has('disaster')).toBe(true)
    expect(globalLayers.has('military')).toBe(true)
  })

  it('toggleGlobalLayer removes an active layer', () => {
    useHUDStore.getState().toggleGlobalLayer('conflict')
    expect(useHUDStore.getState().globalLayers.has('conflict')).toBe(false)
  })

  it('toggleGlobalLayer re-adds an inactive layer', () => {
    useHUDStore.getState().toggleGlobalLayer('conflict') // off
    useHUDStore.getState().toggleGlobalLayer('conflict') // on
    expect(useHUDStore.getState().globalLayers.has('conflict')).toBe(true)
  })
})
