// src/components/panels/DroneFlightChart.tsx — altitude + speed sparklines for a drone
import { useState, useEffect, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useHUDStore } from '../../store'

interface ChartPoint {
  time: number
  timeLabel: string
  altitude: number
  speed: number
  lng: number
  lat: number
}

interface DroneFlightChartProps {
  operationId: string
}

function ScrubTooltip(props: {
  active?: boolean
  payload?: Array<{ payload: ChartPoint; value?: number }>
  label?: string
  color: string
  unit: string
  onScrub: (pt: ChartPoint | null) => void
}) {
  const { active, payload, label, color, unit, onScrub } = props
  const pt = active && payload?.[0]?.payload ? payload[0].payload : null

  useEffect(() => {
    onScrub(pt)
  }, [pt, onScrub])

  if (!active || !payload?.length) return null

  const value = payload[0].value

  return (
    <div style={{
      background: '#0a0f1e',
      border: `1px solid ${color}40`,
      borderRadius: '4px',
      padding: '4px 8px',
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#e0f0ff',
    }}>
      <div style={{ color: '#4a6080', fontSize: '8px' }}>{label}</div>
      <div style={{ color }}>{value}{unit}</div>
    </div>
  )
}

export function DroneFlightChart({ operationId }: DroneFlightChartProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(false)
  const setScrubPoint = useHUDStore((s) => s.setDroneScrubPoint)
  const setHistoryTrail = useHUDStore((s) => s.setDroneHistoryTrail)

  useEffect(() => {
    if (!operationId) return
    let active = true
    const doFetch = async () => {
      try {
        const res = await fetch(`/api/drones/${encodeURIComponent(operationId)}/history?hours=1`)
        if (!res.ok || !active) return
        const raw = await res.json() as { altitude: number; speed: number; timestamp: number; lng: number; lat: number }[]
        if (!active) return
        setData(raw.map((r) => ({
          time: r.timestamp,
          timeLabel: new Date(r.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          altitude: Math.round(r.altitude),
          speed: Math.round(r.speed * 10) / 10,
          lng: r.lng,
          lat: r.lat,
        })))
        // Push full history to the store so DroneLayer can render the extended trail
        setHistoryTrail(raw.map((r) => ({ lng: r.lng, lat: r.lat, speed: r.speed, timestamp: r.timestamp })))
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    setLoading(true)
    doFetch()
    return () => { active = false }
  }, [operationId, setHistoryTrail])

  // Clear scrub point and history trail when component unmounts or drone changes
  useEffect(() => {
    return () => { setScrubPoint(null); setHistoryTrail([]) }
  }, [operationId, setScrubPoint, setHistoryTrail])

  const handleScrub = useCallback((pt: ChartPoint | null) => {
    if (pt) {
      setScrubPoint({ lng: pt.lng, lat: pt.lat, altitude: pt.altitude, speed: pt.speed })
    } else {
      setScrubPoint(null)
    }
  }, [setScrubPoint])

  const handleMouseLeave = useCallback(() => {
    setScrubPoint(null)
  }, [setScrubPoint])

  if (loading) {
    return (
      <div className="px-3 py-2">
        <span className="font-mono text-[9px] text-hud-dim animate-pulse">LOADING TELEMETRY...</span>
      </div>
    )
  }

  if (data.length < 2) {
    return (
      <div className="px-3 py-2">
        <span className="font-mono text-[9px] text-hud-dim">INSUFFICIENT TELEMETRY DATA</span>
      </div>
    )
  }

  const maxAlt = Math.max(...data.map(d => d.altitude), 10)
  const maxSpd = Math.max(...data.map(d => d.speed), 1)

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Altitude chart */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[8px] tracking-wider text-hud-dim">ALTITUDE (m)</span>
          <span className="font-mono text-[8px] text-hud-green">{data[data.length - 1]?.altitude}m</span>
        </div>
        <div className="h-16 w-full" onMouseLeave={handleMouseLeave}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timeLabel" hide />
              <YAxis domain={[0, maxAlt]} hide />
              <Tooltip content={(props) => <ScrubTooltip {...props as Record<string, unknown>} color="#00ff88" unit="m" onScrub={handleScrub} />} />
              <Area
                type="monotone"
                dataKey="altitude"
                stroke="#00ff88"
                strokeWidth={1.5}
                fill="url(#altGrad)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Speed chart */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[8px] tracking-wider text-hud-dim">SPEED (m/s)</span>
          <span className="font-mono text-[8px] text-hud-cyan">{data[data.length - 1]?.speed} m/s</span>
        </div>
        <div className="h-16 w-full" onMouseLeave={handleMouseLeave}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="spdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timeLabel" hide />
              <YAxis domain={[0, maxSpd]} hide />
              <Tooltip content={(props) => <ScrubTooltip {...props as Record<string, unknown>} color="#00d4ff" unit=" m/s" onScrub={handleScrub} />} />
              <Area
                type="monotone"
                dataKey="speed"
                stroke="#00d4ff"
                strokeWidth={1.5}
                fill="url(#spdGrad)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Time range label */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[7px] text-hud-dim/50">{data[0]?.timeLabel}</span>
        <span className="font-mono text-[7px] text-hud-dim/50">{data[data.length - 1]?.timeLabel}</span>
      </div>
    </div>
  )
}
