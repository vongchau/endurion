// src/views/city/DroneLegend.tsx — UAS color/symbol legend overlay
import { motion } from 'framer-motion'

const ALT_BANDS = [
  { label: '< 50m', color: '#00ff88' },
  { label: '50–120m', color: '#00d4ff' },
  { label: '120–200m', color: '#ffaa00' },
  { label: '> 200m', color: '#ff2d2d' },
]

const SPEED_BANDS = [
  { label: '< 2 m/s', color: '#4a6080', desc: 'Hovering' },
  { label: '2–10 m/s', color: '#7b2fff', desc: 'Slow' },
  { label: '10–20 m/s', color: '#00d4ff', desc: 'Cruising' },
  { label: '20–30 m/s', color: '#ffaa00', desc: 'Fast' },
  { label: '> 30 m/s', color: '#ff2d2d', desc: 'Very fast' },
]

const STATE_ICONS = [
  { label: 'Airborne', symbol: '▲', desc: 'Arrow shows heading' },
  { label: 'Grounded', symbol: '■', desc: 'Hollow dot, dimmed' },
]

export function DroneLegend() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed right-4 bottom-20 z-40 w-48 rounded-lg border border-hud-purple/20 bg-hud-panel/90 backdrop-blur-md overflow-hidden"
    >
      <div className="px-3 py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[8px] tracking-[0.2em] text-hud-purple">UAS LEGEND</span>
      </div>

      {/* Altitude — marker color */}
      <div className="px-3 py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[7px] tracking-wider text-hud-dim">ALTITUDE (MARKER)</span>
        <div className="mt-1 space-y-0.5">
          {ALT_BANDS.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-mono text-[8px]" style={{ color }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Speed — trail color */}
      <div className="px-3 py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[7px] tracking-wider text-hud-dim">SPEED (TRAIL)</span>
        <div className="mt-1 space-y-0.5">
          {SPEED_BANDS.map(({ label, color, desc }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-4 h-0.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-mono text-[8px] text-hud-dim">{desc}</span>
              <span className="font-mono text-[7px] text-hud-dim/50 ml-auto">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* State — icon shape */}
      <div className="px-3 py-1.5">
        <span className="font-mono text-[7px] tracking-wider text-hud-dim">STATE</span>
        <div className="mt-1 space-y-0.5">
          {STATE_ICONS.map(({ label, symbol, desc }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 text-center font-mono text-[10px] text-hud-cyan shrink-0">{symbol}</span>
              <span className="font-mono text-[8px] text-hud-text">{label}</span>
              <span className="font-mono text-[7px] text-hud-dim/50 ml-auto">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
