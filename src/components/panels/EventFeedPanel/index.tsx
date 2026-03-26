// src/components/panels/EventFeedPanel/index.tsx
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { useGlobalData } from '../../../hooks/useGlobalData'
import { useFlights } from '../../../hooks/useFlights'
import { useDisruptions } from '../../../hooks/useDisruptions'
import { useDrones } from '../../../hooks/useDrones'
import { useTrafficIncidents } from '../../../hooks/useTrafficIncidents'
import { useWeatherAlerts } from '../../../hooks/useWeatherAlerts'
import { useCrimeIncidents } from '../../../hooks/useCrimeIncidents'
import { useLowAltAircraft } from '../../../hooks/useLowAltAircraft'
import { usePowerOutages } from '../../../hooks/usePowerOutages'
import { useSatellites } from '../../../views/space/useSatellites'
import type { Severity } from '../../../types'
import { incidentToLayer } from '../../../utils/incidentLayer'
import { mapRef } from '../../../mapRef'
import { useSpaceWeather } from '../../../hooks/useSpaceWeather'
import { useChokepoints } from '../../../hooks/useChokepoints'
import { useNews } from '../../../hooks/useNews'
import { useCyberNews } from '../../../hooks/useCyberNews'
import { useCampaigns } from '../../../hooks/useCyberAggregations'
import { useNow, formatTimeAgo } from '../../../hooks/useNow'
import type { NewsPriority } from '../../../types'

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-hud-red border-hud-red/40',
  high: 'text-hud-amber border-hud-amber/40',
  medium: 'text-hud-cyan border-hud-cyan/40',
  low: 'text-hud-dim border-hud-dim/40',
  nominal: 'text-hud-green border-hud-green/40',
}

const SCALE_BAR_COLORS = ['#4a608020', '#00d4ff', '#ffaa00', '#ffaa00', '#ff2d2d', '#ff2d2d']

function ScaleBars({ value }: { value: number }) {
  return (
    <div className="flex gap-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="w-1 h-2.5 rounded-sm"
          style={{ backgroundColor: i <= value ? SCALE_BAR_COLORS[Math.min(value, 5)] : '#4a608020' }}
        />
      ))}
    </div>
  )
}

