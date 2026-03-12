// src/components/panels/EntityPanel/index.tsx
import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { useVesselIntel } from '../../../hooks/useVesselIntel'
import { IocExport } from '../../IocExport'
import type { GlobalIncident, CyberNode, Satellite, AISVessel, DroneFlight, NewsArticle, CyberNewsArticle, Severity, NewsPriority, ActorProfile, CyberClusterData, TrafficIncident, WeatherAlert, CrimeIncident, LowAltAircraft, PowerOutage } from '../../../types'
import { EnrichedCveSection } from '../CveDetail'
import { ActorProfileDetail } from '../ActorProfilePanel'

const SEVERITY_BG: Record<Severity, string> = {
  critical: 'bg-hud-red/10 text-hud-red border-hud-red/30',
  high: 'bg-hud-amber/10 text-hud-amber border-hud-amber/30',
  medium: 'bg-hud-cyan/10 text-hud-cyan border-hud-cyan/30',
  low: 'bg-hud-dim/10 text-hud-dim border-hud-dim/30',
  nominal: 'bg-hud-green/10 text-hud-green border-hud-green/30',
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
      <span className="font-mono text-[10px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-xs text-hud-text text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function IncidentDetail({ data }: { data: GlobalIncident }) {
  return (
    <>
      <div className={`mx-3 my-2 px-2 py-1 rounded border text-[10px] font-mono ${SEVERITY_BG[data.severity]}`}>
        {data.severity.toUpperCase()} — {data.type}
      </div>
      <div className="px-3">
        <DataRow label="COUNTRY" value={data.country} />
        <DataRow label="TYPE" value={data.type} />
        <DataRow label="TIMESTAMP" value={data.timestamp.replace('T', ' ').slice(0, 19) + 'Z'} />
        <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      </div>
      <div className="px-3 py-2">
        <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.summary}</p>
      </div>
    </>
  )
}

function NodeDetail({ data }: { data: CyberNode }) {
  const scoreColor = data.threatScore > 80 ? 'text-hud-red' : data.threatScore > 60 ? 'text-hud-amber' : 'text-hud-green'
  const typeBadge = data.type === 'actor' ? SEVERITY_BG.critical
    : data.type === 'asset' ? SEVERITY_BG.nominal
    : data.type === 'cluster' ? SEVERITY_BG.medium
    : SEVERITY_BG.high

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${typeBadge}`}>
        {data.type.toUpperCase()} — {data.label}
      </div>
      <DataRow label="NODE" value={data.label} />
      <DataRow label="TYPE" value={data.type.toUpperCase()} />
      {data.country && <DataRow label="COUNTRY" value={data.country.toUpperCase()} />}
      {data.category && <DataRow label="CATEGORY" value={data.category.toUpperCase()} />}
      {data.targetIndustry && <DataRow label="INDUSTRY" value={data.targetIndustry.toUpperCase()} />}
      {data.eventCount !== undefined && <DataRow label="EVENTS" value={data.eventCount} />}
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="flex justify-between items-center py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">THREAT SCORE</span>
        <span className={`font-mono text-xs ${scoreColor}`}>{data.threatScore}/100</span>
      </div>
      {data.tags && data.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-purple/10 text-hud-purple border border-hud-purple/20">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SatelliteDetail({ data }: { data: Satellite }) {
  const isISS = data.type === 'iss'
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${isISS ? SEVERITY_BG.high : SEVERITY_BG.nominal}`}>
        {isISS ? 'STATION' : 'STARLINK'} — NORAD {data.id}
      </div>
      <DataRow label="NAME" value={data.name} />
      <DataRow label="ALTITUDE" value={`${data.altitude} km`} />
      <DataRow label="VELOCITY" value={`${data.velocity} km/s`} />
      <DataRow label="INCLINATION" value={`${data.inclination}°`} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="mt-3 h-16 rounded border border-hud-dim/20 bg-black/40 flex items-center justify-center">
        <span className="font-mono text-[10px] text-hud-dim">[ TELEMETRY STREAM ]</span>
      </div>
    </div>
  )
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1">
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
      <span className="font-mono text-[8px] tracking-[0.2em]" style={{ color }}>{label}</span>
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
    </div>
  )
}

function formatGapDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function VesselDetail({ data }: { data: AISVessel }) {
  const isMilitary = data.shipType === 35 || data.shipType === 55
  const badge = isMilitary ? SEVERITY_BG.high : SEVERITY_BG.nominal
  const badgeLabel = isMilitary ? 'MILITARY' : data.shipTypeName.toUpperCase()
  const speedColor = data.speed > 20 ? 'text-hud-red' : data.speed > 10 ? 'text-hud-amber' : 'text-hud-green'

  const { intel } = useVesselIntel(data.mmsi)

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {badgeLabel} — MMSI {data.mmsi}
      </div>

      {/* ── Identity ── */}
      <DataRow label="NAME"      value={data.name || '—'} />
      <DataRow label="TYPE"      value={`${data.shipTypeName} (${data.shipType})`} />
      {data.callSign && <DataRow label="CALLSIGN" value={data.callSign} />}
      {data.imo > 0 && <DataRow label="IMO" value={data.imo} />}

      {/* ── Navigation ── */}
      <DataRow label="LAT/LNG"   value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="HEADING"   value={`${data.heading}°`} />
      <DataRow label="COURSE"    value={`${data.course.toFixed(1)}°`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${speedColor}`}>{data.speed.toFixed(1)} kn</span>
      </div>
      {data.destination && <DataRow label="DEST" value={data.destination} />}
      {data.draught > 0 && <DataRow label="DRAUGHT" value={`${data.draught.toFixed(1)} m`} />}
      {data.lengthOverall > 0 && <DataRow label="LOA / BEAM" value={`${data.lengthOverall}m × ${data.beam}m`} />}
      {data.eta && <DataRow label="ETA" value={data.eta} />}
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />

      {/* ── Intelligence Analysis ── */}
      {intel?.found && (
        <>
          <SectionHeader label="INTEL ANALYSIS" color="#7b2fff" />

          {/* Military classification */}
          {intel.military.isMilitary ? (
            <div className="my-1.5 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30">
              MILITARY — {intel.military.reason}
            </div>
          ) : (
            <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[10px] text-hud-dim tracking-wider">MIL CLASS</span>
              <span className="font-mono text-xs text-hud-green">CIVILIAN</span>
            </div>
          )}

          {/* Chokepoint proximity */}
          {intel.inChokepoints.length > 0 ? (
            <div className="my-1.5 px-2 py-1 rounded border text-[10px] font-mono bg-hud-amber/10 text-hud-amber border-hud-amber/30">
              IN CHOKEPOINT — {intel.inChokepoints.join(', ')}
            </div>
          ) : intel.nearestChokepoint && (
            <DataRow
              label="NEAREST CP"
              value={`${intel.nearestChokepoint.name} (${intel.nearestChokepoint.distanceDeg}°)`}
            />
          )}

          {/* AIS gap / dark ship detection */}
          {intel.aisGaps.isDarkShip && (
            <div className="my-1.5 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30 animate-pulse">
              DARK SHIP — Reappeared after AIS silence &gt;1h
            </div>
          )}
          <DataRow label="AIS REPORTS" value={intel.aisGaps.totalReports} />
          {intel.aisGaps.maxGapMs > 0 && (
            <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[10px] text-hud-dim tracking-wider">MAX GAP</span>
              <span className={`font-mono text-xs ${intel.aisGaps.maxGapMs > GAP_THRESHOLD_DISPLAY ? 'text-hud-red' : 'text-hud-text'}`}>
                {formatGapDuration(intel.aisGaps.maxGapMs)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const GAP_THRESHOLD_DISPLAY = 60 * 60 * 1000

const NEWS_CATEGORY_COLORS: Record<string, string> = {
  defense_security: '#ff2d2d', osint: '#ff2d2d',
  humanitarian: '#ffaa00', government: '#00d4ff',
  world_news: '#7b2fff', regional: '#7b2fff',
  economic: '#00ff88', tech: '#00ff88',
  think_tanks: '#4a6080', energy_resources: '#4a6080',
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: SEVERITY_BG.critical,
  high: SEVERITY_BG.high,
  medium: SEVERITY_BG.medium,
  low: SEVERITY_BG.low,
}

function NewsDetail({ data }: { data: NewsArticle }) {
  const catColor = NEWS_CATEGORY_COLORS[data.category] || '#7b2fff'

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${PRIORITY_BADGE[data.priority] || SEVERITY_BG.low}`}>
        {data.priority.toUpperCase()} — {data.category.replace(/_/g, ' ').toUpperCase()}
      </div>

      <div className="mb-2">
        <p className="font-mono text-xs text-hud-text leading-relaxed">{data.title}</p>
      </div>

      <DataRow label="SOURCE" value={data.source} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">CATEGORY</span>
        <span className="font-mono text-xs" style={{ color: catColor }}>
          {data.category.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>
      <DataRow label="REGION" value={data.region.replace(/_/g, ' ').toUpperCase()} />
      <DataRow label="TIME" value={data.timestamp ? new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—'} />
      {data.locationName && <DataRow label="LOCATION" value={data.locationName} />}
      {data.latitude !== undefined && data.longitude !== undefined && (
        <DataRow label="LAT/LNG" value={`${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`} />
      )}

      {data.description && (
        <div className="py-2">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}

      {data.link && (
        <a
          href={data.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 mb-2 px-2 py-1.5 rounded border text-center font-mono text-[10px] tracking-widest transition-colors border-hud-cyan/30 text-hud-cyan hover:bg-hud-cyan/10"
        >
          OPEN SOURCE ↗
        </a>
      )}
    </div>
  )
}

const ATTACK_TYPE_COLORS: Record<string, string> = {
  ransomware: '#ff2d2d', apt: '#ff2d2d', phishing: '#ffaa00',
  exploit: '#ffaa00', ddos: '#7b2fff', data_breach: '#ff2d2d',
  vulnerability: '#00d4ff', supply_chain: '#ffaa00', malware: '#ff2d2d',
  other: '#4a6080',
}

function CyberNewsDetail({ data }: { data: CyberNewsArticle }) {
  const sevBadge = data.severity === 'critical' ? SEVERITY_BG.critical
    : data.severity === 'high' ? SEVERITY_BG.high
    : data.severity === 'medium' ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  const attackColor = ATTACK_TYPE_COLORS[data.attackType] || '#4a6080'
  const addToWatchlist = useHUDStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useHUDStore((s) => s.removeFromWatchlist)
  const watchlist = useHUDStore((s) => s.watchlist)

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${sevBadge}`}>
        {data.severity.toUpperCase()} — {data.attackType.replace(/_/g, ' ').toUpperCase()}
      </div>

      {data.sourceActor && (
        <button
          onClick={() => {
            const key = data.sourceActor!.toLowerCase()
            watchlist.has(key) ? removeFromWatchlist(key) : addToWatchlist(key)
          }}
          className="w-full mb-1 px-2 py-1 rounded border text-center font-mono text-[9px] tracking-wider transition-colors"
          style={{
            borderColor: watchlist.has(data.sourceActor!.toLowerCase()) ? '#00ff8840' : '#4a608040',
            color: watchlist.has(data.sourceActor!.toLowerCase()) ? '#00ff88' : '#4a6080',
          }}
        >
          {watchlist.has(data.sourceActor!.toLowerCase()) ? `WATCHING: ${data.sourceActor}` : `WATCH: ${data.sourceActor}`}
        </button>
      )}

      <div className="mb-2">
        <p className="font-mono text-xs text-hud-text leading-relaxed">{data.title}</p>
      </div>

      <DataRow label="SOURCE" value={data.source} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">ATTACK TYPE</span>
        <span className="font-mono text-xs" style={{ color: attackColor }}>
          {data.attackType.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {data.sourceActor && (
        <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
          <span className="font-mono text-[10px] text-hud-dim tracking-wider">ACTOR</span>
          <span className="font-mono text-xs text-hud-red">{data.sourceActor}</span>
        </div>
      )}
      {data.sourceCountry && <DataRow label="ACTOR ORIGIN" value={data.sourceCountry.toUpperCase()} />}

      {data.target && (
        <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
          <span className="font-mono text-[10px] text-hud-dim tracking-wider">TARGET</span>
          <span className="font-mono text-xs text-hud-cyan">{data.target}</span>
        </div>
      )}
      {data.targetCountry && <DataRow label="TARGET COUNTRY" value={data.targetCountry.toUpperCase()} />}

      <DataRow label="TIME" value={data.timestamp ? new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—'} />

      {data.malwareFamily.length > 0 && (
        <>
          <SectionHeader label="MALWARE" color="#ff2d2d" />
          <div className="flex flex-wrap gap-1 mb-2">
            {data.malwareFamily.map(m => (
              <span key={m} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-red/10 text-hud-red border border-hud-red/20">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {data.cves.length > 0 && (
        <>
          <SectionHeader label="CVEs" color="#ffaa00" />
          <EnrichedCveSection cveIds={data.cves} />
        </>
      )}

      {data.iocs.length > 0 && (
        <>
          <SectionHeader label="IOCs" color="#7b2fff" />
          <div className="space-y-0.5 mb-2">
            {data.iocs.slice(0, 10).map(ioc => (
              <div key={ioc} className="font-mono text-[9px] text-hud-purple px-1">{ioc}</div>
            ))}
          </div>
        </>
      )}

      {data.mitreTactics.length > 0 && (
        <>
          <SectionHeader label="MITRE ATT&CK" color="#00d4ff" />
          <div className="flex flex-wrap gap-1 mb-2">
            {data.mitreTactics.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-cyan/10 text-hud-cyan border border-hud-cyan/20">
                {t}
              </span>
            ))}
          </div>
        </>
      )}

      <IocExport
        iocs={data.iocs}
        cves={data.cves}
        malware={data.malwareFamily}
        actor={data.sourceActor}
        title={data.title}
      />

      {data.description && (
        <div className="py-2">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}

      {data.link && (
        <a
          href={data.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 mb-2 px-2 py-1.5 rounded border text-center font-mono text-[10px] tracking-widest transition-colors border-hud-cyan/30 text-hud-cyan hover:bg-hud-cyan/10"
        >
          OPEN SOURCE ↗
        </a>
      )}
    </div>
  )
}

const CLUSTER_PRIORITY_COLORS: Record<NewsPriority, string> = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a6080',
}

function NewsClusterDetail({ data, onSelectArticle }: { data: NewsArticle[]; onSelectArticle: (a: NewsArticle) => void }) {
  const byCategory = new Map<string, number>()
  for (const a of data) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1)
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="px-3 pt-2">
      <div className="mb-2 px-2 py-1 rounded border text-[10px] font-mono bg-hud-purple/10 text-hud-purple border-hud-purple/30">
        CLUSTER — {data.length} EVENTS
      </div>

      {/* Category breakdown */}
      <div className="flex flex-wrap gap-1 mb-3">
        {categories.map(([cat, count]) => (
          <span
            key={cat}
            className="px-1.5 py-0.5 rounded text-[8px] font-mono border"
            style={{
              color: NEWS_CATEGORY_COLORS[cat] || '#7b2fff',
              borderColor: `${NEWS_CATEGORY_COLORS[cat] || '#7b2fff'}40`,
              backgroundColor: `${NEWS_CATEGORY_COLORS[cat] || '#7b2fff'}10`,
            }}
          >
            {cat.replace(/_/g, ' ').toUpperCase()} ({count})
          </span>
        ))}
      </div>

      {/* Article list */}
      <div className="space-y-0">
        {data.map((article) => {
          const priorityColor = CLUSTER_PRIORITY_COLORS[article.priority]
          const ago = Date.now() - article.timestamp
          const timeStr = ago < 3600_000 ? `${Math.round(ago / 60_000)}m`
            : ago < 86400_000 ? `${Math.round(ago / 3600_000)}h`
            : `${Math.round(ago / 86400_000)}d`

          return (
            <button
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="w-full text-left px-2 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: priorityColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] text-hud-text leading-snug line-clamp-2">{article.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[8px] text-hud-dim">{article.source}</span>
                    {article.locationName && (
                      <span className="font-mono text-[8px] text-hud-purple truncate">{article.locationName}</span>
                    )}
                    <span className="font-mono text-[8px] text-hud-dim/50 ml-auto shrink-0">{timeStr}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EdgeDetail({ articles, onSelectArticle }: { articles: CyberNewsArticle[]; onSelectArticle: (a: CyberNewsArticle) => void }) {
  if (articles.length === 0) return null

  const actor = articles[0]?.sourceActor ?? 'Unknown'
  const target = articles[0]?.target ?? 'Unknown'

  return (
    <div className="px-3 pt-2">
      <div className="mb-2 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30">
        ATTACK PATH — {articles.length} ARTICLES
      </div>
      <div className="flex items-center justify-between py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-red">{actor}</span>
        <span className="font-mono text-[10px] text-hud-dim">→</span>
        <span className="font-mono text-[10px] text-hud-cyan">{target}</span>
      </div>

      <div className="space-y-0 mt-2">
        {articles.map(a => {
          const ago = Date.now() - a.timestamp
          const timeStr = ago < 3600_000 ? `${Math.round(ago / 60_000)}m`
            : ago < 86400_000 ? `${Math.round(ago / 3600_000)}h`
            : `${Math.round(ago / 86400_000)}d`
          return (
            <button
              key={a.id}
              onClick={() => onSelectArticle(a)}
              className="w-full text-left px-2 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors"
            >
              <div className="font-mono text-[10px] text-hud-text leading-snug line-clamp-2">{a.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[8px]" style={{
                  color: a.severity === 'critical' ? '#ff2d2d' : a.severity === 'high' ? '#ffaa00' : '#00d4ff'
                }}>
                  {a.severity.toUpperCase()}
                </span>
                <span className="font-mono text-[8px] text-hud-dim">{a.attackType.replace(/_/g, ' ')}</span>
                <span className="font-mono text-[8px] text-hud-dim/50 ml-auto">{timeStr}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CyberClusterDetail({ data, onSelectArticle, onViewProfile }: {
  data: CyberClusterData
  onSelectArticle: (a: CyberNewsArticle) => void
  onViewProfile: () => void
}) {
  const byAttackType = new Map<string, number>()
  for (const a of data.articles) byAttackType.set(a.attackType, (byAttackType.get(a.attackType) ?? 0) + 1)
  const attackTypes = [...byAttackType.entries()].sort((a, b) => b[1] - a[1])

  const headerColor = data.nodeType === 'actor' ? '#ff2d2d' : '#00d4ff'
  const headerBg = data.nodeType === 'actor' ? 'bg-hud-red/10 text-hud-red border-hud-red/30' : 'bg-hud-cyan/10 text-hud-cyan border-hud-cyan/30'

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${headerBg}`}>
        {data.nodeType.toUpperCase()} — {data.label} · {data.articles.length} EVENTS
      </div>

      {/* View actor profile button */}
      {data.nodeType === 'actor' && (
        <button
          onClick={onViewProfile}
          className="w-full mb-2 px-2 py-1 rounded border text-center font-mono text-[9px] tracking-wider transition-colors border-hud-red/30 text-hud-red hover:bg-hud-red/10"
        >
          VIEW FULL ACTOR PROFILE
        </button>
      )}

      {/* Attack type breakdown */}
      <div className="flex flex-wrap gap-1 mb-3">
        {attackTypes.map(([type, count]) => (
          <span
            key={type}
            className="px-1.5 py-0.5 rounded text-[8px] font-mono border"
            style={{
              color: ATTACK_TYPE_COLORS[type] || '#4a6080',
              borderColor: `${ATTACK_TYPE_COLORS[type] || '#4a6080'}40`,
              backgroundColor: `${ATTACK_TYPE_COLORS[type] || '#4a6080'}10`,
            }}
          >
            {type.replace(/_/g, ' ').toUpperCase()} ({count})
          </span>
        ))}
      </div>

      {/* Article list */}
      <div className="space-y-0">
        {data.articles.map(a => {
          const ago = Date.now() - a.timestamp
          const timeStr = ago < 3600_000 ? `${Math.round(ago / 60_000)}m`
            : ago < 86400_000 ? `${Math.round(ago / 3600_000)}h`
            : `${Math.round(ago / 86400_000)}d`
          const sevColor = a.severity === 'critical' ? '#ff2d2d' : a.severity === 'high' ? '#ffaa00' : a.severity === 'medium' ? '#00d4ff' : '#4a6080'

          return (
            <button
              key={a.id}
              onClick={() => onSelectArticle(a)}
              className="w-full text-left px-2 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: sevColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] text-hud-text leading-snug line-clamp-2">{a.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[8px]" style={{ color: sevColor }}>
                      {a.severity.toUpperCase()}
                    </span>
                    <span className="font-mono text-[8px] text-hud-dim">{a.attackType.replace(/_/g, ' ')}</span>
                    {a.sourceActor && data.nodeType === 'target' && (
                      <span className="font-mono text-[8px] text-hud-red truncate">{a.sourceActor}</span>
                    )}
                    {a.target && data.nodeType === 'actor' && (
                      <span className="font-mono text-[8px] text-hud-cyan truncate">{a.target}</span>
                    )}
                    <span className="font-mono text-[8px] text-hud-dim/50 ml-auto shrink-0">{timeStr}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DroneDetail({ data }: { data: DroneFlight }) {
  const isAirborne = data.state === 'airborne' || data.altitude > 5
  const badge = isAirborne ? SEVERITY_BG.medium : SEVERITY_BG.nominal
  const badgeLabel = isAirborne ? 'AIRBORNE' : 'GROUNDED'
  const speedMs = data.speed.toFixed(1)

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        UAS {badgeLabel} — {data.state.toUpperCase()}
      </div>
      <DataRow label="OP ID"     value={data.id} />
      <DataRow label="SENSOR"    value={data.sensorId} />
      <DataRow label="LAT/LNG"   value={`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`} />
      <DataRow label="ALTITUDE"  value={`${Math.round(data.altitude)} m MSL`} />
      <DataRow label="HEADING"   value={`${Math.round(data.heading)}°`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${data.speed > 20 ? 'text-hud-red' : data.speed > 10 ? 'text-hud-amber' : 'text-hud-text'}`}>
          {speedMs} m/s
        </span>
      </div>
      {data.verticalSpeed !== 0 && (
        <DataRow label="V/S" value={`${data.verticalSpeed > 0 ? '+' : ''}${data.verticalSpeed.toFixed(1)} m/s`} />
      )}
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
    </div>
  )
}

function TrafficDetail({ data }: { data: TrafficIncident }) {
  const sevLabel = data.severity >= 4 ? 'MAJOR' : data.severity >= 3 ? 'MODERATE' : data.severity >= 2 ? 'MINOR' : 'MINIMAL'
  const badge = data.severity >= 4 ? SEVERITY_BG.high : data.severity >= 3 ? SEVERITY_BG.medium : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {sevLabel} — {data.category.toUpperCase()}
      </div>
      <DataRow label="CATEGORY" value={data.category.toUpperCase()} />
      <DataRow label="SEVERITY" value={`${data.severity}/4`} />
      <DataRow label="DELAY" value={`${Math.round(data.delay / 60)} min`} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="START" value={new Date(data.startTime).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      {data.endTime && <DataRow label="END" value={new Date(data.endTime).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />}
      {data.description && (
        <div className="py-2">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}
    </div>
  )
}

function WeatherDetail({ data }: { data: WeatherAlert }) {
  const sevBadge = data.severity === 'extreme' ? SEVERITY_BG.critical
    : data.severity === 'severe' ? SEVERITY_BG.high
    : data.severity === 'moderate' ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${sevBadge}`}>
        {data.severity.toUpperCase()} — {data.event}
      </div>
      <DataRow label="EVENT" value={data.event} />
      <DataRow label="SEVERITY" value={data.severity.toUpperCase()} />
      <DataRow label="URGENCY" value={data.urgency.toUpperCase()} />
      <DataRow label="ONSET" value={new Date(data.onset).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      <DataRow label="EXPIRES" value={new Date(data.expires).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      <div className="py-2">
        <p className="font-mono text-xs text-hud-text leading-relaxed">{data.headline}</p>
      </div>
      {data.description && (
        <div className="py-2 border-t border-hud-dim/10">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}
      {data.instruction && (
        <>
          <SectionHeader label="INSTRUCTIONS" color="#00d4ff" />
          <p className="font-mono text-[10px] text-hud-cyan/80 leading-relaxed">{data.instruction}</p>
        </>
      )}
    </div>
  )
}

function CrimeDetail({ data }: { data: CrimeIncident }) {
  const badge = data.severity === 'violent' ? SEVERITY_BG.high
    : data.severity === 'property' ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {data.severity.toUpperCase()} — {data.type}
      </div>
      <DataRow label="TYPE" value={data.type} />
      <DataRow label="SEVERITY" value={data.severity.toUpperCase()} />
      <DataRow label="CITY" value={data.city.toUpperCase()} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="TIME" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      {data.description && (
        <div className="py-2">
          <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.description}</p>
        </div>
      )}
    </div>
  )
}

function AircraftDetail({ data }: { data: LowAltAircraft }) {
  const altBadge = data.altitude < 500 ? SEVERITY_BG.high
    : data.altitude < 1500 ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${altBadge}`}>
        AIRCRAFT — {data.callsign || data.icao24}
      </div>
      <DataRow label="CALLSIGN" value={data.callsign || '—'} />
      <DataRow label="ICAO24" value={data.icao24} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="ALTITUDE" value={`${Math.round(data.altitude)} m`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${data.velocity > 100 ? 'text-hud-red' : 'text-hud-text'}`}>
          {Math.round(data.velocity)} m/s
        </span>
      </div>
      <DataRow label="HEADING" value={`${Math.round(data.heading)}°`} />
      {data.verticalRate !== 0 && (
        <DataRow label="V/S" value={`${data.verticalRate > 0 ? '+' : ''}${data.verticalRate.toFixed(1)} m/s`} />
      )}
      {data.squawk && <DataRow label="SQUAWK" value={data.squawk} />}
      <DataRow label="ON GROUND" value={data.onGround ? 'YES' : 'NO'} />
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
    </div>
  )
}

function PowerDetail({ data }: { data: PowerOutage }) {
  const badge = data.customersAffected > 10000 ? SEVERITY_BG.critical
    : data.customersAffected > 1000 ? SEVERITY_BG.high
    : data.customersAffected > 100 ? SEVERITY_BG.medium
    : SEVERITY_BG.low
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        OUTAGE — {data.county}, {data.state}
      </div>
      <DataRow label="COUNTY" value={data.county} />
      <DataRow label="STATE" value={data.state} />
      <DataRow label="UTILITY" value={data.utility} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">AFFECTED</span>
        <span className={`font-mono text-xs ${data.customersAffected > 10000 ? 'text-hud-red' : data.customersAffected > 1000 ? 'text-hud-amber' : 'text-hud-text'}`}>
          {data.customersAffected.toLocaleString()}
        </span>
      </div>
      <DataRow label="REPORTED" value={new Date(data.reportedStart).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      {data.estimatedRestoration && (
        <DataRow label="EST. RESTORE" value={new Date(data.estimatedRestoration).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
      )}
      {data.cause && <DataRow label="CAUSE" value={data.cause} />}
    </div>
  )
}

export function EntityPanel() {
  const panels = useHUDStore((s) => s.panels)
  const selectedEntity = useHUDStore((s) => s.selectedEntity)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  // Stash cluster data so we can navigate back from a drilled-down article
  const clusterRef = useRef<NewsArticle[] | null>(null)
  const cyberClusterRef = useRef<CyberClusterData | null>(null)
  const canGoBack = (clusterRef.current !== null && selectedEntity?.type === 'news') ||
    (cyberClusterRef.current !== null && selectedEntity?.type === 'cyberNews')

  // Clear stash when entity changes to something unrelated
  if (selectedEntity && selectedEntity.type !== 'news' && selectedEntity.type !== 'newsCluster') {
    clusterRef.current = null
  }
  if (selectedEntity && selectedEntity.type !== 'cyberNews' && selectedEntity.type !== 'cyberCluster' && selectedEntity.type !== 'actorProfile') {
    cyberClusterRef.current = null
  }

  return (
    <AnimatePresence>
      {panels.entity && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="fixed right-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-hud-cyan/20">
            <div className="flex items-center gap-2">
              {canGoBack && (
                <button
                  onClick={() => {
                    if (cyberClusterRef.current && (selectedEntity?.type === 'cyberNews' || selectedEntity?.type === 'actorProfile')) {
                      setSelectedEntity({ type: 'cyberCluster', data: cyberClusterRef.current })
                    } else if (clusterRef.current) {
                      setSelectedEntity({ type: 'newsCluster', data: clusterRef.current })
                    }
                  }}
                  className="font-mono text-[10px] text-hud-dim hover:text-hud-cyan transition-colors mr-1"
                  title="Back to cluster"
                >
                  ←
                </button>
              )}
              <div className="w-1 h-4 bg-hud-purple rounded-full" />
              <span className="font-mono text-[10px] tracking-widest text-hud-purple">
                {canGoBack ? (cyberClusterRef.current ? 'THREAT DETAIL' : 'ARTICLE DETAIL') : 'ENTITY DETAILS'}
              </span>
            </div>
            {selectedEntity && (
              <button onClick={() => { clusterRef.current = null; cyberClusterRef.current = null; setSelectedEntity(null) }} className="text-hud-dim hover:text-hud-text font-mono text-xs">×</button>
            )}
          </div>

          {!selectedEntity ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-[10px] text-hud-dim text-center px-4">
                SELECT AN ENTITY<br />FROM THE MAP OR FEED
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {selectedEntity.type === 'incident' && <IncidentDetail data={selectedEntity.data as GlobalIncident} />}
              {selectedEntity.type === 'node' && <NodeDetail data={selectedEntity.data as CyberNode} />}
              {selectedEntity.type === 'satellite' && <SatelliteDetail data={selectedEntity.data as Satellite} />}
              {selectedEntity.type === 'vessel' && <VesselDetail data={selectedEntity.data as AISVessel} />}
              {selectedEntity.type === 'drone' && <DroneDetail data={selectedEntity.data as DroneFlight} />}
              {selectedEntity.type === 'news' && <NewsDetail data={selectedEntity.data as NewsArticle} />}
              {selectedEntity.type === 'cyberNews' && <CyberNewsDetail data={selectedEntity.data as CyberNewsArticle} />}
              {selectedEntity.type === 'newsCluster' && (
                <NewsClusterDetail
                  data={selectedEntity.data as NewsArticle[]}
                  onSelectArticle={(a) => {
                    clusterRef.current = selectedEntity.data as NewsArticle[]
                    setSelectedEntity({ type: 'news', data: a })
                  }}
                />
              )}
              {selectedEntity.type === 'actorProfile' && (
                <ActorProfileDetail profile={selectedEntity.data as ActorProfile} />
              )}
              {selectedEntity.type === 'cyberCluster' && (
                <CyberClusterDetail
                  data={selectedEntity.data as CyberClusterData}
                  onSelectArticle={(a) => {
                    cyberClusterRef.current = selectedEntity.data as CyberClusterData
                    setSelectedEntity({ type: 'cyberNews', data: a })
                  }}
                  onViewProfile={() => {
                    const cluster = selectedEntity.data as CyberClusterData
                    cyberClusterRef.current = cluster
                    fetch(`/api/cyber/actor/${encodeURIComponent(cluster.label)}`)
                      .then(res => res.ok ? res.json() : null)
                      .then(profile => {
                        if (profile) {
                          setSelectedEntity({ type: 'actorProfile', data: profile })
                          setPanelVisible('entity', true)
                        }
                      })
                      .catch(() => {})
                  }}
                />
              )}
              {selectedEntity.type === 'edgeDetail' && (
                <EdgeDetail
                  articles={selectedEntity.data as CyberNewsArticle[]}
                  onSelectArticle={(a) => setSelectedEntity({ type: 'cyberNews', data: a })}
                />
              )}
              {selectedEntity.type === 'traffic' && <TrafficDetail data={selectedEntity.data as TrafficIncident} />}
              {selectedEntity.type === 'weatherAlert' && <WeatherDetail data={selectedEntity.data as WeatherAlert} />}
              {selectedEntity.type === 'crime' && <CrimeDetail data={selectedEntity.data as CrimeIncident} />}
              {selectedEntity.type === 'aircraft' && <AircraftDetail data={selectedEntity.data as LowAltAircraft} />}
              {selectedEntity.type === 'powerOutage' && <PowerDetail data={selectedEntity.data as PowerOutage} />}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
