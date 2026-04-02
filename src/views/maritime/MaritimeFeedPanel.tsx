// src/views/maritime/MaritimeFeedPanel.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../store'
import { useIUUAlerts } from '../../hooks/useIUUAlerts'
import { useIUUVessels } from '../../hooks/useIUUVessels'
import type { IUUConfidence, MaritimeAlertCategory } from '../../types'
import { mapRef } from '../../mapRef'

const CONFIDENCE_COLORS: Record<IUUConfidence, string> = {
  HIGH: 'text-hud-red border-hud-red/40',
  MEDIUM: 'text-hud-amber border-hud-amber/40',
  LOW: 'text-hud-dim border-hud-dim/40',
}

const CATEGORY_LABELS: Record<MaritimeAlertCategory, { label: string; color: string }> = {
  eez_violation:     { label: 'EEZ',    color: '#ff2d2d' },
  dark_period:       { label: 'DARK',   color: '#7b2fff' },
  dwell_escalation:  { label: 'DWELL',  color: '#ffaa00' },
  transshipment:     { label: 'TRANS',  color: '#ff8800' },
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 16)
}

export function MaritimeFeedPanel() {
  const panels = useHUDStore((s) => s.panels)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const { alerts } = useIUUAlerts(true)
  const { flaggedVessels } = useIUUVessels(true)

  return (
    <AnimatePresence>
      {panels.eventFeed && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="fixed left-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-red/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-hud-red/20">
            <div className="w-1 h-4 bg-hud-red rounded-full" />
            <span className="font-mono text-[10px] tracking-widest text-hud-red">MARITIME IUU</span>
            {alerts.length > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-hud-red animate-pulse" />
            )}
            <span className="font-mono text-[8px] text-hud-dim">{alerts.length} alerts</span>
          </div>

          <div className="flex gap-3 px-3 py-1.5 border-b border-hud-dim/10 font-mono text-[9px]">
            <span className="text-hud-red">
              {flaggedVessels.filter(v => v.match.confidence === 'HIGH').length} HIGH
            </span>
            <span className="text-hud-amber">
              {flaggedVessels.filter(v => v.match.confidence === 'MEDIUM').length} MED
            </span>
            <span className="text-hud-dim">
              {flaggedVessels.filter(v => v.match.confidence === 'LOW').length} LOW
            </span>
            <span className="ml-auto text-hud-dim/50">
              {flaggedVessels.length} flagged
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {alerts.length > 0 && (
              <div className="px-3 pt-2 pb-1">
                <span className="font-mono text-[8px] tracking-[0.2em] text-hud-red">ALERTS</span>
              </div>
            )}
            {alerts.slice(0, 50).map((alert) => {
              const cat = CATEGORY_LABELS[alert.category ?? 'eez_violation']
              return (
              <button
                key={alert.id}
                onClick={() => {
                  setSelectedEntity({ type: 'iuuVessel', data: alert })
                  setPanelVisible('entity', true)
                  mapRef.current?.flyTo({
                    center: [alert.vessel.lng, alert.vessel.lat],
                    zoom: 6,
                    duration: 1500,
                  })
                }}
                className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-red/5 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[8px] font-mono border px-1 rounded"
                    style={{ color: cat.color, borderColor: `${cat.color}66` }}
                  >
                    {cat.label}
                  </span>
                  <span className={`text-[9px] font-mono border px-1 rounded ${CONFIDENCE_COLORS[alert.match.confidence]}`}>
                    {alert.match.confidence}
                  </span>
                  <span className="font-mono text-xs text-hud-text truncate flex-1">
                    {alert.vessel.name || `MMSI ${alert.vessel.mmsi}`}
                  </span>
                  <span className="font-mono text-[10px] text-hud-dim/60 shrink-0">
                    {formatTime(alert.timestamp)}
                  </span>
                </div>
                {alert.detail ? (
                  <div className="font-mono text-[10px] text-hud-dim mt-0.5 truncate">
                    {alert.detail}
                  </div>
                ) : alert.eezName ? (
                  <div className="font-mono text-[10px] text-hud-dim mt-0.5 truncate">
                    {alert.eezName}
                    {alert.dwellMinutes ? ` \u00B7 ${alert.dwellMinutes}min` : ''}
                  </div>
                ) : null}
                <div className="font-mono text-[9px] text-hud-dim/50 mt-0.5">
                  {alert.match.matchedFields.join(', ')}
                </div>
              </button>
            )})}


            {flaggedVessels.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                <span className="font-mono text-[8px] tracking-[0.2em] text-hud-amber">FLAGGED VESSELS</span>
              </div>
            )}
            {flaggedVessels
              .filter(fv => !alerts.some(a => a.vessel.mmsi === fv.vessel.mmsi))
              .slice(0, 50)
              .map(({ vessel, match }) => (
                <button
                  key={`fv-${vessel.mmsi}`}
                  onClick={() => {
                    setSelectedEntity({ type: 'vessel', data: vessel })
                    setPanelVisible('entity', true)
                    mapRef.current?.flyTo({
                      center: [vessel.lng, vessel.lat],
                      zoom: 6,
                      duration: 1500,
                    })
                  }}
                  className="w-full text-left px-3 py-2 border-b border-hud-dim/10 hover:bg-hud-amber/5 transition-colors"
                  style={{ borderLeft: `2px solid ${match.confidence === 'HIGH' ? '#ff2d2d' : match.confidence === 'MEDIUM' ? '#ffaa00' : '#4a6080'}` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-mono border px-1 rounded ${CONFIDENCE_COLORS[match.confidence]}`}>
                      {match.confidence}
                    </span>
                    <span className="font-mono text-[10px] text-hud-text truncate flex-1">
                      {vessel.name || `MMSI ${vessel.mmsi}`}
                    </span>
                    <span className="font-mono text-[10px] text-hud-dim/60">{vessel.speed.toFixed(1)} kn</span>
                  </div>
                  <div className="font-mono text-[9px] text-hud-dim/50 mt-0.5">
                    {match.matchedFields.join(', ')} | MMSI {vessel.mmsi}
                  </div>
                </button>
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
