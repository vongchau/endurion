// src/hooks/useVessels.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useVessels } from './useVessels'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

const mockDensity = [{ lat: 10, lng: 20, intensity: 0.5, vesselCount: 5 }]
const mockMilitary = [{ mmsi: 123, name: 'USS TEST', lat: 10, lng: 20, heading: 90, speed: 12, shipType: 35, reason: 'Ship type 35', timestamp: Date.now() }]

describe('useVessels', () => {
  it('starts loading with empty data', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useVessels())
    expect(result.current.loading).toBe(true)
    expect(result.current.density).toEqual([])
    expect(result.current.military).toEqual([])
  })

  it('populates data after fetch', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => mockDensity } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockMilitary } as Response)
    const { result } = renderHook(() => useVessels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.density).toEqual(mockDensity)
    expect(result.current.military).toEqual(mockMilitary)
  })
})
