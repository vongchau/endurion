// src/views/city/DroneTimeline.tsx — 24h playback scrubber for drone history
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useHUDStore } from '../../store'
import { useNow } from '../../hooks/useNow'

const HOURS_24 = 24 * 60 * 60 * 1000
const SPEEDS = [1, 5, 10, 30, 60]

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatTimeDetailed(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

interface DroneTimelineProps {
  positionCount: number
  timeRange: { from: number; to: number } | null
}

export function DroneTimeline({ positionCount, timeRange }: DroneTimelineProps) {
  const playback = useHUDStore((s) => s.dronePlayback)
  const playbackTime = useHUDStore((s) => s.dronePlaybackTime)
  const playbackSpeed = useHUDStore((s) => s.dronePlaybackSpeed)
  const setPlayback = useHUDStore((s) => s.setDronePlayback)
  const setPlaybackTime = useHUDStore((s) => s.setDronePlaybackTime)
  const setPlaybackSpeed = useHUDStore((s) => s.setDronePlaybackSpeed)

  const [playing, setPlaying] = useState(false)
  const animRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const isHistory = playback === 'history'
  const now = useNow()
  const rangeStart = now - HOURS_24
  const rangeEnd = now

  // Playback animation loop
  useEffect(() => {
    if (!playing || !isHistory || playbackTime === null) return
    lastFrameRef.current = performance.now()

    const tick = (now: number) => {
      const dt = now - lastFrameRef.current
      lastFrameRef.current = now
      const advance = dt * playbackSpeed
      const nextTime = (playbackTime ?? rangeStart) + advance

      if (nextTime >= rangeEnd) {
        setPlaybackTime(rangeEnd)
        setPlaying(false)
        return
      }
      setPlaybackTime(nextTime)
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [playing, isHistory, playbackTime, playbackSpeed, rangeStart, rangeEnd, setPlaybackTime])

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = rangeStart + pct * HOURS_24
    setPlaybackTime(time)
    if (!isHistory) setPlayback('history')
  }, [rangeStart, isHistory, setPlayback, setPlaybackTime])

  const handleDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    handleTrackClick(e)
  }, [handleTrackClick])

  const progress = playbackTime !== null
    ? Math.max(0, Math.min(1, (playbackTime - rangeStart) / HOURS_24))
    : 0

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackSpeed)
    setPlaybackSpeed(SPEEDS[(idx + 1) % SPEEDS.length])
  }

  // Hour tick marks
  const ticks = []
  for (let i = 0; i <= 24; i += 3) {
    ticks.push(i)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-0 left-0 right-0 z-40 h-14 flex items-center gap-3 px-4 border-t border-hud-purple/20 bg-hud-panel/90 backdrop-blur-md"
    >
      {/* History / Live toggle */}
      {isHistory ? (
        <button
          onClick={() => { setPlaying(false); setPlayback('live') }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-hud-green/40 font-mono text-[10px] tracking-wider text-hud-green hover:bg-hud-green/10 transition-colors shrink-0"
        >
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hud-green opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-hud-green" />
          </span>
          LIVE
        </button>
      ) : (
        <button
          onClick={() => setPlayback('history')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-hud-purple/40 font-mono text-[10px] tracking-wider text-hud-purple hover:bg-hud-purple/10 transition-colors shrink-0"
        >
          HISTORY
        </button>
      )}

      {/* Play / Pause */}
      <button
        onClick={() => {
          if (!isHistory) {
            setPlayback('history')
            setPlaying(true)
          } else {
            setPlaying(!playing)
          }
        }}
        className="w-7 h-7 rounded border border-hud-cyan/30 flex items-center justify-center font-mono text-hud-cyan hover:bg-hud-cyan/10 transition-colors shrink-0"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      {/* Speed */}
      <button
        onClick={cycleSpeed}
        className="px-1.5 py-0.5 rounded border border-hud-dim/30 font-mono text-[9px] tracking-wider text-hud-dim hover:text-hud-cyan hover:border-hud-cyan/30 transition-colors shrink-0"
        title="Playback speed"
      >
        {playbackSpeed}×
      </button>

      {/* Timeline track */}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        {/* Current time display */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-hud-dim tracking-wider">
            {isHistory && playbackTime ? formatTimeDetailed(playbackTime) : 'NOW'}
          </span>
          <span className="font-mono text-[8px] text-hud-dim/50 tracking-wider">
            {positionCount > 0 ? `${positionCount.toLocaleString()} PTS` : '—'}
          </span>
        </div>

        {/* Track bar */}
        <div
          ref={trackRef}
          className="relative h-4 cursor-pointer group"
          onClick={handleTrackClick}
          onMouseMove={handleDrag}
        >
          {/* Background */}
          <div className="absolute top-1.5 left-0 right-0 h-1 rounded-full bg-hud-dim/20" />

          {/* Filled portion */}
          {isHistory && (
            <div
              className="absolute top-1.5 left-0 h-1 rounded-full bg-hud-purple/60"
              style={{ width: `${progress * 100}%` }}
            />
          )}

          {/* Data range indicator */}
          {timeRange && (
            <div
              className="absolute top-1.5 h-1 rounded-full bg-hud-purple/20"
              style={{
                left: `${Math.max(0, (timeRange.from - rangeStart) / HOURS_24 * 100)}%`,
                width: `${Math.min(100, (timeRange.to - timeRange.from) / HOURS_24 * 100)}%`,
              }}
            />
          )}

          {/* Hour ticks */}
          {ticks.map(h => (
            <div key={h} className="absolute top-0" style={{ left: `${(h / 24) * 100}%` }}>
              <div className="w-px h-1.5 bg-hud-dim/30" />
            </div>
          ))}

          {/* Playhead */}
          {isHistory && (
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${progress * 100}%` }}
            >
              <div className="w-0.5 h-4 bg-hud-cyan rounded-full shadow-[0_0_6px_#00d4ff]" />
            </div>
          )}
        </div>

        {/* Hour labels */}
        <div className="flex justify-between">
          {ticks.map(h => (
            <span key={h} className="font-mono text-[7px] text-hud-dim/40">
              {formatTime(rangeStart + h * 60 * 60 * 1000)}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
