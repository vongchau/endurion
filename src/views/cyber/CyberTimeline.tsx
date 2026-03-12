// src/views/cyber/CyberTimeline.tsx
import { motion } from 'framer-motion'
import { useTemporalData } from '../../hooks/useCyberAggregations'

const BAR_COLORS = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a608040',
}

export function CyberTimeline() {
  const buckets = useTemporalData(true, 168)

  if (buckets.length === 0) return null

  const maxTotal = Math.max(...buckets.map(b => b.total), 1)
  const height = 40

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-14 left-80 right-80 z-30 flex flex-col items-center"
    >
      <div className="w-full max-w-2xl rounded-lg border border-hud-dim/20 bg-hud-panel/80 backdrop-blur-md px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[8px] tracking-widest text-hud-dim">THREAT ACTIVITY — 7 DAYS</span>
          <div className="flex gap-2">
            {(['critical', 'high', 'medium'] as const).map(s => (
              <div key={s} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BAR_COLORS[s] }} />
                <span className="font-mono text-[7px] text-hud-dim">{s.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${buckets.length} ${height}`} preserveAspectRatio="none">
          {buckets.map((bucket, i) => {
            const totalH = (bucket.total / maxTotal) * height
            const critH = (bucket.critical / maxTotal) * height
            const highH = (bucket.high / maxTotal) * height
            const medH = (bucket.medium / maxTotal) * height

            let y = height
            const bars: { y: number; h: number; color: string }[] = []

            // Stack: low (bottom) → medium → high → critical (top)
            const lowH = totalH - critH - highH - medH
            if (lowH > 0) { y -= lowH; bars.push({ y, h: lowH, color: BAR_COLORS.low }) }
            if (medH > 0) { y -= medH; bars.push({ y, h: medH, color: BAR_COLORS.medium }) }
            if (highH > 0) { y -= highH; bars.push({ y, h: highH, color: BAR_COLORS.high }) }
            if (critH > 0) { y -= critH; bars.push({ y, h: critH, color: BAR_COLORS.critical }) }

            return bars.map((bar, j) => (
              <rect
                key={`${i}-${j}`}
                x={i}
                y={bar.y}
                width={0.8}
                height={Math.max(bar.h, 0.3)}
                fill={bar.color}
                rx={0.1}
              />
            ))
          })}
        </svg>
        <div className="flex justify-between mt-0.5">
          <span className="font-mono text-[7px] text-hud-dim/50">7d ago</span>
          <span className="font-mono text-[7px] text-hud-dim/50">now</span>
        </div>
      </div>
    </motion.div>
  )
}
