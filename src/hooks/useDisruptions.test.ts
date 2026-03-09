// src/hooks/useDisruptions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDisruptions } from './useDisruptions'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

describe('useDisruptions', () => {
  it('starts with empty data', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDisruptions())
    expect(result.current.disruptions).toEqual([])
  })

  it('returns disruptions after fetch', async () => {
    const mock = [{ id: 'test', name: 'Hormuz', type: 'chokepoint_congestion',
      lat: 26.5, lng: 56.5, severity: 'elevated', vesselCount: 42, description: '42 vessels' }]
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mock } as Response)
    const { result } = renderHook(() => useDisruptions())
    await waitFor(() => expect(result.current.disruptions).toHaveLength(1))
    expect(result.current.disruptions[0].name).toBe('Hormuz')
  })
})
