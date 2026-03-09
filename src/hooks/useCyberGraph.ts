// src/hooks/useCyberGraph.ts
import { useState, useEffect } from 'react'
import type { CyberGraph } from '../types'

export function useCyberGraph(enabled = true) {
  const [graph, setGraph] = useState<CyberGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true

    const fetchGraph = async () => {
      try {
        const res = await fetch('/api/cyber/graph')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: CyberGraph = await res.json()
        if (active) {
          setGraph(data)
          setError(null)
        }
      } catch (e) {
        console.error('[useCyberGraph]', e)
        if (active) setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchGraph()
    const id = setInterval(fetchGraph, 30_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return { graph, loading, error }
}
