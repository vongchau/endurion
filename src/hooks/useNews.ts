// src/hooks/useNews.ts — polls /api/news and /api/news/geolocated
import { useState, useEffect } from 'react'
import type { NewsArticle } from '../types'

interface GeoFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string
    title: string
    link: string
    source: string
    category: string
    region: string
    timestamp: number
    priority: string
    locationName: string
  }
}

interface GeoJSON {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

export function useNews(enabled = true) {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [geoJSON, setGeoJSON] = useState<GeoJSON | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!enabled) return

    let active = true

    const fetchNews = async () => {
      try {
        const [listRes, geoRes] = await Promise.all([
          fetch('/api/news?limit=200'),
          fetch('/api/news/geolocated'),
        ])
        if (!listRes.ok || !geoRes.ok) throw new Error('News fetch failed')
        const listData = await listRes.json()
        const geoData = await geoRes.json()
        if (active) {
          setArticles(listData.articles)
          setGeoJSON(geoData)
          setLastUpdated(new Date())
        }
      } catch (e) {
        console.error('[useNews]', e)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchNews()
    const id = setInterval(fetchNews, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return { articles, geoJSON, loading, lastUpdated }
}
