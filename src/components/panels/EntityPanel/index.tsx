// src/components/panels/EntityPanel/index.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useHUDStore } from '../../../store'
import { useVesselIntel } from '../../../hooks/useVesselIntel'
import type { GlobalIncident, CyberNode, Satellite, AISVessel, DroneFlight, Severity } from '../../../types'

const SEVERITY_BG: Record<Severity, string> = {
  critical: 'bg-hud-red/10 text-hud-red border-hud-red/30',
  high: 'bg-hud-amber/10 text-hud-amber border-hud-amber/30',
  medium: 'bg-hud-cyan/10 text-hud-cyan border-hud-cyan/30',
  low: 'bg-hud-dim/10 text-hud-dim border-hud-dim/30',
  nominal: 'bg-hud-green/10 text-hud-green border-hud-green/30',
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
      <span className="font-mono text-[10px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-xs text-hud-text text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function IncidentDetail({ data }: { data: GlobalIncident }) {
  return (
    <>
      <div className={`mx-3 my-2 px-2 py-1 rounded border text-[10px] font-mono ${SEVERITY_BG[data.severity]}`}>
        {data.severity.toUpperCase()} — {data.type}
      </div>
      <div className="px-3">
        <DataRow label="COUNTRY" value={data.country} />
        <DataRow label="TYPE" value={data.type} />
        <DataRow label="TIMESTAMP" value={data.timestamp.replace('T', ' ').slice(0, 19) + 'Z'} />
        <DataRow label="LAT/LNG" value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      </div>
      <div className="px-3 py-2">
        <p className="font-mono text-[10px] text-hud-dim leading-relaxed">{data.summary}</p>
      </div>
    </>
  )
}

function NodeDetail({ data }: { data: CyberNode }) {
  const scoreColor = data.threatScore > 80 ? 'text-hud-red' : data.threatScore > 60 ? 'text-hud-amber' : 'text-hud-green'
  return (
    <div className="px-3 pt-2">
      <DataRow label="NODE" value={data.label} />
      <DataRow label="TYPE" value={data.type.toUpperCase()} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="flex justify-between items-center py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">THREAT SCORE</span>
        <span className={`font-mono text-xs ${scoreColor}`}>{data.threatScore}/100</span>
      </div>
    </div>
  )
}

