// server/aisCache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  processVesselMessage,
  getDensityZones,
  getMilitaryCandidates,
  getChokepoints,
  getStats,
  isLikelyMilitary,
  cleanupStaleVessels,
  _resetForTest,
  getAllVessels,
} from './aisCache'

beforeEach(() => { _resetForTest() })

describe('isLikelyMilitary', () => {
  it('detects ship type 35', () => {
    const r = isLikelyMilitary(123456789, 35, 'VESSEL')
    expect(r.isMilitary).toBe(true)
    expect(r.reason).toMatch(/35/)
  })

  it('detects ship type 55', () => {
    expect(isLikelyMilitary(123456789, 55, 'VESSEL').isMilitary).toBe(true)
  })

  it('detects naval name prefix USS', () => {
    const r = isLikelyMilitary(123456789, 0, 'USS IOWA')
    expect(r.isMilitary).toBe(true)
    expect(r.reason).toMatch(/USS IOWA/)
  })

  it('detects HMS prefix', () => {
    expect(isLikelyMilitary(123456789, 0, 'HMS DRAGON').isMilitary).toBe(true)
  })

  it('returns false for civilian vessel', () => {
    expect(isLikelyMilitary(123456789, 70, 'MAERSK BERLIN').isMilitary).toBe(false)
  })
})

describe('processVesselMessage', () => {
  it('adds vessel to cache', () => {
    processVesselMessage(123456789, 51.5, -0.1, 0, 'TEST', 10, 90, 90)
    const stats = getStats()
    expect(stats.vessels).toBe(1)
  })

  it('adds military vessel to candidates', () => {
    processVesselMessage(111000001, 26.5, 56.5, 35, 'WARSHIP', 15, 180, 180)
    expect(getMilitaryCandidates().some(c => c.mmsi === 111000001)).toBe(true)
  })

  it('getAllVessels returns all processed vessels', () => {
    processVesselMessage(1, 10, 20, 70, 'CARGO A', 12, 90, 90)
    processVesselMessage(2, 11, 21, 80, 'TANKER B', 8, 45, 45)
    const all = getAllVessels()
    expect(all).toHaveLength(2)
    expect(all.some(v => v.mmsi === 1)).toBe(true)
  })
})

describe('getDensityZones', () => {
  it('returns empty array when no vessels', () => {
    expect(getDensityZones()).toEqual([])
  })

  it('groups vessels into 2-degree grid cells', () => {
    processVesselMessage(1, 26.1, 56.1, 0, 'A', 0, 0, 0)
    processVesselMessage(2, 26.9, 56.9, 0, 'B', 0, 0, 0)
    processVesselMessage(3, 28.0, 58.0, 0, 'C', 0, 0, 0)
    const zones = getDensityZones()
    // First two vessels share same 2° cell (26-28, 56-58)
    const cell = zones.find(z => z.vesselCount >= 2)
    expect(cell).toBeDefined()
  })
})

describe('getChokepoints', () => {
  it('returns all 12 chokepoints', () => {
    expect(getChokepoints()).toHaveLength(12)
  })

  it('counts vessels near Strait of Hormuz', () => {
    // Hormuz center: lat 26.5, lon 56.5
    processVesselMessage(1, 26.5, 56.5, 0, 'TANKER', 12, 90, 90)
    const chokepoints = getChokepoints()
    const hormuz = chokepoints.find(c => c.name === 'Strait of Hormuz')
    expect(hormuz?.vesselCount).toBeGreaterThanOrEqual(1)
  })
})

describe('cleanupStaleVessels', () => {
  it('removes vessels older than threshold', () => {
    vi.useFakeTimers()
    processVesselMessage(1, 10, 20, 0, 'OLD', 0, 0, 0)
    expect(getStats().vessels).toBe(1)
    vi.advanceTimersByTime(31 * 60 * 1000) // 31 minutes
    cleanupStaleVessels()
    expect(getStats().vessels).toBe(0)
    vi.useRealTimers()
  })
})
