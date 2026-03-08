// server/sources/fbi.ts
import type { CrimeProfileResponse } from '../../src/types'

const BASE = 'https://api.usa.gov/crime/fbi/cde'

async function get(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}?api_key=${apiKey}`)
  if (!res.ok) return {}
  return res.json()
}

export function normalizeTrend(raw: unknown): CrimeProfileResponse['trend'] {
  const data = (raw as { data?: Array<{ data_year: number; offense_count: number }> })?.data
  if (!Array.isArray(data)) return []
  return data.map((d) => ({ year: d.data_year, count: d.offense_count ?? 0 }))
}

export function normalizeWeapons(raw: unknown): CrimeProfileResponse['weapons'] {
  const data = (raw as { data?: Array<{ weapon_name: string; count: number }> })?.data
  if (!Array.isArray(data)) return []
  const map = new Map<string, number>()
  for (const d of data) map.set(d.weapon_name, (map.get(d.weapon_name) ?? 0) + (d.count ?? 0))
  return Array.from(map.entries()).map(([weapon, count]) => ({ weapon, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

export function normalizeOffenses(raw: unknown): CrimeProfileResponse['offenses'] {
  const data = (raw as { data?: Array<{ offense_name: string; count: number }> })?.data
  if (!Array.isArray(data)) return []
  const map = new Map<string, number>()
  for (const d of data) map.set(d.offense_name, (map.get(d.offense_name) ?? 0) + (d.count ?? 0))
  return Array.from(map.entries()).map(([offense, count]) => ({ offense, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}

function aggregateDemoField(
  data: Array<Record<string, unknown>>,
  key: string,
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const d of data) {
    const label = String(d[key] ?? 'Unknown')
    map[label] = (map[label] ?? 0) + (Number(d.count) || 0)
  }
  return map
}

export function normalizeOffenderDemo(raw: unknown): CrimeProfileResponse['offenderDemo'] {
  const data = (raw as { data?: Array<Record<string, unknown>> })?.data
  if (!Array.isArray(data)) return { age: {}, race: {}, sex: {} }
  return {
    age:  aggregateDemoField(data, 'age_range_code'),
    race: aggregateDemoField(data, 'race_desc'),
    sex:  aggregateDemoField(data, 'sex_code'),
  }
}

export function normalizeVictimDemo(raw: unknown): CrimeProfileResponse['victimDemo'] {
  const data = (raw as { data?: Array<Record<string, unknown>> })?.data
  if (!Array.isArray(data)) return { age: {}, race: {}, sex: {} }
  return {
    age:  aggregateDemoField(data, 'age_range_code'),
    race: aggregateDemoField(data, 'race_desc'),
    sex:  aggregateDemoField(data, 'sex_code'),
  }
}

export function normalizeTimeOfDay(raw: unknown): CrimeProfileResponse['timeOfDay'] {
  const data = (raw as { data?: Array<{ time_of_day: string; count: number }> })?.data
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  if (!Array.isArray(data)) return buckets
  for (const d of data) {
    const hour = parseInt(d.time_of_day, 10)
    if (hour >= 0 && hour < 24) buckets[hour].count += d.count ?? 0
  }
  return buckets
}

export async function fetchCrimeProfile(
  ori: string,
  cityName: string,
  apiKey: string,
): Promise<CrimeProfileResponse> {
  const [trendRaw, weaponsRaw, offenderRaw, victimRaw, offensesRaw] = await Promise.allSettled([
    get(`/summarized/agency/${ori}/all-offenses/count/annual`, apiKey),
    get(`/nibrs/violent-crime/weapons/agencies/${ori}/count`,  apiKey),
    get(`/nibrs/violent-crime/offender/agencies/${ori}/count`, apiKey),
    get(`/nibrs/violent-crime/victim/agencies/${ori}/count`,   apiKey),
    get(`/nibrs/violent-crime/offense/agencies/${ori}/count`,  apiKey),
  ])

  const settled = <T>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : {}

  return {
    city: cityName,
    ori,
    fetchedAt: new Date().toISOString(),
    trend:        normalizeTrend(settled(trendRaw)),
    weapons:      normalizeWeapons(settled(weaponsRaw)),
    offenderDemo: normalizeOffenderDemo(settled(offenderRaw)),
    victimDemo:   normalizeVictimDemo(settled(victimRaw)),
    offenses:     normalizeOffenses(settled(offensesRaw)),
    timeOfDay:    normalizeTimeOfDay(settled(victimRaw)), // time-of-day comes from victim segment
  }
}
