// src/views/city/CityToolkit.tsx — vertical toggle buttons for city view controls
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useHUDStore } from '../../store'
import { DroneLegend } from './DroneLegend'

interface ToolButton {
  id: string
  label: string
  icon: string
  active: boolean
  color: string
  onClick: () => void
}

export function CityToolkit() {
  const feedOpen = useHUDStore((s) => s.panels.eventFeed)
  const entityOpen = useHUDStore((s) => s.panels.entity)
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const timelineVisible = useHUDStore((s) => s.droneTimelineVisible)
  const setTimelineVisible = useHUDStore((s) => s.setDroneTimelineVisible)
  const [legendVisible, setLegendVisible] = useState(false)

  const showUAS = cityLayers.has('uas')

  const tools: ToolButton[] = []

  if (showUAS) {
    tools.push({
      id: 'timeline',
      label: 'TIMELINE',
      icon: '⏱',
      active: timelineVisible,
      color: '#7b2fff',
      onClick: () => setTimelineVisible(!timelineVisible),
    })
    tools.push({
      id: 'legend',
      label: 'LEGEND',
      icon: '◑',
      active: legendVisible,
      color: '#00d4ff',
      onClick: () => setLegendVisible(!legendVisible),
    })
  }

  if (tools.length === 0) return null

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="fixed top-[4.5rem] z-50 flex flex-col gap-1 transition-[left] duration-300"
        style={{ left: feedOpen ? '20.5rem' : '1rem' }}
      >
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={tool.onClick}
            title={`${tool.active ? 'Hide' : 'Show'} ${tool.label}`}
            className="flex items-center gap-1 px-2 py-1 rounded border font-mono text-[9px] tracking-wider transition-all duration-200 w-fit"
            style={{
              borderColor: tool.active ? `${tool.color}60` : '#4a608030',
              color: tool.active ? tool.color : '#4a6080',
              backgroundColor: tool.active ? `${tool.color}10` : 'transparent',
            }}
          >
            <span className="text-[10px]">{tool.icon}</span>
            {tool.label}
          </button>
        ))}
      </motion.div>

      {showUAS && legendVisible && <DroneLegend entityOpen={entityOpen} />}
    </>
  )
}
