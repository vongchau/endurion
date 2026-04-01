// src/views/space/OverpassPanel.tsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { OverpassWindow } from './groundStations'

function formatTime(d: Date): string {
  return d.toISOString().slice(11, 16)
}

function formatDuration(start: Date, end: Date): string {
  const min = Math.round((end.getTime() - start.getTime()) / 60_000)
  return `${min}m`
}

function elevColor(deg: number): string {
  if (deg >= 60) return 'text-hud-green'
  if (deg >= 30) return 'text-hud-cyan'
  if (deg >= 15) return 'text-hud-amber'
  return 'text-hud-dim'
}

function qualityLabel(deg: number): string {
  if (deg >= 60) return 'EXCELLENT'
  if (deg >= 30) return 'GOOD'
  if (deg >= 15) return 'FAIR'
  return 'LOW'
}

function useCountdown(target: Date | null): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  if (!target) return '--:--'
  const diff = target.getTime() - now
  if (diff <= 0) return 'NOW'
  const min = Math.floor(diff / 60_000)
  const sec = Math.floor((diff % 60_000) / 1000)
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h ${m}m`
  }
  return `${min}m ${sec.toString().padStart(2, '0')}s`
}

// --- Timeline bar ---

function TimelineBar({ windows }: { windows: OverpassWindow[] }) {
  const now = Date.now()
  const endTime = now + 12 * 60 * 60 * 1000

  return (
    <div className="px-3 py-2 border-t border-hud-dim/10">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[8px] text-hud-dim tracking-wider">12H TIMELINE</span>
        <span className="font-mono text-[8px] text-hud-dim/50">{windows.length} passes</span>
      </div>
      <div className="relative h-3 rounded bg-black/40 border border-hud-dim/10 overflow-hidden">
        {/* Now marker */}
        <div className="absolute top-0 bottom-0 w-px bg-hud-cyan/60 z-10" style={{ left: '0%' }} />
        {/* Pass blocks */}
        {windows.map((w, i) => {
          const start = Math.max(0, (w.startTime.getTime() - now) / (endTime - now)) * 100
          const end = Math.min(100, (w.endTime.getTime() - now) / (endTime - now)) * 100
          const width = Math.max(0.5, end - start)
          const isPast = w.endTime.getTime() < now
          const brightness = Math.min(1, 0.4 + (w.maxElevationDeg / 90) * 0.6)
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                left: `${start}%`,
                width: `${width}%`,
                backgroundColor: isPast ? '#4a608040' : `rgba(0, 255, 136, ${brightness})`,
              }}
              title={`${w.stationName} ${formatTime(w.startTime)}–${formatTime(w.endTime)} UTC (${Math.round(w.maxElevationDeg)}°)`}
            />
          )
        })}
        {/* Hour markers */}
        {[3, 6, 9].map(h => (
          <div
            key={h}
            className="absolute top-0 bottom-0 w-px bg-hud-dim/15"
            style={{ left: `${(h / 12) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="font-mono text-[7px] text-hud-dim/40">NOW</span>
        <span className="font-mono text-[7px] text-hud-dim/40">+6H</span>
        <span className="font-mono text-[7px] text-hud-dim/40">+12H</span>
      </div>
    </div>
  )
}

// --- Main panel ---

interface OverpassPanelProps {
  windows: OverpassWindow[]
  satName: string
  hoveredIdx: number | null
  onHoverIdx: (idx: number | null) => void
  onClickWindow: (window: OverpassWindow) => void
  selectedStationId: string | null
}

