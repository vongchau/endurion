// server/routes/crime.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCachedProfile, setCachedProfile, isCacheValid } from './crime'

describe('crime cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('isCacheValid returns false when no entry exists', () => {
    expect(isCacheValid('NY0303000')).toBe(false)
  })

  it('isCacheValid returns true within 24h of set', () => {
    const fakeProfile = { city: 'NYC', ori: 'NY0303000', fetchedAt: new Date().toISOString(),
      trend: [], offenses: [], weapons: [], offenderDemo: { age: {}, race: {}, sex: {} },
      victimDemo: { age: {}, race: {}, sex: {} }, timeOfDay: [] }
    setCachedProfile('NY0303000', fakeProfile)
    expect(isCacheValid('NY0303000')).toBe(true)
  })

  it('isCacheValid returns false after 24h', () => {
    const fakeProfile = { city: 'NYC', ori: 'NY0303000', fetchedAt: new Date().toISOString(),
      trend: [], offenses: [], weapons: [], offenderDemo: { age: {}, race: {}, sex: {} },
      victimDemo: { age: {}, race: {}, sex: {} }, timeOfDay: [] }
    setCachedProfile('NY0303000', fakeProfile)
    vi.advanceTimersByTime(25 * 60 * 60 * 1000) // 25 hours
    expect(isCacheValid('NY0303000')).toBe(false)
  })

  it('getCachedProfile returns stored profile', () => {
    const fakeProfile = { city: 'NYC', ori: 'NY0303000', fetchedAt: new Date().toISOString(),
      trend: [], offenses: [], weapons: [], offenderDemo: { age: {}, race: {}, sex: {} },
      victimDemo: { age: {}, race: {}, sex: {} }, timeOfDay: [] }
    setCachedProfile('NY0303000', fakeProfile)
    expect(getCachedProfile('NY0303000')).toEqual(fakeProfile)
  })
})
