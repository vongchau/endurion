// src/hooks/useGlobalData.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGlobalData } from './useGlobalData'
import type { GlobalIncident } from '../types'

const incident: GlobalIncident = {
  id: 'usgs:1', lat: 35, lng: 139, country: 'Japan', type: 'Earthquake',
  severity: 'high', timestamp: new Date().toISOString(), summary: 'Test', source: 'usgs',
}

describe('useGlobalData', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('fetches data on mount and sets loading false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [incident] }))

    const { result } = renderHook(() => useGlobalData())
    expect(result.current.loading).toBe(true)

    await act(async () => { await Promise.resolve() })
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0].id).toBe('usgs:1')
  })

  it('keeps previous data on fetch failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [incident] })
      .mockRejectedValueOnce(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useGlobalData())
    await act(async () => { await Promise.resolve() })
    expect(result.current.data).toHaveLength(1)

    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve() })
    // Data preserved despite failure
    expect(result.current.data).toHaveLength(1)
  })
})