export function OverpassPanel({
  windows, satName, hoveredIdx, onHoverIdx, onClickWindow, selectedStationId,
}: OverpassPanelProps) {
  if (windows.length === 0) return null

  const now = new Date()
  const active = windows.filter(w => w.startTime <= now && w.endTime > now)
  const upcoming = windows.filter(w => w.startTime > now)
  const past = windows.filter(w => w.endTime <= now)
  const nextPass = upcoming[0] ?? null
  const countdown = useCountdown(nextPass?.startTime ?? null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed right-80 bottom-6 z-40 w-72 rounded-lg border border-hud-green/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-green/20">
        <div className="w-1 h-4 bg-hud-green rounded-full" />
        <span className="font-mono text-[10px] tracking-widest text-hud-green">GROUND STATION PASSES</span>
        <span className="ml-auto font-mono text-[8px] text-hud-dim">{windows.length}</span>
      </div>

      {/* Satellite + countdown */}
      <div className="px-3 py-1.5 border-b border-hud-dim/10 flex items-center justify-between">
        <div>
          <span className="font-mono text-[9px] text-hud-cyan">{satName}</span>
          {selectedStationId && (
            <span className="font-mono text-[8px] text-hud-green ml-2">FILTERED</span>
          )}
        </div>
        {nextPass && (
          <div className="text-right">
            <span className="font-mono text-[8px] text-hud-dim">NEXT PASS</span>
            <span className="font-mono text-[10px] text-hud-amber ml-1.5">{countdown}</span>
          </div>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto">
        {/* Active passes */}
        {active.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-green">ACTIVE NOW</span>
            </div>
            {active.map((w, i) => {
              const globalIdx = windows.indexOf(w)
              return (
                <PassRow
                  key={`active-${i}`}
                  window={w}
                  isActive
                  isHighlighted={hoveredIdx === globalIdx}
                  onHover={() => onHoverIdx(globalIdx)}
                  onLeave={() => onHoverIdx(null)}
                  onClick={() => onClickWindow(w)}
                />
              )
            })}
          </>
        )}

        {/* Upcoming passes */}
        {upcoming.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim">UPCOMING</span>
            </div>
            {upcoming.slice(0, 20).map((w, i) => {
              const globalIdx = windows.indexOf(w)
              return (
                <PassRow
                  key={`upcoming-${i}`}
                  window={w}
                  isHighlighted={hoveredIdx === globalIdx}
                  onHover={() => onHoverIdx(globalIdx)}
                  onLeave={() => onHoverIdx(null)}
                  onClick={() => onClickWindow(w)}
                />
              )
            })}
          </>
        )}

        {/* Past passes (dimmed) */}
        {past.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim/40">COMPLETED</span>
            </div>
            {past.map((w, i) => {
              const globalIdx = windows.indexOf(w)
              return (
                <PassRow
                  key={`past-${i}`}
                  window={w}
                  isPast
                  isHighlighted={hoveredIdx === globalIdx}
                  onHover={() => onHoverIdx(globalIdx)}
                  onLeave={() => onHoverIdx(null)}
                  onClick={() => onClickWindow(w)}
                />
              )
            })}
          </>
        )}
      </div>

      {/* Timeline bar */}
      <TimelineBar windows={windows} />
    </motion.div>
  )
}

// --- Pass row ---

function PassRow({ window: w, isActive, isPast, isHighlighted, onHover, onLeave, onClick }: {
  window: OverpassWindow
  isActive?: boolean
  isPast?: boolean
  isHighlighted?: boolean
  onHover: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const elev = Math.round(w.maxElevationDeg)
  return (
    <button
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 border-b border-hud-dim/10 transition-colors ${
        isHighlighted ? 'bg-hud-green/10' : isActive ? 'bg-hud-green/5' : 'hover:bg-hud-green/5'
      } ${isPast ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-hud-green animate-pulse" />}
          <span className="font-mono text-[10px] text-hud-text">{w.stationName}</span>
          <span className="font-mono text-[8px] text-hud-dim/50">{w.operator}</span>
        </div>
        <span className={`font-mono text-[9px] ${elevColor(elev)}`}>
          {elev}° {qualityLabel(elev)}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-0.5">
        <span className="font-mono text-[9px] text-hud-dim">
          {formatTime(w.startTime)} — {formatTime(w.endTime)} UTC
        </span>
        <span className="font-mono text-[9px] text-hud-dim/50">
          {formatDuration(w.startTime, w.endTime)}
        </span>
      </div>
    </button>
  )
}
