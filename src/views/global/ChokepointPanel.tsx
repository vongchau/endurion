// src/views/global/ChokepointPanel.tsx
import { useState, useEffect } from 'react'
import type { Chokepoint } from '../../types'

export function ChokepointPanel() {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([])

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/vessels/chokepoints')
        if (res.ok) setChokepoints(await res.json())
      } catch {}
    }
    fetch_()
    const id = setInterval(fetch_, 30_000)
    return () => clearInterval(id)
  }, [])

  const max = Math.max(...chokepoints.map((c) => c.vesselCount), 1)

  return (
    <div className="fixed bottom-24 left-4 z-30 w-56 bg-hud-panel/90 backdrop-blur-sm
      border border-hud-cyan/20 rounded font-mono overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-cyan/20">
        <span className="text-hud-cyan text-xs">◈</span>
        <span className="text-[10px] tracking-widest text-hud-cyan">CHOKEPOINTS</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {chokepoints.map((cp) => {
          const pct = cp.vesselCount / max
          const color = cp.vesselCount > 50 ? '#ff2d2d'
            : cp.vesselCount > 20 ? '#ffaa00'
            : '#00ff88'
          return (
            <div key={cp.name} className="px-3 py-1.5 border-b border-hud-dim/10 last:border-0">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[9px] text-hud-dim truncate pr-2 flex-1">{cp.name}</span>
                <span className="text-[9px] shrink-0" style={{ color }}>{cp.vesselCount}</span>
              </div>
              <div className="h-0.5 bg-hud-dim/20 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct * 100}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
