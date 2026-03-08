// src/hooks/useCrimeProfile.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCrimeProfile } from './useCrimeProfile'

const mockProfile = {
  city: 'New York City', ori: 'NY0303000', fetchedAt: '2024-01-01T00:00:00Z',
  trend: [{ year: 2020, count: 1000 }], offenses: [], weapons: [],
  offenderDemo: { age: {}, race: {}, sex: {} }, victimDemo: { age: {}, race: {}, sex: {} },
  timeOfDay: [],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useCrimeProfile', () => {
  it('starts with loading=true and no data', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useCrimeProfile('NY0303000'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data on successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockProfile,
    } as Response)
    const { result } = renderHook(() => useCrimeProfile('NY0303000'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(mockProfile)
    expect(result.current.error).toBeNull()
  })

  it('sets error on failed fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response)
    const { result } = renderHook(() => useCrimeProfile('NY0303000'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/503/)
    expect(result.current.data).toBeNull()
  })

  it('refetches when ori changes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => mockProfile,
    } as Response)
    const { result, rerender } = renderHook(({ ori }) => useCrimeProfile(ori), {
      initialProps: { ori: 'NY0303000' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ ori: 'IL0160000' })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
