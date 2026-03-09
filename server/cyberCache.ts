// server/cyberCache.ts
import { fetchThreatEvents } from './sources/cloudflare'
import { COUNTRY_CENTROIDS, UNKNOWN_ORIGIN } from './data/countryCentroids'
import type { CyberGraph, CyberNode, CyberEdge } from '../src/types'

const POLL_INTERVAL = 30_000
let cache: CyberGraph = { nodes: [], edges: [] }

export function getCyberGraph(): CyberGraph {
  return cache
}

function getCountryCoords(country: string): [number, number] {
  const code = country?.toUpperCase().slice(0, 2)
  return COUNTRY_CENTROIDS[code] ?? UNKNOWN_ORIGIN
}

function spreadAroundPoint(
  center: [number, number],
  index: number,
  total: number,
  radius: number
): [number, number] {
  if (total <= 1) return center
  const angle = (2 * Math.PI * index) / total
  return [
    center[0] + radius * Math.cos(angle),
    center[1] + radius * Math.sin(angle),
  ]
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function deriveThreatScore(event: { id?: string; category?: string; tags?: string[] }): number {
  const cat = (event.category ?? '').toLowerCase()
  const jitter = simpleHash(event.id ?? cat) % 20
  const highThreat = ['ransomware', 'apt', 'zero-day', 'exploit', 'backdoor']
  const medThreat = ['phishing', 'malware', 'c2', 'credential']
  if (highThreat.some(t => cat.includes(t))) return 80 + jitter
  if (medThreat.some(t => cat.includes(t))) return 60 + jitter
  return 30 + (jitter % 30)
}

function buildGraph(events: Awaited<ReturnType<typeof fetchThreatEvents>>): CyberGraph {
  const nodes: CyberNode[] = []
  const edges: CyberEdge[] = []

  // Group events by attacker
  const attackerMap = new Map<string, typeof events>()
  for (const evt of events) {
    const key = evt.attacker || 'UNKNOWN'
    if (!attackerMap.has(key)) attackerMap.set(key, [])
    attackerMap.get(key)!.push(evt)
  }

  // Track how many actors share a country for fanning
  const countryActorCounts = new Map<string, number>()
  const countryActorIndex = new Map<string, number>()
  for (const [, evts] of attackerMap) {
    const country = evts[0]?.attackerCountry ?? ''
    countryActorCounts.set(country, (countryActorCounts.get(country) ?? 0) + 1)
  }

  // Collect unique target industries
  const industrySet = new Set<string>()
  for (const evt of events) {
    if (evt.targetIndustry) industrySet.add(evt.targetIndustry)
  }

  // Create actor nodes + burst nodes + micro-edges
  for (const [attacker, evts] of attackerMap) {
    const country = evts[0]?.attackerCountry ?? ''
    const idx = countryActorIndex.get(country) ?? 0
    countryActorIndex.set(country, idx + 1)
    const total = countryActorCounts.get(country) ?? 1

    const center = getCountryCoords(country)
    const pos = spreadAroundPoint(center, idx, total, 2)
    const avgThreat = Math.round(evts.reduce((s, e) => s + deriveThreatScore(e), 0) / evts.length)

    const actorNode: CyberNode = {
      id: `actor-${attacker}`,
      lat: pos[0],
      lng: pos[1],
      label: attacker.toUpperCase(),
      type: 'actor',
      threatScore: avgThreat,
      country,
      eventCount: evts.length,
      tags: [...new Set(evts.flatMap(e => e.tags ?? []))].slice(0, 5),
    }
    nodes.push(actorNode)

    // Burst nodes for each event
    evts.forEach((evt) => {
      const h = simpleHash(evt.id)
      const angle = ((h % 360) * Math.PI) / 180
      const dist = 0.2 + (((h >> 8) % 100) / 100) * 0.3
      const offset: [number, number] = [
        pos[0] + dist * Math.cos(angle),
        pos[1] + dist * Math.sin(angle),
      ]
      const burstNode: CyberNode = {
        id: `evt-${evt.id}`,
        lat: offset[0],
        lng: offset[1],
        label: (evt.category ?? 'EVENT').toUpperCase().slice(0, 12),
        type: 'cluster',
        threatScore: deriveThreatScore(evt),
        category: evt.category,
        tags: evt.tags,
        parentId: actorNode.id,
      }
      nodes.push(burstNode)

      edges.push({
        id: `me-${evt.id}`,
        sourceId: actorNode.id,
        targetId: burstNode.id,
        protocol: evt.category ?? 'UNKNOWN',
        threatScore: burstNode.threatScore,
        bytesPerSec: 0,
      })
    })
  }

  // Create asset nodes in a ring
  const industries = [...industrySet]
  const centerLat = nodes.length > 0 ? nodes.reduce((s, n) => s + n.lat, 0) / nodes.length : 0
  const centerLng = nodes.length > 0 ? nodes.reduce((s, n) => s + n.lng, 0) / nodes.length : 0

  const attackerEntries = [...attackerMap.entries()]
  industries.forEach((industry, i) => {
    const angle = (2 * Math.PI * i) / industries.length
    const assetNode: CyberNode = {
      id: `target-${industry.replace(/\s+/g, '-').toLowerCase()}`,
      lat: centerLat + 15 * Math.cos(angle),
      lng: centerLng + 15 * Math.sin(angle),
      label: industry.toUpperCase(),
      type: 'asset',
      threatScore: 0,
      targetIndustry: industry,
    }

    let targetingActors = 0
    for (const [attacker, evts] of attackerEntries) {
      if (evts.some(e => e.targetIndustry === industry)) {
        targetingActors++
        const relevantEvts = evts.filter(e => e.targetIndustry === industry)
        edges.push({
          id: `edge-${attacker}-${industry}`.replace(/\s+/g, '-'),
          sourceId: `actor-${attacker}`,
          targetId: assetNode.id,
          protocol: relevantEvts[0]?.category ?? 'THREAT',
          threatScore: Math.round(relevantEvts.reduce((s, e) => s + deriveThreatScore(e), 0) / relevantEvts.length),
          bytesPerSec: 0,
        })
      }
    }
    assetNode.threatScore = Math.min(100, targetingActors * 20)
    assetNode.eventCount = targetingActors
    nodes.push(assetNode)
  })

  return { nodes, edges }
}

async function pollCyberGraph() {
  const accountId = process.env.CF_ACCOUNT_ID
  const apiKey = process.env.CF_API_KEY
  if (!accountId || !apiKey) {
    console.warn('[cyberCache] CF_ACCOUNT_ID or CF_API_KEY not set — skipping')
    return
  }

  try {
    const events = await fetchThreatEvents(accountId, apiKey)
    cache = buildGraph(events)
    console.log(`[cyberCache] OK — ${cache.nodes.length} nodes, ${cache.edges.length} edges`)
  } catch (e) {
    console.error(`[cyberCache] ${e instanceof Error ? e.message : e}`)
  }
}

export function startCyberPoller() {
  console.log('[cyberCache] initial fetch…')
  pollCyberGraph()
  setInterval(pollCyberGraph, POLL_INTERVAL)
}
