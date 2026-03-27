// src/components/panels/Timeline/index.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'

const TIME_LABELS = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']

export function Timeline() {
  const panels = useHUDStore((s) => s.panels)
  const activeView = useHUDStore((s) => s.activeView)
  const [scrubPos, setScrubPos] = useState(75) // 0-100 percent

  if (activeView === 'global' || activeView === 'city') return null

  return (
    <AnimatePresence>
      {panels.timeline && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-16 left-80 right-80 z-40 px-4 py-3 rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-hud-cyan tracking-widest">TIMELINE — 2026-03-08</span>
            <span className="font-mono text-[10px] text-hud-dim">
              {Math.floor(scrubPos / 100 * 24).toString().padStart(2, '0')}:
              {Math.floor((scrubPos / 100 * 24 % 1) * 60).toString().padStart(2, '0')}Z
            </span>
          </div>

          {/* Track */}
          <div
            className="relative h-2 bg-hud-dim/20 rounded-full cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setScrubPos(((e.clientX - rect.left) / rect.width) * 100)
            }}
          >
            {/* Fill */}
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-hud-cyan/40 to-hud-cyan rounded-full"
              style={{ width: `${scrubPos}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-hud-cyan border-2 border-hud-bg shadow-cyan-glow"
              style={{ left: `calc(${scrubPos}% - 6px)` }}
            />
            {/* Event ticks */}
            {[15, 28, 45, 62, 78, 90].map((pos) => (
              <div key={pos} className="absolute top-0 w-0.5 h-full bg-hud-amber/60" style={{ left: `${pos}%` }} />
            ))}
          </div>

          {/* Labels */}
          <div className="flex justify-between mt-1">
            {TIME_LABELS.map((t) => (
              <span key={t} className="font-mono text-[9px] text-hud-dim/60">{t}</span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
