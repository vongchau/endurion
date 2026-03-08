// src/views/city/CrimeProfilePanel.tsx
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, LabelList,
} from 'recharts'
import { useHUDStore } from '../../store'
import { useCrimeProfile } from '../../hooks/useCrimeProfile'
import { mapRef } from '../../mapRef'

// Shared chart colors aligned with HUD palette
export const CHART_COLORS = {
  cyan:   '#00d4ff',
  amber:  '#ffaa00',
  red:    '#ff2d2d',
  purple: '#7b2fff',
  green:  '#00ff88',
  dim:    '#4a6080',
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-2 py-4">
      <div className="h-2 bg-hud-cyan/10 rounded w-1/3" />
      <div className="h-24 bg-hud-cyan/5 rounded" />
    </div>
  )
}

function SectionError({ label }: { label: string }) {
  return (
    <div className="py-4 text-[10px] font-mono text-red-500/60 tracking-widest">
      SIGNAL LOST — {label}
    </div>
  )
}

function DemoChart({ title, data, color }: {
  title: string
  data: Record<string, number>
  color: string
}) {
  const chartData = Object.entries(data)
    .map(([label, count]) => ({ label: label.length > 8 ? label.slice(0, 8) : label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] font-mono text-hud-dim tracking-widest mb-1">{title}</div>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: CHART_COLORS.dim, fontSize: 7, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false} />
          <YAxis hide />
          <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CrimeProfilePanel() {
  const selectedCity = useHUDStore((s) => s.selectedCity)
  const setSelectedCity = useHUDStore((s) => s.setSelectedCity)
  const { data, loading, error } = useCrimeProfile(selectedCity?.ori ?? null)

  function handleBack() {
    setSelectedCity(null)
    mapRef.current?.flyTo({ center: [-96, 38], zoom: 3.5, duration: 1500 })
  }

  if (!selectedCity) return null

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.3 }}
      className="fixed right-0 top-0 h-full w-96 bg-hud-panel border-l border-hud-cyan/20
        flex flex-col z-20 overflow-hidden"
    >
      {/* Sticky header */}
      <div className="flex-none border-b border-hud-cyan/20 px-4 py-3">
        <button
          onClick={handleBack}
          className="text-[10px] font-mono text-hud-dim hover:text-hud-cyan transition-colors
            tracking-widest mb-2 flex items-center gap-1"
        >
          ← ALL CITIES
        </button>
        <div className="text-hud-cyan font-mono text-sm tracking-widest">
          {selectedCity.name.toUpperCase()}
        </div>
        <div className="text-hud-dim font-mono text-[10px] tracking-widest mt-0.5">
          CRIME PROFILE 2015–2024 · {selectedCity.state}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        {error && <SectionError label="FBI CDE API" />}
        {loading && (
          <>
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        )}

        {data && !loading && (
          <>
            {/* 10-Year Crime Trend */}
            <div>
              <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">
                10-YEAR VIOLENT CRIME TREND
              </div>
              {data.trend.length === 0 ? (
                <SectionError label="TREND DATA" />
              ) : (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={data.trend}>
                    <XAxis
                      dataKey="year"
                      tick={{ fill: CHART_COLORS.dim, fontSize: 9, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#0a0f1e', border: '1px solid #00d4ff22', fontFamily: 'monospace', fontSize: 10 }}
                      labelStyle={{ color: CHART_COLORS.cyan }}
                      itemStyle={{ color: CHART_COLORS.dim }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={CHART_COLORS.cyan}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top Offenses */}
            <div>
              <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">
                TOP OFFENSES
              </div>
              {data.offenses.length === 0 ? (
                <SectionError label="OFFENSE DATA" />
              ) : (
                <ResponsiveContainer width="100%" height={data.offenses.length * 28 + 8}>
                  <BarChart data={data.offenses} layout="vertical" margin={{ left: 0, right: 40 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="offense"
                      width={110}
                      tick={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ background: '#0a0f1e', border: '1px solid #ffaa0022', fontFamily: 'monospace', fontSize: 10 }}
                      labelStyle={{ color: CHART_COLORS.amber }}
                      itemStyle={{ color: CHART_COLORS.dim }}
                    />
                    <Bar dataKey="count" fill={CHART_COLORS.amber} radius={[0, 2, 2, 0]}>
                      <LabelList dataKey="count" position="right"
                        style={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Weapons */}
            <div>
              <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">WEAPONS</div>
              {data.weapons.length === 0 ? (
                <SectionError label="WEAPON DATA" />
              ) : (
                <ResponsiveContainer width="100%" height={data.weapons.length * 26 + 8}>
                  <BarChart data={data.weapons} layout="vertical" margin={{ left: 0, right: 40 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="weapon" width={110}
                      tick={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }}
                      axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid #ff2d2d22',
                      fontFamily: 'monospace', fontSize: 10 }}
                      labelStyle={{ color: CHART_COLORS.red }} itemStyle={{ color: CHART_COLORS.dim }} />
                    <Bar dataKey="count" fill={CHART_COLORS.red} radius={[0, 2, 2, 0]}>
                      <LabelList dataKey="count" position="right"
                        style={{ fill: CHART_COLORS.dim, fontSize: 8, fontFamily: 'monospace' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Demographics */}
            <div>
              <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">
                DEMOGRAPHICS · RACE BREAKDOWN
              </div>
              <div className="flex gap-2">
                <DemoChart title="OFFENDER" data={data.offenderDemo.race} color={CHART_COLORS.purple} />
                <DemoChart title="VICTIM"   data={data.victimDemo.race}   color={CHART_COLORS.green} />
              </div>
            </div>

            {/* Time of Day */}
            <div>
              <div className="text-[10px] font-mono text-hud-dim tracking-widest mb-2">TIME OF DAY (24H)</div>
              {data.timeOfDay.every((b) => b.count === 0) ? (
                <SectionError label="TIME-OF-DAY DATA" />
              ) : (() => {
                const max = Math.max(...data.timeOfDay.map((b) => b.count), 1)
                return (
                  <ResponsiveContainer width="100%" height={80}>
                    <BarChart data={data.timeOfDay} margin={{ left: 0, right: 0 }}>
                      <XAxis dataKey="hour" tick={{ fill: CHART_COLORS.dim, fontSize: 7, fontFamily: 'monospace' }}
                        tickFormatter={(h) => h % 6 === 0 ? `${h}h` : ''} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid #00d4ff22',
                        fontFamily: 'monospace', fontSize: 10 }}
                        labelFormatter={(h) => `${h}:00`} labelStyle={{ color: CHART_COLORS.cyan }}
                        itemStyle={{ color: CHART_COLORS.dim }} />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {data.timeOfDay.map((entry) => (
                          <Cell
                            key={entry.hour}
                            fill={`rgba(0, 212, 255, ${0.15 + 0.85 * (entry.count / max)})`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="text-[9px] font-mono text-hud-dim/40 tracking-widest text-center pb-4">
              SOURCE: FBI CRIME DATA EXPLORER · UCR/NIBRS
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
