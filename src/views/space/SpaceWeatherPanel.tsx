// src/views/space/SpaceWeatherPanel.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSpaceWeather, type SpaceWeatherAlert } from '../../hooks/useSpaceWeather'

const SCALE_COLORS = [
  'text-hud-green',   // 0 — none
  'text-hud-cyan',    // 1 — minor
  'text-hud-amber',   // 2 — moderate
  'text-hud-amber',   // 3 — strong
  'text-hud-red',     // 4 — severe
  'text-hud-red',     // 5 — extreme
]

const SEVERITY_COLORS: Record<SpaceWeatherAlert['severity'], string> = {
  alert:   'text-hud-red border-hud-red/40',
  warning: 'text-hud-amber border-hud-amber/40',
  watch:   'text-hud-cyan border-hud-cyan/40',
  summary: 'text-hud-dim border-hud-dim/40',
}

const CATEGORY_LABELS: Record<SpaceWeatherAlert['category'], string> = {
  geomagnetic:     'GEO',
  solar_radiation: 'SOL',
  radio_blackout:  'RBO',
  electron_flux:   'EFL',
  other:           '---',
}

function ScaleIndicator({ label, value, desc }: { label: string; value: number; desc: string }) {
  const color = SCALE_COLORS[Math.min(value, 5)]
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hud-dim/10">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider w-6">{label}</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="w-1.5 h-3 rounded-sm transition-colors"
              style={{
                backgroundColor: i <= value
                  ? value >= 4 ? '#ff2d2d' : value >= 2 ? '#ffaa00' : '#00d4ff'
                  : '#4a608020',
              }}
            />
          ))}
        </div>
      </div>
      <span className={`font-mono text-xs ${color}`}>
        {value > 0 ? `${label}${value}` : desc.toUpperCase()}
      </span>
    </div>
  )
}

export function SpaceWeatherPanel() {
  const { alerts, scales, kpIndex, loading } = useSpaceWeather(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed left-4 bottom-20 z-40 w-72 rounded-lg border border-hud-amber/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-amber/20">
        <div className="w-1 h-4 bg-hud-amber rounded-full" />
        <span className="font-mono text-[10px] tracking-widest text-hud-amber">SPACE WEATHER</span>
        {scales && (scales.R.scale > 0 || scales.S.scale > 0 || scales.G.scale > 0) && (
          <span className="ml-auto w-2 h-2 rounded-full bg-hud-amber animate-pulse" />
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <span className="font-mono text-[10px] text-hud-dim animate-pulse">ACQUIRING SWPC DATA...</span>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {/* NOAA Scales */}
          {scales && (
            <div className="px-3 pt-2">
              <ScaleIndicator label="R" value={scales.R.scale} desc={scales.R.text} />
              <ScaleIndicator label="S" value={scales.S.scale} desc={scales.S.text} />
              <ScaleIndicator label="G" value={scales.G.scale} desc={scales.G.text} />
            </div>
          )}

          {/* Kp Index */}
          {kpIndex && (
            <div className="px-3">
              <div className="flex items-center justify-between py-1.5 border-b border-hud-dim/10">
                <span className="font-mono text-[10px] text-hud-dim tracking-wider">Kp INDEX</span>
                <span className={`font-mono text-xs ${kpIndex.kp >= 5 ? 'text-hud-red' : kpIndex.kp >= 4 ? 'text-hud-amber' : 'text-hud-green'}`}>
                  {kpIndex.kp.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Recent Alerts */}
          {alerts.length > 0 && (
            <div className="px-3 pt-2 pb-1">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim">RECENT ALERTS</span>
            </div>
          )}
          {alerts.slice(0, 8).map((alert) => (
            <button
              key={alert.id}
              onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
              className="w-full text-left px-3 py-1.5 border-b border-hud-dim/10 hover:bg-hud-amber/5 transition-colors"
            >
              <div className="flex items-start gap-1.5">
                <span className={`mt-0.5 text-[8px] font-mono border px-1 rounded shrink-0 ${SEVERITY_COLORS[alert.severity]}`}>
                  {alert.severity.slice(0, 4).toUpperCase()}
                </span>
                <span className="font-mono text-[9px] text-hud-dim/50 shrink-0">
                  [{CATEGORY_LABELS[alert.category]}]
                </span>
                <span className="font-mono text-[10px] text-hud-text truncate flex-1">
                  {alert.title}
                </span>
              </div>
              <div className="font-mono text-[9px] text-hud-dim/40 mt-0.5">
                {alert.timestamp.slice(0, 16)}
              </div>
              <AnimatePresence>
                {expanded === alert.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="font-mono text-[9px] text-hud-dim leading-relaxed mt-2 whitespace-pre-wrap">
                      {alert.message}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
