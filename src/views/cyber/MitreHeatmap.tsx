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
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const intensity = cell.count / maxCount
          const color = SEVERITY_HEAT[cell.severity as keyof typeof SEVERITY_HEAT] ?? '#4a6080'

          return (
            <div
              key={cell.tacticId}
              className="flex flex-col items-center justify-center p-2 rounded border transition-all hover:scale-105"
              style={{
                borderColor: `${color}${Math.round(intensity * 80 + 20).toString(16).padStart(2, '0')}`,
                backgroundColor: `${color}${Math.round(intensity * 30).toString(16).padStart(2, '0')}`,
              }}
              title={`${cell.tacticName}: ${cell.count} articles (worst: ${cell.severity})`}
            >
              <span className="font-mono text-[8px] text-center leading-tight text-hud-text" style={{ color }}>
                {cell.tacticName.split(' ').slice(0, 2).join(' ')}
              </span>
              <span className="font-mono text-sm tabular-nums mt-1" style={{ color }}>
                {cell.count}
              </span>
              <span className="font-mono text-[7px] text-hud-dim">{cell.tacticId}</span>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
