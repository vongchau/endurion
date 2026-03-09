// src/components/panels/EventFeedPanel/index.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { useGlobalData } from '../../../hooks/useGlobalData'
import { useFlights } from '../../../hooks/useFlights'
import { useDisruptions } from '../../../hooks/useDisruptions'
import { useDrones } from '../../../hooks/useDrones'
import { cyberGraph } from '../../../data/cyber-graph'
import { useSatellites } from '../../../views/space/useSatellites'
import type { Severity } from '../../../types'
import { incidentToLayer } from '../../../utils/incidentLayer'
import { mapRef } from '../../../mapRef'

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-hud-red border-hud-red/40',
  high: 'text-hud-amber border-hud-amber/40',
  medium: 'text-hud-cyan border-hud-cyan/40',
  low: 'text-hud-dim border-hud-dim/40',
  nominal: 'text-hud-green border-hud-green/40',
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-cyan/20">
      <div className="w-1 h-4 bg-hud-cyan rounded-full" />
      <span className="font-mono text-[10px] tracking-widest text-hud-cyan">{title}</span>
    </div>
  )
}

export function EventFeedPanel() {
  const panels = useHUDStore((s) => s.panels)
  const activeView = useHUDStore((s) => s.activeView)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const globalLayers = useHUDStore((s) => s.globalLayers)
  const { data: liveIncidents } = useGlobalData()
  const { data: liveFlights } = useFlights()
  const { disruptions } = useDisruptions()

  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const showUAS    = activeView === 'city' && cityLayers.has('uas')
  const { drones } = useDrones(showUAS, mapBounds)

  // Only fetch satellite data when in space view
  const { satellites, loading: satsLoading } = useSatellites()

  const items = activeView === 'global'
    ? [
        ...liveIncidents
          .filter((i) => globalLayers.has(incidentToLayer(i)))
          .map(i => ({
            id: i.id,
            label: i.country,
            sublabel: i.type,
            severity: i.severity,
            time: i.timestamp.slice(11, 16),
            source: i.source.toUpperCase(),
            onClick: () => setSelectedEntity({ type: 'incident', data: i }),
          })),
        ...(globalLayers.has('military')
          ? liveFlights.map(f => ({
              id: f.id,
              label: f.callsign,
              sublabel: f.country,
              severity: 'medium' as const,
              time: `${Math.round(f.altitude / 1000)}km`,
              source: 'SKY',
              onClick: () => {},
            }))
          : []),
        ...(globalLayers.has('maritime')
          ? disruptions.map((d) => ({
              id: d.id,
              label: d.name,
              sublabel: d.description,
              severity: (d.severity === 'high' ? 'high'
                : d.severity === 'elevated' ? 'medium'
                : 'low') as Severity,
              time: d.vesselCount > 0 ? `${d.vesselCount}v` : '--',
              source: 'AIS',
              onClick: () => {},
            }))
          : []),
      ]
    : activeView === 'city'
    ? drones.map(d => ({
        id: d.id,
        label: d.sensorId,
        sublabel: d.state === 'airborne' ? `${Math.round(d.altitude)}m · ${d.speed.toFixed(1)} m/s` : d.state.toUpperCase(),
        severity: (d.state === 'airborne' ? (d.speed > 20 ? 'high' : 'medium') : 'nominal') as Severity,
        time: `${Math.round(d.heading)}°`,
        source: 'UAS',
        onClick: () => {
          setSelectedEntity({ type: 'drone', data: d })
          setPanelVisible('entity', true)
          mapRef.current?.flyTo({ center: [d.lng, d.lat], zoom: 14, duration: 1500 })
        },
      }))
    : activeView === 'cyber'
    ? cyberGraph.edges.map(e => ({
        id: e.id, label: `${e.sourceId} → ${e.targetId}`, sublabel: e.protocol,
        severity: (e.threatScore > 85 ? 'critical' : e.threatScore > 65 ? 'high' : 'medium') as Severity,
        time: '--:--', onClick: () => {},
      }))
    : // space
      [...satellites]
        .sort((a, b) => b.altitude - a.altitude)
        .slice(0, 50) // show top 50 by altitude
        .map(s => ({
          id: s.id,
          label: s.name,
          sublabel: `${s.altitude} km`,
          severity: s.type === 'iss' ? 'high' : 'nominal' as Severity,
          time: `${s.velocity} km/s`,
          onClick: () => {
            setSelectedEntity({ type: 'satellite', data: s })
            setPanelVisible('entity', true)
          },
        }))

  return (
    <AnimatePresence>
      {panels.eventFeed && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="fixed left-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <PanelHeader title={
            activeView === 'global'
              ? `LIVE EVENT FEED · ${items.length}`
              : activeView === 'city'
              ? `UAS TRACKER · ${items.length}`
              : activeView === 'space'
              ? 'TRACKED OBJECTS'
              : 'LIVE EVENT FEED'
          } />
          {activeView === 'space' && satsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="font-mono text-[10px] text-hud-dim animate-pulse">ACQUIRING SIGNALS...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {items.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={item.onClick}
                  className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-cyan/5 transition-colors flex items-start gap-2"
                >
                  <span className={`mt-0.5 text-[9px] font-mono border px-1 rounded ${SEVERITY_COLORS[item.severity]}`}>
                    {item.severity.toUpperCase().slice(0, 4)}
                  </span>
                  {item.source && (
                    <span className="font-mono text-[9px] text-hud-dim/50 shrink-0">[{item.source}]</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-hud-text truncate">{item.label}</div>
                    <div className="font-mono text-[10px] text-hud-dim truncate">{item.sublabel}</div>
                  </div>
                  <span className="font-mono text-[10px] text-hud-dim/60 shrink-0">{item.time}</span>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
