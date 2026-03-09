// src/hooks/useAllVessels.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAllVessels } from './useAllVessels'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

const mockVessels = [
  { mmsi: 1, name: 'TEST', lat: 10, lng: 20, speed: 5, heading: 90,
    shipType: 70, shipTypeName: 'Cargo', timestamp: Date.now() },
]

describe('useAllVessels', () => {
  it('starts with loading true and empty vessels', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAllVessels())
    expect(result.current.loading).toBe(true)
    expect(result.current.vessels).toEqual([])
  })

  it('populates vessels after fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mockVessels } as Response)
    const { result } = renderHook(() => useAllVessels())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.vessels).toHaveLength(1)
    expect(result.current.vessels[0].mmsi).toBe(1)
  })
})
