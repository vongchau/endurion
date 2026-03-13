// src/views/cyber/MitreHeatmap.tsx
import { motion } from 'framer-motion'
import { useMitreHeatmap } from '../../hooks/useCyberAggregations'
import { useHUDStore } from '../../store'

const SEVERITY_HEAT = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a6080',
}

export function MitreHeatmap() {
  const cyberPanel = useHUDStore((s) => s.cyberPanel)
  const mitreTacticFilter = useHUDStore((s) => s.mitreTacticFilter)
  const setMitreTacticFilter = useHUDStore((s) => s.setMitreTacticFilter)
  const cells = useMitreHeatmap(cyberPanel === 'mitre')

  if (cyberPanel !== 'mitre' || cells.length === 0) return null

  const maxCount = Math.max(...cells.map(c => c.count), 1)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-30 w-[700px] rounded-lg border border-hud-cyan/20 bg-hud-panel/95 backdrop-blur-md p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-hud-cyan rounded-full" />
        <span className="font-mono text-[10px] tracking-widest text-hud-cyan">MITRE ATT&amp;CK — TACTIC COVERAGE</span>
        {mitreTacticFilter && (
          <button
            onClick={() => setMitreTacticFilter(null)}
            className="ml-auto font-mono text-[8px] tracking-wider text-hud-dim hover:text-hud-text transition-colors"
          >
            CLEAR FILTER
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const intensity = cell.count / maxCount
          const color = SEVERITY_HEAT[cell.severity as keyof typeof SEVERITY_HEAT] ?? '#4a6080'
          const isSelected = mitreTacticFilter === cell.tacticName
          const isDimmed = mitreTacticFilter !== null && !isSelected

          return (
            <button
              key={cell.tacticId}
              onClick={() => setMitreTacticFilter(isSelected ? null : cell.tacticName)}
              className="flex flex-col items-center justify-center p-2 rounded border transition-all hover:scale-105 cursor-pointer"
              style={{
                borderColor: isSelected ? color : `${color}${Math.round(intensity * 80 + 20).toString(16).padStart(2, '0')}`,
                backgroundColor: isSelected ? `${color}30` : `${color}${Math.round(intensity * 30).toString(16).padStart(2, '0')}`,
                opacity: isDimmed ? 0.35 : 1,
                boxShadow: isSelected ? `0 0 12px ${color}40, inset 0 0 8px ${color}15` : 'none',
              }}
              title={`${cell.tacticName}: ${cell.count} articles (worst: ${cell.severity})${isSelected ? ' — click to clear' : ''}`}
            >
              <span className="font-mono text-[8px] text-center leading-tight text-hud-text" style={{ color }}>
                {cell.tacticName.split(' ').slice(0, 2).join(' ')}
              </span>
              <span className="font-mono text-sm tabular-nums mt-1" style={{ color }}>
                {cell.count}
              </span>
              <span className="font-mono text-[7px] text-hud-dim">{cell.tacticId}</span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