function SatelliteDetail({ data }: { data: Satellite }) {
  const isISS = data.type === 'iss'
  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${isISS ? SEVERITY_BG.high : SEVERITY_BG.nominal}`}>
        {isISS ? 'STATION' : 'STARLINK'} — NORAD {data.id}
      </div>
      <DataRow label="NAME" value={data.name} />
      <DataRow label="ALTITUDE" value={`${data.altitude} km`} />
      <DataRow label="VELOCITY" value={`${data.velocity} km/s`} />
      <DataRow label="INCLINATION" value={`${data.inclination}°`} />
      <DataRow label="LAT/LNG" value={`${data.lat.toFixed(2)}, ${data.lng.toFixed(2)}`} />
      <div className="mt-3 h-16 rounded border border-hud-dim/20 bg-black/40 flex items-center justify-center">
        <span className="font-mono text-[10px] text-hud-dim">[ TELEMETRY STREAM ]</span>
      </div>
    </div>
  )
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1">
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
      <span className="font-mono text-[8px] tracking-[0.2em]" style={{ color }}>{label}</span>
      <div className="h-px flex-1" style={{ backgroundColor: `${color}30` }} />
    </div>
  )
}

function formatGapDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function VesselDetail({ data }: { data: AISVessel }) {
  const isMilitary = data.shipType === 35 || data.shipType === 55
  const badge = isMilitary ? SEVERITY_BG.high : SEVERITY_BG.nominal
  const badgeLabel = isMilitary ? 'MILITARY' : data.shipTypeName.toUpperCase()
  const speedColor = data.speed > 20 ? 'text-hud-red' : data.speed > 10 ? 'text-hud-amber' : 'text-hud-green'

  const { intel } = useVesselIntel(data.mmsi)

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        {badgeLabel} — MMSI {data.mmsi}
      </div>

      {/* ── Identity ── */}
      <DataRow label="NAME"      value={data.name || '—'} />
      <DataRow label="TYPE"      value={`${data.shipTypeName} (${data.shipType})`} />
      {data.callSign && <DataRow label="CALLSIGN" value={data.callSign} />}
      {data.imo > 0 && <DataRow label="IMO" value={data.imo} />}

      {/* ── Navigation ── */}
      <DataRow label="LAT/LNG"   value={`${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`} />
      <DataRow label="HEADING"   value={`${data.heading}°`} />
      <DataRow label="COURSE"    value={`${data.course.toFixed(1)}°`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${speedColor}`}>{data.speed.toFixed(1)} kn</span>
      </div>
      {data.destination && <DataRow label="DEST" value={data.destination} />}
      {data.draught > 0 && <DataRow label="DRAUGHT" value={`${data.draught.toFixed(1)} m`} />}
      {data.lengthOverall > 0 && <DataRow label="LOA / BEAM" value={`${data.lengthOverall}m × ${data.beam}m`} />}
      {data.eta && <DataRow label="ETA" value={data.eta} />}
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />

      {/* ── Intelligence Analysis ── */}
      {intel?.found && (
        <>
          <SectionHeader label="INTEL ANALYSIS" color="#7b2fff" />

          {/* Military classification */}
          {intel.military.isMilitary ? (
            <div className="my-1.5 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30">
              MILITARY — {intel.military.reason}
            </div>
          ) : (
            <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[10px] text-hud-dim tracking-wider">MIL CLASS</span>
              <span className="font-mono text-xs text-hud-green">CIVILIAN</span>
            </div>
          )}

          {/* Chokepoint proximity */}
          {intel.inChokepoints.length > 0 ? (
            <div className="my-1.5 px-2 py-1 rounded border text-[10px] font-mono bg-hud-amber/10 text-hud-amber border-hud-amber/30">
              IN CHOKEPOINT — {intel.inChokepoints.join(', ')}
            </div>
          ) : intel.nearestChokepoint && (
            <DataRow
              label="NEAREST CP"
              value={`${intel.nearestChokepoint.name} (${intel.nearestChokepoint.distanceDeg}°)`}
            />
          )}

          {/* AIS gap / dark ship detection */}
          {intel.aisGaps.isDarkShip && (
            <div className="my-1.5 px-2 py-1 rounded border text-[10px] font-mono bg-hud-red/10 text-hud-red border-hud-red/30 animate-pulse">
              DARK SHIP — Reappeared after AIS silence &gt;1h
            </div>
          )}
          <DataRow label="AIS REPORTS" value={intel.aisGaps.totalReports} />
          {intel.aisGaps.maxGapMs > 0 && (
            <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
              <span className="font-mono text-[10px] text-hud-dim tracking-wider">MAX GAP</span>
              <span className={`font-mono text-xs ${intel.aisGaps.maxGapMs > GAP_THRESHOLD_DISPLAY ? 'text-hud-red' : 'text-hud-text'}`}>
                {formatGapDuration(intel.aisGaps.maxGapMs)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const GAP_THRESHOLD_DISPLAY = 60 * 60 * 1000

function DroneDetail({ data }: { data: DroneFlight }) {
  const isAirborne = data.state === 'airborne' || data.altitude > 5
  const badge = isAirborne ? SEVERITY_BG.medium : SEVERITY_BG.nominal
  const badgeLabel = isAirborne ? 'AIRBORNE' : 'GROUNDED'
  const speedMs = data.speed.toFixed(1)

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1 rounded border text-[10px] font-mono ${badge}`}>
        UAS {badgeLabel} — {data.state.toUpperCase()}
      </div>
      <DataRow label="OP ID"     value={data.id} />
      <DataRow label="SENSOR"    value={data.sensorId} />
      <DataRow label="LAT/LNG"   value={`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`} />
      <DataRow label="ALTITUDE"  value={`${Math.round(data.altitude)} m MSL`} />
      <DataRow label="HEADING"   value={`${Math.round(data.heading)}°`} />
      <div className="flex justify-between items-start py-1.5 border-b border-hud-dim/10">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">SPEED</span>
        <span className={`font-mono text-xs ${data.speed > 20 ? 'text-hud-red' : data.speed > 10 ? 'text-hud-amber' : 'text-hud-text'}`}>
          {speedMs} m/s
        </span>
      </div>
      {data.verticalSpeed !== 0 && (
        <DataRow label="V/S" value={`${data.verticalSpeed > 0 ? '+' : ''}${data.verticalSpeed.toFixed(1)} m/s`} />
      )}
      <DataRow label="LAST SEEN" value={new Date(data.timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} />
    </div>
  )
}

export function EntityPanel() {
  const panels = useHUDStore((s) => s.panels)
  const selectedEntity = useHUDStore((s) => s.selectedEntity)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)

  return (
    <AnimatePresence>
      {panels.entity && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="fixed right-4 top-16 bottom-16 z-40 w-72 flex flex-col rounded-lg border border-hud-cyan/20 bg-hud-panel/80 backdrop-blur-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-hud-cyan/20">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-hud-purple rounded-full" />
              <span className="font-mono text-[10px] tracking-widest text-hud-purple">ENTITY DETAILS</span>
            </div>
            {selectedEntity && (
              <button onClick={() => setSelectedEntity(null)} className="text-hud-dim hover:text-hud-text font-mono text-xs">×</button>
            )}
          </div>

          {!selectedEntity ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-[10px] text-hud-dim text-center px-4">
                SELECT AN ENTITY<br />FROM THE MAP OR FEED
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {selectedEntity.type === 'incident' && <IncidentDetail data={selectedEntity.data as GlobalIncident} />}
              {selectedEntity.type === 'node' && <NodeDetail data={selectedEntity.data as CyberNode} />}
              {selectedEntity.type === 'satellite' && <SatelliteDetail data={selectedEntity.data as Satellite} />}
              {selectedEntity.type === 'vessel' && <VesselDetail data={selectedEntity.data as AISVessel} />}
              {selectedEntity.type === 'drone' && <DroneDetail data={selectedEntity.data as DroneFlight} />}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
