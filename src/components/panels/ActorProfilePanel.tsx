// src/components/panels/ActorProfilePanel.tsx — aggregated threat actor detail
import { useHUDStore } from '../../store'
import { IocExport } from '../IocExport'
import { useNow, formatTimeAgo } from '../../hooks/useNow'
import type { ActorProfile } from '../../types'

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1">
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
      <span className="font-mono text-[8px] tracking-[0.2em]" style={{ color }}>{label}</span>
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
    </div>
  )
}

function DataRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
      <span className="font-mono text-[10px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-xs text-right max-w-[60%]" style={{ color: color ?? '#e0f0ff' }}>{value}</span>
    </div>
  )
}

export function ActorProfileDetail({ profile }: { profile: ActorProfile }) {
  const addToWatchlist = useHUDStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useHUDStore((s) => s.removeFromWatchlist)
  const watchlist = useHUDStore((s) => s.watchlist)
  const isWatched = watchlist.has(profile.name.toLowerCase())
  const now = useNow()

  const scoreColor = profile.threatScore > 80 ? '#ff2d2d' : profile.threatScore > 50 ? '#ffaa00' : '#00d4ff'

  const ago = (ts: number) => formatTimeAgo(ts, now) + ' ago'

  return (
    <div className="px-3 pt-2">
      {/* Header */}
      <div className="mb-2 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30">
        THREAT ACTOR — {profile.name}
      </div>

      {/* Watch button */}
      <button
        onClick={() => isWatched ? removeFromWatchlist(profile.name) : addToWatchlist(profile.name)}
        className="w-full mb-2 px-2 py-1 rounded border text-center font-mono text-[9px] tracking-wider transition-colors"
        style={{
          borderColor: isWatched ? '#00ff8840' : '#4a608040',
          color: isWatched ? '#00ff88' : '#4a6080',
          backgroundColor: isWatched ? '#00ff8810' : 'transparent',
        }}
      >
        {isWatched ? 'WATCHING' : 'ADD TO WATCHLIST'}
      </button>

      {/* Stats */}
      {profile.country && <DataRow label="ORIGIN" value={profile.country.toUpperCase()} color="#ff2d2d" />}
      <DataRow label="THREAT SCORE" value={`${profile.threatScore}/100`} color={scoreColor} />
      <DataRow label="ARTICLES" value={profile.articleCount} />
      <DataRow label="FIRST SEEN" value={ago(profile.firstSeen)} />
      <DataRow label="LAST SEEN" value={ago(profile.lastSeen)} />

      {/* Attack types */}
      <SectionHeader label="ATTACK METHODS" color="#ff2d2d" />
      <div className="flex flex-wrap gap-1 mb-2">
        {profile.attackTypes.map(t => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-red/10 text-hud-red border border-hud-red/20">
            {t.replace(/_/g, ' ').toUpperCase()}
          </span>
        ))}
      </div>

      {/* Targets */}
      {profile.targets.length > 0 && (
        <>
          <SectionHeader label="TARGETS" color="#00d4ff" />
          <div className="space-y-1 mb-2">
            {profile.targets.slice(0, 8).map(t => (
              <div key={t.name} className="flex justify-between items-center">
                <span className="font-mono text-[9px] text-hud-cyan truncate">{t.name}</span>
                {t.country && <span className="font-mono text-[8px] text-hud-dim">{t.country}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Malware */}
      {profile.malware.length > 0 && (
        <>
          <SectionHeader label="MALWARE / TOOLS" color="#ff2d2d" />
          <div className="flex flex-wrap gap-1 mb-2">
            {profile.malware.map(m => (
              <span key={m} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-red/10 text-hud-red border border-hud-red/20">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {/* CVEs */}
      {profile.cves.length > 0 && (
        <>
          <SectionHeader label="CVEs" color="#ffaa00" />
          <div className="flex flex-wrap gap-1 mb-2">
            {profile.cves.map(c => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-amber/10 text-hud-amber border border-hud-amber/20">
                {c}
              </span>
            ))}
          </div>
        </>
      )}

      {/* MITRE Tactics */}
      {profile.mitreTactics.length > 0 && (
        <>
          <SectionHeader label="MITRE ATT&CK" color="#00d4ff" />
          <div className="flex flex-wrap gap-1 mb-2">
            {profile.mitreTactics.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-cyan/10 text-hud-cyan border border-hud-cyan/20">
                {t}
              </span>
            ))}
          </div>
        </>
      )}

      {/* IOC Export */}
      <IocExport
        iocs={[]}
        cves={profile.cves}
        malware={profile.malware}
        actor={profile.name}
      />

      {/* Recent articles */}
      <SectionHeader label="RECENT ARTICLES" color="#7b2fff" />
      <div className="space-y-0 mb-2">
        {profile.recentArticles.map(a => (
          <button
            key={a.id}
            className="w-full text-left px-1 py-1.5 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors"
          >
            <div className="font-mono text-[9px] text-hud-text leading-snug line-clamp-2">{a.title}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-[7px]" style={{
                color: a.severity === 'critical' ? '#ff2d2d' : a.severity === 'high' ? '#ffaa00' : '#00d4ff'
              }}>
                {a.severity.toUpperCase()}
              </span>
              <span className="font-mono text-[7px] text-hud-dim">{ago(a.timestamp)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
