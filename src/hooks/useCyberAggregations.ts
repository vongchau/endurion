// src/hooks/useCyberAggregations.ts — polls cyber aggregation endpoints
import { useState, useEffect } from 'react'
import type { ThreatStats, MitreHeatmapCell, Campaign, TemporalBucket, GeoHeatmapPoint, ActorProfile } from '../types'

export function useThreatStats(enabled = true) {
  const [stats, setStats] = useState<ThreatStats | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/stats')
        if (res.ok && active) setStats(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 30_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return stats
}

export function useMitreHeatmap(enabled = true) {
  const [cells, setCells] = useState<MitreHeatmapCell[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/mitre/heatmap')
        if (res.ok && active) setCells(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return cells
}

export function useCampaigns(enabled = true) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/campaigns')
        if (res.ok && active) setCampaigns(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return campaigns
}

export function useTemporalData(enabled = true, hours = 168) {
  const [buckets, setBuckets] = useState<TemporalBucket[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/cyber/temporal?hours=${hours}`)
        if (res.ok && active) setBuckets(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled, hours])

  return buckets
}

export function useGeoHeatmap(enabled = true) {
  const [points, setPoints] = useState<GeoHeatmapPoint[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/cyber/heatmap')
        if (res.ok && active) setPoints(await res.json())
      } catch { /* ignore */ }
    }
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [enabled])

  return points
}

export function useActorProfile(actorName: string | null) {
  const [profile, setProfile] = useState<ActorProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!actorName) return
    let active = true
    const doFetch = async () => {
      try {
        const res = await fetch(`/api/cyber/actor/${encodeURIComponent(actorName)}`)
        if (res.ok && active) setProfile(await res.json())
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    setLoading(true)
    doFetch()
    return () => { active = false }
  }, [actorName])

  return { profile, loading }
}

export function useEdgeArticles(actorId: string | null, targetId: string | null) {
  const [articles, setArticles] = useState<import('../types').CyberNewsArticle[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!actorId || !targetId) return
    let active = true
    const doFetch = async () => {
      try {
        const res = await fetch(`/api/cyber/edge-articles?actorId=${encodeURIComponent(actorId)}&targetId=${encodeURIComponent(targetId)}`)
        if (res.ok && active) setArticles(await res.json())
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    setLoading(true)
    doFetch()
    return () => { active = false }
  }, [actorId, targetId])

  return { articles, loading }
}
