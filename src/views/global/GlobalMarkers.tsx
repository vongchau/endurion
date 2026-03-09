// src/views/global/GlobalMarkers.tsx
import { Marker } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { useGlobalData } from '../../hooks/useGlobalData'
import { useFlights } from '../../hooks/useFlights'
import { useVessels } from '../../hooks/useVessels'
import { VesselDensityLayer } from './VesselDensityLayer'
import type { GlobalIncident, MilitaryFlight, MilitaryCandidate, Severity } from '../../types'
import { incidentToLayer } from '../../utils/incidentLayer'

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#ff2d2d',
  high:     '#ffaa00',
  medium:   '#00d4ff',
  low:      '#4a6080',
  nominal:  '#00ff88',
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
        title={`${incident.type} — ${incident.country}`}
      >
        <span className="absolute w-8 h-8 rounded-full animate-ping opacity-40"
          style={{ backgroundColor: color }} />
        <span className="relative w-3 h-3 rounded-full border-2"
          style={{ backgroundColor: `${color}33`, borderColor: color, boxShadow: `0 0 6px ${color}` }} />
      </button>
    </Marker>
  )
}

function FlightMarker({ flight }: { flight: MilitaryFlight }) {
  return (
    <Marker longitude={flight.lng} latitude={flight.lat} anchor="center">
      <div
        style={{ transform: `rotate(${flight.heading}deg)` }}
        title={`${flight.callsign} — ${flight.country}`}
        className="w-4 h-4 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L10 11L6 8L2 11L6 1Z" fill="#00d4ff" />
        </svg>
      </div>
    </Marker>
  )
}

function VesselMarker({ candidate }: { candidate: MilitaryCandidate }) {
  return (
    <Marker longitude={candidate.lng} latitude={candidate.lat} anchor="center">
      <div
        style={{ transform: `rotate(${candidate.heading}deg)` }}
        title={`${candidate.name || `MMSI ${candidate.mmsi}`} — ${candidate.reason}`}
        className="w-4 h-4 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 0L9 10L5 7L1 10L5 0Z" fill="#00ff88" />
        </svg>
      </div>
    </Marker>
  )
}

export function GlobalMarkers() {
  const globalLayers = useHUDStore((s) => s.globalLayers)
  const { data: incidents } = useGlobalData()
  const { data: flights } = useFlights()
  const { density, military } = useVessels()
  const showMaritime = globalLayers.has('maritime')

  const visibleIncidents = incidents.filter((i) => globalLayers.has(incidentToLayer(i)))
  const showFlights = globalLayers.has('military')

  return (
    <>
      {visibleIncidents.map((incident) => (
        <PulseMarker key={incident.id} incident={incident} />
      ))}
      {showFlights && flights.map((flight) => (
        <FlightMarker key={flight.id} flight={flight} />
      ))}
      {showMaritime && <VesselDensityLayer zones={density} />}
      {showMaritime && military.map((c) => (
        <VesselMarker key={c.mmsi} candidate={c} />
      ))}
    </>
  )
}
