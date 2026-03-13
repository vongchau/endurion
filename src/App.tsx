// src/App.tsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapCanvas } from './components/MapCanvas'
import { CommandSwitcher } from './components/CommandSwitcher'
import { StatusBar } from './components/panels/StatusBar'
import { EventFeedPanel } from './components/panels/EventFeedPanel'
import { EntityPanel } from './components/panels/EntityPanel'
import { Timeline } from './components/panels/Timeline'
import { PanelControls } from './components/PanelControls'
import { CyberDashboard } from './views/cyber/CyberDashboard'
import { CyberTimeline } from './views/cyber/CyberTimeline'
import { MitreHeatmap } from './views/cyber/MitreHeatmap'
import { useHUDStore } from './store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

function BootScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(onComplete, 2000)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-[9998] bg-hud-bg flex flex-col items-center justify-center gap-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="font-mono text-hud-cyan text-lg tracking-[0.5em]"
      >
        ENDURION
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="font-mono text-hud-dim text-xs tracking-widest"
      >
        ALL-SOURCE INTELLIGENCE PLATFORM
      </motion.div>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: 240 }}
        transition={{ delay: 0.6, duration: 1.2, ease: 'easeInOut' }}
        className="h-px bg-gradient-to-r from-transparent via-hud-cyan to-transparent"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="font-mono text-[10px] text-hud-dim/60 tracking-widest"
      >
        INITIALIZING SYSTEMS...
      </motion.div>
    </motion.div>
  )
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const activeView = useHUDStore((s) => s.activeView)
  useKeyboardShortcuts()

  return (
    <div className="relative w-full h-full bg-hud-bg overflow-hidden">
      <AnimatePresence>
        {!booted && <BootScreen onComplete={() => setBooted(true)} />}
      </AnimatePresence>

      <MapCanvas />
      <StatusBar />
      <EventFeedPanel />
      <EntityPanel />
      <Timeline />
      <PanelControls />
      {activeView === 'cyber' && <CyberDashboard />}
      {activeView === 'cyber' && <CyberTimeline />}
      {activeView === 'cyber' && <MitreHeatmap />}
      <CommandSwitcher />
    </div>
  )
}
