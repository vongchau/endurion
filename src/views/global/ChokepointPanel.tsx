// src/views/global/ChokepointPanel.tsx
import { useState, useEffect } from 'react'
import type { Chokepoint } from '../../types'

const TYPE_COLORS: Record<string, string> = {
  Cargo:          '#22c55e',
  Tanker:         '#ef4444',
  Passenger:      '#3b82f6',
  'High Speed':   '#f59e0b',
  'Special Craft': '#8b5cf6',
  Fishing:        '#06b6d4',
  Military:       '#dc2626',
}

export function ChokepointPanel() {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/vessels/chokepoints')
        if (res.ok) setChokepoints(await res.json())
      } catch { /* ignore fetch errors — panel stays stale */ }
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
          const isExpanded = expanded === cp.name
          const types = cp.vesselTypes || {}
          const typeEntries = Object.entries(types).sort((a, b) => b[1] - a[1])

          return (
            <div key={cp.name} className="border-b border-hud-dim/10 last:border-0">
              <button
                onClick={() => setExpanded(isExpanded ? null : cp.name)}
                className="w-full px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
              >
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
              </button>
              {isExpanded && typeEntries.length > 0 && (
                <div className="px-3 pb-1.5 space-y-0.5">
                  {typeEntries.map(([typeName, count]) => (
                    <div key={typeName} className="flex justify-between items-center">
                      <span className="text-[8px] truncate pr-2" style={{ color: TYPE_COLORS[typeName] || '#6b7280' }}>
                        {typeName}
                      </span>
                      <span className="text-[8px] text-hud-dim">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
