// src/views/global/GlobalMarkers.tsx
import { Marker } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { globalIncidents } from '../../data/global-incidents'
import type { GlobalIncident, Severity } from '../../types'

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#ff2d2d',
  high: '#ffaa00',
  medium: '#00d4ff',
  low: '#4a6080',
  nominal: '#00ff88',
}

function PulseMarker({ incident }: { incident: GlobalIncident }) {
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const color = SEVERITY_COLORS[incident.severity]

  return (
    <Marker longitude={incident.lng} latitude={incident.lat} anchor="center">
      <button
        onClick={() => {
          setSelectedEntity({ type: 'incident', data: incident })
          setPanelVisible('entity', true)
        }}
        className="relative flex items-center justify-center w-8 h-8"
      >
        {/* Pulse ring */}
        <span
          className="absolute w-8 h-8 rounded-full animate-ping opacity-40"
          style={{ backgroundColor: color }}
        />
        {/* Core dot */}
        <span
          className="relative w-3 h-3 rounded-full border-2"
          style={{ backgroundColor: `${color}33`, borderColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </button>
    </Marker>
  )
}

export function GlobalMarkers() {
  return (
    <>
      {globalIncidents.map((incident) => (
        <PulseMarker key={incident.id} incident={incident} />
      ))}
    </>
  )
}
