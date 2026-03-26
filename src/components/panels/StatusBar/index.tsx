// src/components/panels/StatusBar/index.tsx
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { useGlobalData } from '../../../hooks/useGlobalData'
import type { GlobalLayer, CityLayer, CityBasemap, CyberPanel } from '../../../types'

const VIEW_LABELS = {
  global: { title: 'GLOBAL THREAT OVERVIEW', subtitle: 'ALL-SOURCE INTELLIGENCE' },
  city: { title: 'URBAN SURVEILLANCE', subtitle: 'CITY OPERATIONS CENTER' },
  cyber: { title: 'CYBER OPERATIONS', subtitle: 'NETWORK THREAT INTELLIGENCE' },
  space: { title: 'ORBITAL SURVEILLANCE', subtitle: 'SPACE DOMAIN AWARENESS' },
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  )
}

const GLOBAL_LAYERS: { key: GlobalLayer; label: string; color: string }[] = [
  { key: 'conflict', label: 'CONFLICT', color: '#ff2d2d' },
  { key: 'disaster', label: 'DISASTER', color: '#ffaa00' },
  { key: 'military', label: 'MILITARY', color: '#00d4ff' },
  { key: 'maritime', label: 'MARITIME', color: '#00ff88' },
  { key: 'news',     label: 'NEWS',     color: '#7b2fff' },
]

