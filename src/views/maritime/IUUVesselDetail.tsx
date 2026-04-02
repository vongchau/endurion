// src/views/maritime/IUUVesselDetail.tsx
import type { IUUAlert, IUUConfidence } from '../../types'

const CONFIDENCE_BG: Record<IUUConfidence, string> = {
  HIGH: 'bg-hud-red/10 border-hud-red/30 text-hud-red',
  MEDIUM: 'bg-hud-amber/10 border-hud-amber/30 text-hud-amber',
  LOW: 'bg-hud-dim/10 border-hud-dim/30 text-hud-dim',
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-hud-dim/10">
      <span className="font-mono text-[9px] text-hud-dim tracking-wider">{label}</span>
      <span className="font-mono text-[10px] text-hud-text">{value}</span>
    </div>
  )
}

export function IUUVesselDetail({ data }: { data: IUUAlert }) {
  const { vessel, match, eezName, timestamp } = data

  return (
    <div className="px-3 pt-2">
      <div className={`mb-2 px-2 py-1.5 rounded border text-center ${CONFIDENCE_BG[match.confidence]}`}>
        <div className="font-mono text-[10px] tracking-wider">{match.confidence} CONFIDENCE IUU MATCH</div>
        <div className="font-mono text-[8px] mt-0.5 opacity-70">
          matched: {match.matchedFields.join(', ').toUpperCase()}
        </div>
      </div>

      <DataRow label="NAME" value={vessel.name || '\u2014'} />
      <DataRow label="MMSI" value={String(vessel.mmsi)} />
      <DataRow label="IMO" value={vessel.imo > 0 ? String(vessel.imo) : '\u2014'} />
      <DataRow label="CALL SIGN" value={vessel.callSign || '\u2014'} />
      <DataRow label="FLAG" value={match.record.flag || '\u2014'} />
      <DataRow label="LAT/LNG" value={`${vessel.lat.toFixed(4)}, ${vessel.lng.toFixed(4)}`} />
      <DataRow label="SPEED" value={`${vessel.speed.toFixed(1)} kn`} />
      <DataRow label="COURSE" value={`${vessel.course.toFixed(1)}\u00B0`} />

      {/* Alert context */}
      {data.category === 'dark_period' && (
        <div className="mt-3 px-2 py-1.5 rounded border border-purple-500/30 bg-purple-500/5">
          <div className="font-mono text-[8px] tracking-wider text-purple-400">DARK PERIOD DETECTED</div>
          <div className="font-mono text-[10px] text-hud-text mt-0.5">
            Vessel went silent for {data.darkMinutes ?? '?'} minutes
          </div>
          {eezName && <div className="font-mono text-[9px] text-hud-dim mt-0.5">Reappeared in {eezName}</div>}
        </div>
      )}
      {data.category === 'dwell_escalation' && eezName && (
        <div className="mt-3 px-2 py-1.5 rounded border border-hud-amber/30 bg-hud-amber/5">
          <div className="font-mono text-[8px] tracking-wider text-hud-amber">EXTENDED EEZ PRESENCE</div>
          <div className="font-mono text-[10px] text-hud-text mt-0.5">{eezName}</div>
          <div className="font-mono text-[9px] text-hud-dim mt-0.5">
            Dwell time: {data.dwellMinutes ?? '?'} minutes
          </div>
        </div>
      )}
      {data.category === 'transshipment' && (
        <div className="mt-3 px-2 py-1.5 rounded border border-orange-500/30 bg-orange-500/5">
          <div className="font-mono text-[8px] tracking-wider text-orange-400">POTENTIAL TRANSSHIPMENT</div>
          {data.secondVessel && (
            <div className="font-mono text-[10px] text-hud-text mt-0.5">
              Rendezvous with {data.secondVessel.name || `MMSI ${data.secondVessel.mmsi}`}
            </div>
          )}
          {data.detail && <div className="font-mono text-[9px] text-hud-dim mt-0.5">{data.detail}</div>}
        </div>
      )}
      {(data.category === 'eez_violation' || !data.category) && eezName && (
        <div className="mt-3 px-2 py-1.5 rounded border border-hud-red/30 bg-hud-red/5">
          <div className="font-mono text-[8px] tracking-wider text-hud-red">EEZ VIOLATION</div>
          <div className="font-mono text-[10px] text-hud-text mt-0.5">{eezName}</div>
          <div className="font-mono text-[9px] text-hud-dim mt-0.5">
            {new Date(timestamp).toISOString().slice(0, 19)} UTC
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="font-mono text-[8px] tracking-[0.2em] text-hud-amber mb-1">IUU LISTING</div>
        <DataRow label="AUTHORITY" value={match.record.listingAuthority || '\u2014'} />
        <DataRow label="LISTED" value={match.record.listedDate || '\u2014'} />
        {match.record.reason && (
          <div className="mt-1.5 font-mono text-[9px] text-hud-dim leading-relaxed">
            {match.record.reason}
          </div>
        )}
      </div>
    </div>
  )
}
