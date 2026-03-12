// src/views/city/AircraftLayer.tsx
import { Marker } from 'react-map-gl/mapbox'
import type { LowAltAircraft } from '../../types'

interface Props {
  aircraft: LowAltAircraft[]
  onSelect: (a: LowAltAircraft) => void
}

export function AircraftLayer({ aircraft, onSelect }: Props) {
  return (
    <>
      {aircraft.map(a => (
        <Marker key={a.id} longitude={a.lng} latitude={a.lat} anchor="center">
          <button
            onClick={() => onSelect(a)}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-blue-400/60 bg-blue-500/15 hover:scale-125 transition-transform"
            style={{ boxShadow: '0 0 8px rgba(59,130,246,0.4)' }}
            title={`${a.callsign || a.icao24} — ${Math.round(a.altitude)}m`}
          >
            <svg
              width="12" height="12" viewBox="0 0 12 12"
              style={{ transform: `rotate(${a.heading}deg)` }}
            >
              <path d="M6 0L9 10L6 8L3 10Z" fill="#3b82f6" />
            </svg>
          </button>
        </Marker>
      ))}
    </>
  )
}