function LayerDropdown() {
  const [open, setOpen] = useState(false)
  const globalLayers = useHUDStore((s) => s.globalLayers)
  const toggleGlobalLayer = useHUDStore((s) => s.toggleGlobalLayer)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeCount = globalLayers.size

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-hud-cyan/30 font-mono text-[10px] tracking-wider text-hud-cyan hover:bg-hud-cyan/10 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-hud-cyan" />
        LAYERS
        <span className="text-hud-dim">{activeCount}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M0 0L4 5L8 0Z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-hud-cyan/20 bg-hud-panel/95 backdrop-blur-md shadow-lg overflow-hidden z-50"
          >
            <div className="px-3 py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim">MAP LAYERS</span>
            </div>
            {GLOBAL_LAYERS.map(({ key, label, color }) => {
              const active = globalLayers.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleGlobalLayer(key)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: active ? color : '#4a6080',
                      backgroundColor: active ? `${color}20` : 'transparent',
                    }}
                  >
                    {active && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="font-mono text-[10px] tracking-wider"
                    style={{ color: active ? color : '#4a6080' }}
                  >
                    {label}
                  </span>
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full transition-colors"
                    style={{ backgroundColor: active ? color : '#4a608030' }}
                  />
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const CITY_LAYERS: { key: CityLayer; label: string; color: string }[] = [
  { key: 'uas',      label: 'UAS',      color: '#7b2fff' },
  { key: 'zones',    label: 'ZONES',    color: '#ffaa00' },
  { key: 'traffic',  label: 'TRAFFIC',  color: '#ff2d2d' },
  { key: 'weather',  label: 'WEATHER',  color: '#00d4ff' },
  { key: 'crime',    label: 'CRIME',    color: '#ff6b35' },
  { key: 'aircraft', label: 'AIRCRAFT', color: '#3b82f6' },
  { key: 'power',    label: 'POWER',    color: '#fbbf24' },
]

function CityLayerDropdown() {
  const [open, setOpen] = useState(false)
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const toggleCityLayer = useHUDStore((s) => s.toggleCityLayer)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-hud-purple/30 font-mono text-[10px] tracking-wider text-hud-purple hover:bg-hud-purple/10 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-hud-purple" />
        LAYERS
        <span className="text-hud-dim">{cityLayers.size}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M0 0L4 5L8 0Z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-hud-purple/20 bg-hud-panel/95 backdrop-blur-md shadow-lg overflow-hidden z-50"
          >
            <div className="px-3 py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim">MAP LAYERS</span>
            </div>
            {CITY_LAYERS.map(({ key, label, color }) => {
              const active = cityLayers.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleCityLayer(key)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: active ? color : '#4a6080',
                      backgroundColor: active ? `${color}20` : 'transparent',
                    }}
                  >
                    {active && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="font-mono text-[10px] tracking-wider"
                    style={{ color: active ? color : '#4a6080' }}
                  >
                    {label}
                  </span>
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full transition-colors"
                    style={{ backgroundColor: active ? color : '#4a608030' }}
                  />
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const CITY_BASEMAPS: { key: CityBasemap; label: string; icon: string }[] = [
  { key: 'streets-dark',  label: 'DARK',      icon: '◐' },
  { key: 'streets-light', label: 'LIGHT',     icon: '○' },
  { key: 'satellite',     label: 'SATELLITE',  icon: '◉' },
]

function CityBasemapToggle() {
  const [open, setOpen] = useState(false)
  const cityBasemap = useHUDStore((s) => s.cityBasemap)
  const setCityBasemap = useHUDStore((s) => s.setCityBasemap)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const active = CITY_BASEMAPS.find(b => b.key === cityBasemap)!

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-hud-green/30 font-mono text-[10px] tracking-wider text-hud-green hover:bg-hud-green/10 transition-colors"
      >
        <span className="text-xs">{active.icon}</span>
        {active.label}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M0 0L4 5L8 0Z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-hud-green/20 bg-hud-panel/95 backdrop-blur-md shadow-lg overflow-hidden z-50"
          >
            <div className="px-3 py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim">BASEMAP</span>
            </div>
            {CITY_BASEMAPS.map(({ key, label, icon }) => {
              const isActive = cityBasemap === key
              return (
                <button
                  key={key}
                  onClick={() => { setCityBasemap(key); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: isActive ? '#00ff88' : '#4a6080',
                      backgroundColor: isActive ? '#00ff88' : 'transparent',
                    }}
                  >
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-hud-panel" />
                    )}
                  </span>
                  <span className="text-xs">{icon}</span>
                  <span
                    className="font-mono text-[10px] tracking-wider"
                    style={{ color: isActive ? '#00ff88' : '#4a6080' }}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const CYBER_PANELS: { key: CyberPanel; label: string; color: string }[] = [
  { key: 'graph',   label: 'GRAPH',    color: '#ff2d2d' },
  { key: 'heatmap', label: 'GEO HEAT', color: '#ffaa00' },
  { key: 'mitre',   label: 'ATT&CK',   color: '#00d4ff' },
]

function CyberPanelDropdown() {
  const [open, setOpen] = useState(false)
  const cyberPanel = useHUDStore((s) => s.cyberPanel)
  const setCyberPanel = useHUDStore((s) => s.setCyberPanel)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeLabel = CYBER_PANELS.find(p => p.key === cyberPanel)?.label ?? 'GRAPH'
  const activeColor = CYBER_PANELS.find(p => p.key === cyberPanel)?.color ?? '#ff2d2d'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-[10px] tracking-wider hover:bg-white/[0.03] transition-colors"
        style={{ borderColor: `${activeColor}50`, color: activeColor }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeColor }} />
        {activeLabel}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M0 0L4 5L8 0Z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-hud-cyan/20 bg-hud-panel/95 backdrop-blur-md shadow-lg overflow-hidden z-50"
          >
            <div className="px-3 py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[8px] tracking-[0.2em] text-hud-dim">VIEW MODE</span>
            </div>
            {CYBER_PANELS.map(({ key, label, color }) => {
              const active = cyberPanel === key
              return (
                <button
                  key={key}
                  onClick={() => { setCyberPanel(key); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: active ? color : '#4a6080',
                      backgroundColor: active ? color : 'transparent',
                    }}
                  >
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-hud-panel" />
                    )}
                  </span>
                  <span
                    className="font-mono text-[10px] tracking-wider"
                    style={{ color: active ? color : '#4a6080' }}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function StatusBar() {
  const activeView = useHUDStore((s) => s.activeView)
  const panels = useHUDStore((s) => s.panels)
  const label = VIEW_LABELS[activeView]
  const { data: incidents } = useGlobalData()
  const criticalCount = incidents.filter(i => i.severity === 'critical').length
  const highCount = incidents.filter(i => i.severity === 'high').length

  return (
    <AnimatePresence>
      {panels.statusBar && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-40 h-12 flex items-center justify-between pl-6 pr-8 border-b border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md"
        >
          {/* Left: branding */}
          <div className="flex items-center gap-3 min-w-0">
            <PulsingDot color="bg-hud-green" />
            <span className="font-mono text-xs text-hud-dim tracking-widest shrink-0">ENDURION</span>
            <span className="text-hud-dim/40 shrink-0">|</span>
            <span className="font-mono text-xs text-hud-cyan tracking-widest truncate">{label.title}</span>
          </div>

          {/* Center: view subtitle */}
          <div className="font-mono text-[10px] text-hud-dim tracking-[0.2em] shrink-0 hidden lg:block">
            {label.subtitle}
          </div>

          {/* Right: layer dropdown + context-aware counts */}
          <div className="flex items-center gap-4 shrink-0">
            {activeView === 'global' && <LayerDropdown />}
            {activeView === 'city' && <CityBasemapToggle />}
            {activeView === 'city' && <CityLayerDropdown />}
            {activeView === 'cyber' && <CyberPanelDropdown />}
            {activeView !== 'space' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-hud-red" />
                  <span className="font-mono text-xs text-hud-dim">
                    CRITICAL <span className="text-hud-red">{criticalCount}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-hud-amber" />
                  <span className="font-mono text-xs text-hud-dim">
                    HIGH <span className="text-hud-amber">{highCount}</span>
                  </span>
                </div>
              </>
            )}
            <div className="font-mono text-[10px] text-hud-dim/60">
              {new Date().toISOString().slice(0, 19).replace('T', ' ')}Z
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
