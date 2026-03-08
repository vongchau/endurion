// src/components/CommandSwitcher/index.tsx
import { motion } from 'framer-motion'
import { useHUDStore } from '../../store'
import type { ViewMode } from '../../types'

const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'global', label: 'GLOBAL', key: '1' },
  { id: 'city', label: 'CITY', key: '2' },
  { id: 'cyber', label: 'CYBER', key: '3' },
]

export function CommandSwitcher() {
  const activeView = useHUDStore((s) => s.activeView)
  const setActiveView = useHUDStore((s) => s.setActiveView)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-full border border-hud-dim/30 bg-hud-panel/80 backdrop-blur-md"
    >
      {VIEWS.map((view) => {
        const isActive = activeView === view.id
        return (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`
              relative px-4 py-1.5 rounded-full font-mono text-xs tracking-widest transition-all duration-300
              ${isActive
                ? 'text-hud-cyan bg-hud-cyan/10 shadow-cyan-glow'
                : 'text-hud-dim hover:text-hud-text'
              }
            `}
          >
            {isActive && (
              <motion.div
                layoutId="activeView"
                className="absolute inset-0 rounded-full border border-hud-cyan/40 bg-hud-cyan/5"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{view.label}</span>
            <span className="relative z-10 ml-1.5 text-[9px] text-hud-dim/60">[{view.key}]</span>
          </button>
        )
      })}
    </motion.div>
  )
}
