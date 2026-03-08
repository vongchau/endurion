// src/components/panels/StatusBar/index.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { globalIncidents } from '../../../data/global-incidents'

const VIEW_LABELS = {
  global: { title: 'GLOBAL THREAT OVERVIEW', subtitle: 'ALL-SOURCE INTELLIGENCE' },
  city: { title: 'URBAN SURVEILLANCE', subtitle: 'CITY OPERATIONS CENTER' },
  cyber: { title: 'CYBER OPERATIONS', subtitle: 'NETWORK THREAT INTELLIGENCE' },
}

const criticalCount = globalIncidents.filter(i => i.severity === 'critical').length
const highCount = globalIncidents.filter(i => i.severity === 'high').length

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  )
}

export function StatusBar() {
  const activeView = useHUDStore((s) => s.activeView)
  const panels = useHUDStore((s) => s.panels)
  const label = VIEW_LABELS[activeView]

  return (
    <AnimatePresence>
      {panels.statusBar && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-40 h-12 flex items-center justify-between px-4 border-b border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md"
        >
          {/* Left: branding */}
          <div className="flex items-center gap-3">
            <PulsingDot color="bg-hud-green" />
            <span className="font-mono text-xs text-hud-dim tracking-widest">GOTHAMHUD</span>
            <span className="text-hud-dim/40">|</span>
            <span className="font-mono text-xs text-hud-cyan tracking-widest">{label.title}</span>
          </div>

          {/* Center: view subtitle */}
          <div className="font-mono text-[10px] text-hud-dim tracking-[0.2em]">
            {label.subtitle}
          </div>

          {/* Right: threat counts */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-hud-red" />
              <span className="font-mono text-xs text-hud-dim">
                CRITICAL <span className="text-hud-red">{criticalCount}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-hud-amber" />
              <span className="font-mono text-xs text-hud-dim">
                HIGH <span className="text-hud-amber">{highCount}</span>
              </span>
            </div>
            <div className="font-mono text-[10px] text-hud-dim/60">
              {new Date().toISOString().slice(0, 19).replace('T', ' ')}Z
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
