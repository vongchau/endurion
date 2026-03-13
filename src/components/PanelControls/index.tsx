// src/components/PanelControls/index.tsx
import { motion } from 'framer-motion'
import { useHUDStore } from '../../store'
import type { PanelState } from '../../types'

const CONTROLS: { panel: keyof PanelState; label: string; icon: string; position: string }[] = [
  { panel: 'eventFeed', label: 'FEED', icon: '▤', position: 'left-4 top-1/2 -translate-y-1/2' },
  { panel: 'entity', label: 'ENTITY', icon: '▦', position: 'right-4 top-1/2 -translate-y-1/2' },
  { panel: 'statusBar', label: 'STATUS', icon: '▬', position: 'top-14 left-1/2 -translate-x-1/2' },
  { panel: 'timeline', label: 'TIMELINE', icon: '▭', position: 'bottom-[5.5rem] right-6' },
]

export function PanelControls() {
  const panels = useHUDStore((s) => s.panels)
  const togglePanel = useHUDStore((s) => s.togglePanel)

  return (
    <>
      {CONTROLS.map(({ panel, label, icon, position }) => {
        const isOpen = panels[panel]
        return (
          <motion.button
            key={panel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            onClick={() => togglePanel(panel)}
            title={`Toggle ${label}`}
            className={`fixed ${position} z-50 w-7 h-7 flex items-center justify-center rounded border font-mono text-xs transition-all duration-200 ${
              isOpen
                ? 'border-hud-cyan/40 text-hud-cyan bg-hud-cyan/10'
                : 'border-hud-dim/30 text-hud-dim/60 bg-hud-panel/60 hover:border-hud-dim/60 hover:text-hud-dim'
            }`}
          >
            {icon}
          </motion.button>
        )
      })}
    </>
  )
}
