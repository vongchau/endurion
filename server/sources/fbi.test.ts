// server/sources/fbi.test.ts
import { describe, it, expect } from 'vitest'
import {
  normalizeTrend,
  normalizeWeapons,
  normalizeOffenses,
  normalizeOffenderDemo,
  normalizeVictimDemo,
  normalizeTimeOfDay,
} from './fbi'

describe('normalizeTrend', () => {
  it('extracts year + count from summarized annual data', () => {
    const raw = { data: [{ data_year: 2020, offense_count: 1000 }, { data_year: 2021, offense_count: 1200 }] }
    const result = normalizeTrend(raw)
    expect(result).toEqual([
      { year: 2020, count: 1000 },
      { year: 2021, count: 1200 },
    ])
  })

  it('returns empty array when data is missing', () => {
    expect(normalizeTrend({})).toEqual([])
    expect(normalizeTrend({ data: null })).toEqual([])
  })
})

describe('normalizeWeapons', () => {
  it('aggregates weapon counts across years', () => {
    const raw = {
      data: [
        { weapon_name: 'Handgun', count: 100 },
        { weapon_name: 'Handgun', count: 200 },
        { weapon_name: 'Rifle', count: 50 },
      ],
    }
    const result = normalizeWeapons(raw)
    const handgun = result.find((w) => w.weapon === 'Handgun')
    expect(handgun?.count).toBe(300)
    expect(result.find((w) => w.weapon === 'Rifle')?.count).toBe(50)
  })

  it('returns empty array for missing data', () => {
    expect(normalizeWeapons({})).toEqual([])
  })
})

describe('normalizeOffenses', () => {
  it('aggregates offense counts and sorts descending', () => {
    const raw = {
      data: [
        { offense_name: 'Robbery', count: 500 },
        { offense_name: 'Assault', count: 300 },
        { offense_name: 'Robbery', count: 200 },
      ],
    }
    const result = normalizeOffenses(raw)
    expect(result[0]).toEqual({ offense: 'Robbery', count: 700 })
    expect(result[1]).toEqual({ offense: 'Assault', count: 300 })
  })
})

describe('normalizeTimeOfDay', () => {
  it('returns 24 hourly buckets', () => {
    const raw = {
      data: [
        { time_of_day: '0', count: 42 },
        { time_of_day: '14', count: 100 },
      ],
    }
    const result = normalizeTimeOfDay(raw)
    expect(result).toHaveLength(24)
    expect(result[0]).toEqual({ hour: 0, count: 42 })
    expect(result[14]).toEqual({ hour: 14, count: 100 })
    expect(result[5]).toEqual({ hour: 5, count: 0 })
  })
})
