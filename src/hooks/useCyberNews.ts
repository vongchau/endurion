// src/hooks/useCyberNews.ts — polls /api/cyber/news and /api/cyber/news/graph
import { useState, useEffect } from 'react'
import type { CyberNewsArticle, CyberNewsGraph } from '../types'

export function useCyberNews(enabled = true) {
  const [articles, setArticles] = useState<CyberNewsArticle[]>([])
  const [graph, setGraph] = useState<CyberNewsGraph | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return

    let active = true

    const fetchData = async () => {
      try {
        const [listRes, graphRes] = await Promise.all([
          fetch('/api/cyber/news?limit=200'),
          fetch('/api/cyber/news/graph'),
        ])
        if (!listRes.ok || !graphRes.ok) throw new Error('Cyber news fetch failed')
        const listData = await listRes.json()
        const graphData = await graphRes.json()
        if (active) {
          setArticles(listData.articles)
          setGraph(graphData)
        }
      } catch (e) {
        console.error('[useCyberNews]', e)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return { articles, graph, loading }
}