function SpaceWeatherStrip({ scales, kpIndex }: {
  scales: { R: { scale: number; text: string }; S: { scale: number; text: string }; G: { scale: number; text: string } } | null
  kpIndex: { kp: number } | null
}) {
  if (!scales && !kpIndex) return null
  return (
    <div className="px-3 py-2 border-b border-hud-amber/20 bg-hud-amber/5">
      <div className="flex items-center gap-1 mb-1.5">
        <span className="w-1 h-3 bg-hud-amber rounded-full" />
        <span className="font-mono text-[8px] tracking-[0.2em] text-hud-amber">SPACE WEATHER</span>
        {scales && (scales.R.scale > 0 || scales.S.scale > 0 || scales.G.scale > 0) && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-hud-amber animate-pulse" />
        )}
      </div>
      {scales && (
        <div className="flex gap-3">
          {(['R', 'S', 'G'] as const).map((key) => {
            const val = scales[key].scale
            const color = val >= 4 ? 'text-hud-red' : val >= 2 ? 'text-hud-amber' : val >= 1 ? 'text-hud-cyan' : 'text-hud-green'
            return (
              <div key={key} className="flex items-center gap-1">
                <span className="font-mono text-[9px] text-hud-dim">{key}</span>
                <ScaleBars value={val} />
                <span className={`font-mono text-[9px] ${color}`}>{val}</span>
              </div>
            )
          })}
          {kpIndex && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="font-mono text-[9px] text-hud-dim">Kp</span>
              <span className={`font-mono text-[9px] ${kpIndex.kp >= 5 ? 'text-hud-red' : kpIndex.kp >= 4 ? 'text-hud-amber' : 'text-hud-green'}`}>
                {kpIndex.kp.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CHOKEPOINT_TYPE_COLORS: Record<string, string> = {
  Cargo:          '#22c55e',
  Tanker:         '#ef4444',
  Passenger:      '#3b82f6',
  'High Speed':   '#f59e0b',
  'Special Craft': '#8b5cf6',
  Fishing:        '#06b6d4',
  Military:       '#dc2626',
}

function ChokepointSection({ chokepoints }: { chokepoints: import('../../../types').Chokepoint[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (chokepoints.length === 0) return null

  const max = Math.max(...chokepoints.map((c) => c.vesselCount), 1)

  return (
    <div className="border-t border-hud-green/20">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-green/20 bg-hud-green/5">
        <span className="text-hud-green text-xs">◈</span>
        <span className="font-mono text-[10px] tracking-widest text-hud-green">CHOKEPOINTS</span>
        <span className="ml-auto font-mono text-[9px] text-hud-dim">{chokepoints.reduce((s, c) => s + c.vesselCount, 0)}v</span>
      </div>
      {chokepoints.map((cp) => {
        const pct = cp.vesselCount / max
        const color = cp.vesselCount > 50 ? '#ff2d2d'
          : cp.vesselCount > 20 ? '#ffaa00'
          : '#00ff88'
        const isExpanded = expanded === cp.name
        const types = cp.vesselTypes || {}
        const typeEntries = Object.entries(types).sort((a, b) => b[1] - a[1])

        return (
          <div key={cp.name} className="border-b border-hud-dim/10 last:border-0">
            <button
              onClick={() => setExpanded(isExpanded ? null : cp.name)}
              className="w-full px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-mono text-[9px] text-hud-dim truncate pr-2 flex-1">{cp.name}</span>
                <span className="font-mono text-[9px] shrink-0" style={{ color }}>{cp.vesselCount}</span>
              </div>
              <div className="h-0.5 bg-hud-dim/20 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct * 100}%`, backgroundColor: color }}
                />
              </div>
            </button>
            {isExpanded && typeEntries.length > 0 && (
              <div className="px-3 pb-1.5 space-y-0.5">
                {typeEntries.map(([typeName, count]) => (
                  <div key={typeName} className="flex justify-between items-center">
                    <span className="font-mono text-[8px] truncate pr-2" style={{ color: CHOKEPOINT_TYPE_COLORS[typeName] || '#6b7280' }}>
                      {typeName}
                    </span>
                    <span className="font-mono text-[8px] text-hud-dim">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

type FeedType = 'all' | 'incident' | 'military' | 'maritime' | 'defense' | 'osint' | 'govt' | 'world' | 'humanitarian' | 'tech' | 'economic'

const FEED_TABS: { key: FeedType; label: string; color: string }[] = [
  { key: 'all',          label: 'ALL',          color: '#e0f0ff' },
  { key: 'incident',     label: 'INCIDENTS',    color: '#ff2d2d' },
  { key: 'military',     label: 'MILITARY',     color: '#00d4ff' },
  { key: 'maritime',     label: 'MARITIME',     color: '#00ff88' },
  { key: 'defense',      label: 'DEFENSE',      color: '#ff2d2d' },
  { key: 'osint',        label: 'OSINT',        color: '#ff2d2d' },
  { key: 'govt',         label: 'GOVT',         color: '#00d4ff' },
  { key: 'world',        label: 'WORLD',        color: '#7b2fff' },
  { key: 'humanitarian', label: 'HUMANITARIAN', color: '#ffaa00' },
  { key: 'tech',         label: 'TECH',         color: '#00ff88' },
  { key: 'economic',     label: 'ECONOMIC',     color: '#00ff88' },
]

type CyberFeedType = 'all' | 'ransomware' | 'apt' | 'phishing' | 'exploit' | 'vulnerability' | 'ddos' | 'data_breach' | 'supply_chain' | 'malware'

const CYBER_FEED_TABS: { key: CyberFeedType; label: string; color: string }[] = [
  { key: 'all',            label: 'ALL',            color: '#e0f0ff' },
  { key: 'ransomware',     label: 'RANSOMWARE',     color: '#ff2d2d' },
  { key: 'apt',            label: 'APT',            color: '#ff2d2d' },
  { key: 'phishing',       label: 'PHISHING',       color: '#ffaa00' },
  { key: 'exploit',        label: 'EXPLOIT',        color: '#ffaa00' },
  { key: 'vulnerability',  label: 'VULN',           color: '#00d4ff' },
  { key: 'ddos',           label: 'DDoS',           color: '#7b2fff' },
  { key: 'data_breach',    label: 'DATA BREACH',    color: '#ff2d2d' },
  { key: 'supply_chain',   label: 'SUPPLY CHAIN',   color: '#ffaa00' },
  { key: 'malware',        label: 'MALWARE',        color: '#ff2d2d' },
]

function TabBar<T extends string>({ tabs, active, counts, onChange }: {
  tabs: { key: T; label: string; color: string }[]
  active: T
  counts: Record<T, number>
  onChange: (tab: T) => void
}) {
  const visible = tabs.filter(t => t.key === 'all' || (counts[t.key] ?? 0) > 0)
  return (
    <div className="grid grid-cols-3 gap-1 px-2 py-2 border-b border-hud-dim/10">
      {visible.map(({ key, label, color }) => {
        const isActive = active === key
        const count = counts[key] ?? 0
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="flex items-center justify-between px-2 py-1 rounded font-mono text-[8px] tracking-wider border transition-all"
            style={{
              borderColor: isActive ? color : '#4a608030',
              color: isActive ? color : '#4a6080',
              backgroundColor: isActive ? `${color}15` : 'transparent',
            }}
          >
            <span className="truncate">{label}</span>
            {key !== 'all' && count > 0 && (
              <span className="text-[7px] opacity-60 ml-1 shrink-0">{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-cyan/20">
      <div className="w-1 h-4 bg-hud-cyan rounded-full" />
      <span className="font-mono text-[10px] tracking-widest text-hud-cyan">{title}</span>
    </div>
  )
}

const NEWS_CATEGORY_TO_FEED_TYPE: Record<string, FeedType> = {
  defense_security: 'defense',
  osint: 'osint',
  government: 'govt',
  world_news: 'world',
  regional: 'world',
  humanitarian: 'humanitarian',
  tech: 'tech',
  economic: 'economic',
  think_tanks: 'world',
  energy_resources: 'economic',
}

export function EventFeedPanel() {
  const panels = useHUDStore((s) => s.panels)
  const activeView = useHUDStore((s) => s.activeView)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const [activeFeedTab, setActiveFeedTab] = useState<FeedType>('all')
  const [activeCyberTab, setActiveCyberTab] = useState<CyberFeedType>('all')
  const [showCampaigns, setShowCampaigns] = useState(false)
  const watchlist = useHUDStore((s) => s.watchlist)
  const mitreTacticFilter = useHUDStore((s) => s.mitreTacticFilter)
  const now = useNow()

  const globalLayers = useHUDStore((s) => s.globalLayers)
  const { data: liveIncidents } = useGlobalData()
  const { data: liveFlights } = useFlights()
  const { disruptions } = useDisruptions()

  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const showUAS    = activeView === 'city' && cityLayers.has('uas')
  const { drones } = useDrones(showUAS, mapBounds)

  const showTraffic  = activeView === 'city' && cityLayers.has('traffic')
  const showWeather  = activeView === 'city' && cityLayers.has('weather')
  const showCrime    = activeView === 'city' && cityLayers.has('crime')
  const showAircraft = activeView === 'city' && cityLayers.has('aircraft')
  const showPower    = activeView === 'city' && cityLayers.has('power')

  const mapCenter = mapBounds
    ? { lat: (mapBounds.minLat + mapBounds.maxLat) / 2, lng: (mapBounds.minLng + mapBounds.maxLng) / 2 }
    : null
  const { data: trafficData }  = useTrafficIncidents(showTraffic, mapBounds)
  const { data: weatherData }  = useWeatherAlerts(showWeather, mapCenter)
  const { data: crimeData }    = useCrimeIncidents(showCrime, mapBounds)
  const { data: aircraftData } = useLowAltAircraft(showAircraft, mapBounds)
  const { data: powerData }    = usePowerOutages(showPower, mapCenter)

  const { articles: cyberArticles } = useCyberNews(activeView === 'cyber')
  const campaigns = useCampaigns(activeView === 'cyber')

  // Only fetch satellite data when in space view
  const { satellites, loading: satsLoading } = useSatellites(activeView === 'space')
  const { alerts: swAlerts, scales, kpIndex } = useSpaceWeather(activeView === 'space')
  const chokepoints = useChokepoints(activeView === 'global' && globalLayers.has('maritime'))
  const showNews = activeView === 'global' && globalLayers.has('news')
  const { articles: newsArticles } = useNews(showNews)

  const allGlobalItems = useMemo(() => activeView === 'global'
    ? [
        ...liveIncidents
          .filter((i) => globalLayers.has(incidentToLayer(i)))
          .map(i => ({
            id: i.id,
            label: i.country,
            sublabel: i.type,
            severity: i.severity,
            time: i.timestamp.slice(11, 16),
            source: i.source.toUpperCase(),
            feedType: 'incident' as FeedType,
            onClick: () => setSelectedEntity({ type: 'incident', data: i }),
          })),
        ...(globalLayers.has('military')
          ? liveFlights.map(f => ({
              id: f.id,
              label: f.callsign,
              sublabel: f.country,
              severity: 'medium' as const,
              time: `${Math.round(f.altitude / 1000)}km`,
              source: 'SKY',
              feedType: 'military' as FeedType,
              onClick: () => {},
            }))
          : []),
        ...(globalLayers.has('maritime')
          ? disruptions.map((d) => ({
              id: d.id,
              label: d.name,
              sublabel: d.description,
              severity: (d.severity === 'high' ? 'high'
                : d.severity === 'elevated' ? 'medium'
                : 'low') as Severity,
              time: d.vesselCount > 0 ? `${d.vesselCount}v` : '--',
              source: 'AIS',
              feedType: 'maritime' as FeedType,
              onClick: () => {},
            }))
          : []),
        ...(showNews
          ? newsArticles.slice(0, 50).map(a => {
              const priorityToSeverity: Record<NewsPriority, Severity> = {
                critical: 'critical', high: 'high', medium: 'medium', low: 'low',
              }
              return {
                id: a.id,
                label: a.title,
                sublabel: a.source,
                severity: priorityToSeverity[a.priority],
                time: formatTimeAgo(a.timestamp, now),
                source: 'RSS',
                feedType: (NEWS_CATEGORY_TO_FEED_TYPE[a.category] || 'world') as FeedType,
                onClick: () => {
                  setSelectedEntity({ type: 'news', data: a })
                  setPanelVisible('entity', true)
                },
              }
            })
          : []),
      ]
    : []
  , [activeView, liveIncidents, globalLayers, liveFlights, disruptions, showNews, newsArticles, setSelectedEntity, setPanelVisible, now])

  // Compute tab counts for global view
  const feedCounts = {} as Record<FeedType, number>
  for (const tab of FEED_TABS) feedCounts[tab.key] = 0
  for (const item of allGlobalItems) feedCounts[item.feedType] = (feedCounts[item.feedType] ?? 0) + 1
  feedCounts.all = allGlobalItems.length

  const filteredGlobal = activeFeedTab === 'all'
    ? allGlobalItems
    : allGlobalItems.filter(item => item.feedType === activeFeedTab)

  // Compute cyber items with tab filtering
  const allCyberItems = useMemo(() => activeView === 'cyber'
    ? cyberArticles.map(a => {
        const actorTarget = [a.sourceActor, a.target].filter(Boolean).join(' → ') || a.source
        return {
          id: a.id,
          label: a.title,
          sublabel: actorTarget,
          severity: (a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'high' : a.severity === 'medium' ? 'medium' : 'low') as Severity,
          time: formatTimeAgo(a.timestamp, now),
          source: a.attackType.toUpperCase().slice(0, 4),
          cyberType: a.attackType as CyberFeedType,
          mitreTactics: a.mitreTactics,
          watched: watchlist.has(a.sourceActor?.toLowerCase() ?? '') ||
                   watchlist.has(a.target?.toLowerCase() ?? '') ||
                   a.malwareFamily.some(m => watchlist.has(m.toLowerCase())) ||
                   a.cves.some(c => watchlist.has(c.toLowerCase())),
          onClick: () => {
            setSelectedEntity({ type: 'cyberNews', data: a })
            setPanelVisible('entity', true)
            // Fly to the target location, or fall back to source actor location
            const lat = a.targetLat ?? a.sourceLat
            const lng = a.targetLng ?? a.sourceLng
            if (lat !== undefined && lng !== undefined) {
              mapRef.current?.flyTo({ center: [lng, lat], zoom: 4, duration: 1500 })
            }
          },
        }
      })
    : []
  , [activeView, cyberArticles, watchlist, setSelectedEntity, setPanelVisible, now])

  const cyberCounts = {} as Record<CyberFeedType, number>
  for (const tab of CYBER_FEED_TABS) cyberCounts[tab.key] = 0
  for (const item of allCyberItems) cyberCounts[item.cyberType] = (cyberCounts[item.cyberType] ?? 0) + 1
  cyberCounts.all = allCyberItems.length

  const tabFilteredCyber = activeCyberTab === 'all'
    ? allCyberItems
    : allCyberItems.filter(item => item.cyberType === activeCyberTab)

  const filteredCyber = mitreTacticFilter
    ? tabFilteredCyber.filter(item => item.mitreTactics.includes(mitreTacticFilter))
    : tabFilteredCyber

  const items = activeView === 'global'
    ? filteredGlobal
    : activeView === 'city'
    ? [
        ...drones.map(d => ({
          id: d.id,
          label: d.sensorId,
          sublabel: d.state === 'airborne' ? `${Math.round(d.altitude)}m · ${d.speed.toFixed(1)} m/s` : d.state.toUpperCase(),
          severity: (d.state === 'airborne' ? (d.speed > 20 ? 'high' : 'medium') : 'nominal') as Severity,
          time: `${Math.round(d.heading)}°`,
          source: 'UAS',
          onClick: () => {
            setSelectedEntity({ type: 'drone', data: d })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [d.lng, d.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...trafficData.slice(0, 20).map(t => ({
          id: `tfc-${t.id}`,
          label: t.description || t.category.toUpperCase(),
          sublabel: `${t.category} · ${Math.round(t.delay / 60)}min delay`,
          severity: (t.severity >= 4 ? 'high' : t.severity >= 3 ? 'medium' : t.severity >= 2 ? 'low' : 'nominal') as Severity,
          time: new Date(t.startTime).toISOString().slice(11, 16),
          source: 'TFC',
          onClick: () => {
            setSelectedEntity({ type: 'traffic', data: t })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [t.lng, t.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...weatherData.map(w => ({
          id: `wx-${w.id}`,
          label: w.event,
          sublabel: w.headline,
          severity: (w.severity === 'extreme' ? 'critical' : w.severity === 'severe' ? 'high' : w.severity === 'moderate' ? 'medium' : 'low') as Severity,
          time: new Date(w.onset).toISOString().slice(11, 16),
          source: 'NWS',
          onClick: () => {
            setSelectedEntity({ type: 'weatherAlert', data: w })
            setPanelVisible('entity', true)
          },
        })),
        ...crimeData.slice(0, 20).map(c => ({
          id: `crm-${c.id}`,
          label: c.type,
          sublabel: `${c.city.toUpperCase()} · ${c.description}`,
          severity: (c.severity === 'violent' ? 'high' : c.severity === 'property' ? 'medium' : 'low') as Severity,
          time: new Date(c.timestamp).toISOString().slice(11, 16),
          source: c.city.toUpperCase().slice(0, 3),
          onClick: () => {
            setSelectedEntity({ type: 'crime', data: c })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...aircraftData.map(a => ({
          id: `ac-${a.id}`,
          label: a.callsign || a.icao24,
          sublabel: `${Math.round(a.altitude)}m · ${Math.round(a.velocity)} m/s · ${Math.round(a.heading)}°`,
          severity: (a.altitude < 500 ? 'high' : a.altitude < 1500 ? 'medium' : 'low') as Severity,
          time: `${Math.round(a.altitude)}m`,
          source: 'SKY',
          onClick: () => {
            setSelectedEntity({ type: 'aircraft', data: a })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [a.lng, a.lat], zoom: 14, duration: 1500 })
          },
        })),
        ...powerData.slice(0, 10).map(p => ({
          id: `pwr-${p.id}`,
          label: `${p.county}, ${p.state}`,
          sublabel: `${p.utility} · ${p.customersAffected.toLocaleString()} affected`,
          severity: (p.customersAffected > 10000 ? 'critical' : p.customersAffected > 1000 ? 'high' : p.customersAffected > 100 ? 'medium' : 'low') as Severity,
          time: p.cause || '—',
          source: 'PWR',
          onClick: () => {
            setSelectedEntity({ type: 'powerOutage', data: p })
            setPanelVisible('entity', true)
            mapRef.current?.flyTo({ center: [p.centroid.lng, p.centroid.lat], zoom: 10, duration: 1500 })
          },
        })),
      ].sort((a, b) => {
        const sevOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, nominal: 4 }
        return sevOrder[a.severity] - sevOrder[b.severity]
      })
    : activeView === 'cyber'
    ? filteredCyber
    : activeView === 'space'
    ? [
        ...swAlerts.slice(0, 5).map(a => ({
          id: a.id,
          label: a.title,
          sublabel: a.category.replace('_', ' ').toUpperCase(),
          severity: (a.severity === 'alert' ? 'critical' : a.severity === 'warning' ? 'high' : 'medium') as Severity,
          time: a.timestamp.slice(5, 16),
          source: 'SWPC',
          onClick: () => {},
        })),
        ...[...satellites]
          .sort((a, b) => b.altitude - a.altitude)
          .slice(0, 50)
          .map(s => ({
            id: s.id,
            label: s.name,
            sublabel: `${s.altitude} km`,
            severity: (s.type === 'iss' ? 'high' : 'nominal') as Severity,
            time: `${s.velocity} km/s`,
            source: s.type === 'iss' ? 'ISS' : 'SAT',
            onClick: () => {
              setSelectedEntity({ type: 'satellite', data: s })
              setPanelVisible('entity', true)
              mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 4, duration: 1500 })
            },
          })),
      ]
    : []

  return (
    <AnimatePresence>
      {panels.eventFeed && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="fixed left-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <PanelHeader title={
            activeView === 'global'
              ? `LIVE EVENT FEED · ${items.length}`
              : activeView === 'city'
              ? `CITY FEED · ${items.length}`
              : activeView === 'space'
              ? 'TRACKED OBJECTS'
              : `THREAT FEED · ${items.length}`
          } />
          {activeView === 'global' && (
            <TabBar tabs={FEED_TABS} active={activeFeedTab} counts={feedCounts} onChange={setActiveFeedTab} />
          )}
          {activeView === 'cyber' && (
            <TabBar tabs={CYBER_FEED_TABS} active={activeCyberTab} counts={cyberCounts} onChange={setActiveCyberTab} />
          )}
          {activeView === 'cyber' && campaigns.length > 0 && (
            <button
              onClick={() => setShowCampaigns(!showCampaigns)}
              className="mx-2 mb-1 px-2 py-1 rounded border font-mono text-[8px] tracking-wider transition-all"
              style={{
                borderColor: showCampaigns ? '#7b2fff' : '#4a608030',
                color: showCampaigns ? '#7b2fff' : '#4a6080',
                backgroundColor: showCampaigns ? '#7b2fff15' : 'transparent',
              }}
            >
              CAMPAIGNS ({campaigns.length})
            </button>
          )}
          {activeView === 'space' && <SpaceWeatherStrip scales={scales} kpIndex={kpIndex} />}
          {activeView === 'space' && satsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="font-mono text-[10px] text-hud-dim animate-pulse">ACQUIRING SIGNALS...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {activeView === 'cyber' && showCampaigns && (
                <div className="border-t border-hud-purple/20">
                  {campaigns.map(c => {
                    const sevColor = c.severity === 'critical' ? '#ff2d2d' : c.severity === 'high' ? '#ffaa00' : '#00d4ff'
                    return (
                      <div key={c.id} className="px-3 py-2 border-b border-hud-dim/10">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-hud-red">{c.actor}</span>
                          <span className="font-mono text-[8px]" style={{ color: sevColor }}>{c.severity.toUpperCase()}</span>
                        </div>
                        <div className="font-mono text-[9px] text-hud-dim mt-0.5">
                          {c.attackType.replace(/_/g, ' ')} → {c.targets.slice(0, 3).join(', ')}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-[8px] text-hud-purple">{c.articleCount} articles</span>
                          {c.malware.length > 0 && <span className="font-mono text-[8px] text-hud-red">{c.malware[0]}</span>}
                          <span className="font-mono text-[8px] text-hud-dim/50 ml-auto">{formatTimeAgo(c.lastSeen, now)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {items.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={i < 20 ? { opacity: 0, x: -10 } : undefined}
                  animate={{ opacity: 1, x: 0 }}
                  transition={i < 20 ? { delay: i * 0.02 } : { duration: 0 }}
                  onClick={item.onClick}
                  className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors flex items-start gap-2"
                  style={'watched' in item && item.watched ? { borderLeft: '2px solid #00ff88' } : undefined}
                >
                  <span className={`mt-0.5 text-[9px] font-mono border px-1 rounded ${SEVERITY_COLORS[item.severity]}`}>
                    {item.severity.toUpperCase().slice(0, 4)}
                  </span>
                  {item.source && (
                    <span className="font-mono text-[9px] text-hud-dim/50 shrink-0">[{item.source}]</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-hud-text truncate">{item.label}</div>
                    <div className="font-mono text-[10px] text-hud-dim truncate">{item.sublabel}</div>
                  </div>
                  <span className="font-mono text-[10px] text-hud-dim/60 shrink-0">{item.time}</span>
                </motion.button>
              ))}
              {activeView === 'city' && cityLayers.has('crime') && crimeData.length === 0 && (
                <div className="px-3 py-2 border-t border-hud-dim/10">
                  <span className="font-mono text-[8px] text-hud-dim/40 tracking-wider">
                    CRIME DATA — AVAILABLE IN CHI / NYC / LA
                  </span>
                </div>
              )}
              {activeView === 'global' && globalLayers.has('maritime') && (activeFeedTab === 'all' || activeFeedTab === 'maritime') && (
                <ChokepointSection chokepoints={chokepoints} />
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
