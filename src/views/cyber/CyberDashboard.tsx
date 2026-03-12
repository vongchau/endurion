// src/views/cyber/CyberDashboard.tsx
import { motion } from 'framer-motion'
import { useThreatStats } from '../../hooks/useCyberAggregations'

const SEVERITY_COLORS = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a6080',
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5">
      <span className="font-mono text-xs tabular-nums" style={{ color: color ?? '#e0f0ff' }}>{value}</span>
      <span className="font-mono text-[7px] tracking-widest text-hud-dim">{label}</span>
    </div>
  )
}

export function CyberDashboard() {
  const stats = useThreatStats(true)

  if (!stats) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-12 left-80 right-80 z-30 flex items-center justify-center"
    >
      <div className="flex items-center gap-0 rounded-lg border border-hud-cyan/20 bg-hud-panel/90 backdrop-blur-md divide-x divide-hud-dim/10">
        <StatBox label="ARTICLES" value={stats.totalArticles} />
        <StatBox label="ACTORS" value={stats.activeActors} color="#ff2d2d" />
        <StatBox label="TARGETS" value={stats.activeTargets} color="#00d4ff" />
        <StatBox label="CRIT/24H" value={stats.criticalCount24h} color={stats.criticalCount24h > 0 ? '#ff2d2d' : '#4a6080'} />
        <StatBox label="HIGH/24H" value={stats.highCount24h} color={stats.highCount24h > 0 ? '#ffaa00' : '#4a6080'} />
        {stats.topAttackTypes[0] && (
          <StatBox label="TOP TYPE" value={stats.topAttackTypes[0].type.replace(/_/g, ' ').toUpperCase()} color="#7b2fff" />
        )}
        {stats.topActors[0] && (
          <StatBox
            label="TOP ACTOR"
            value={stats.topActors[0].name}
            color={SEVERITY_COLORS[stats.topActors[0].severity as keyof typeof SEVERITY_COLORS] ?? '#e0f0ff'}
          />
        )}
        {stats.trendingCves[0] && (
          <StatBox label="TOP CVE" value={stats.trendingCves[0].id} color="#ffaa00" />
        )}
      </div>
    </motion.div>
  )
}
