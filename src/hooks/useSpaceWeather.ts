// src/hooks/useSpaceWeather.ts
import { useState, useEffect } from 'react'

export interface SpaceWeatherAlert {
  id: string
  timestamp: string
  category: 'geomagnetic' | 'solar_radiation' | 'radio_blackout' | 'electron_flux' | 'other'
  severity: 'warning' | 'alert' | 'watch' | 'summary'
  title: string
  message: string
}

export interface SpaceWeatherScales {
  timestamp: string
  R: { scale: number; text: string }
  S: { scale: number; text: string }
  G: { scale: number; text: string }
}

export interface KpIndex {
  timestamp: string
  kp: number
  observed: number
}

export interface SpaceWeather {
  alerts: SpaceWeatherAlert[]
  scales: SpaceWeatherScales | null
  kpIndex: KpIndex | null
}

export function useSpaceWeather(enabled: boolean) {
  const [data, setData] = useState<SpaceWeather>({ alerts: [], scales: null, kpIndex: null })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        const res = await fetch('/api/space-weather')
        if (res.ok && !cancelled) setData(await res.json())
      } catch (e) {
        console.error('[useSpaceWeather]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    const id = setInterval(fetchData, 5 * 60 * 1000) // refresh every 5min
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return { ...data, loading }
}
