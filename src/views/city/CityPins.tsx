// src/views/city/CityPins.tsx
import { Marker } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { CITIES } from '../../data/cities'
import type { MapRef } from 'react-map-gl/mapbox'
import type { CityProfile } from '../../types'

interface CityPinsProps {
  mapRef: React.RefObject<MapRef | null>
}

export function CityPins({ mapRef }: CityPinsProps) {
  const setSelectedCity = useHUDStore((s) => s.setSelectedCity)

  function flyToCity(city: CityProfile) {
    setSelectedCity(city)
    mapRef.current?.flyTo({
      center: [city.lng, city.lat],
      zoom: city.zoom,
      duration: 1500,
    })
  }

  return (
    <>
      {CITIES.map((city) => (
        <Marker key={city.id} longitude={city.lng} latitude={city.lat} anchor="center">
          <button
            onClick={() => flyToCity(city)}
            title={`${city.name}, ${city.state}`}
            className="group relative flex items-center justify-center w-6 h-6"
          >
            <span className="absolute w-6 h-6 rounded-full bg-hud-cyan opacity-20 animate-ping" />
            <span className="relative w-2 h-2 rounded-full bg-hud-cyan shadow-[0_0_8px_#00d4ff]" />
            <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block
              whitespace-nowrap text-[10px] font-mono text-hud-cyan bg-hud-panel px-1.5 py-0.5 rounded
              border border-hud-cyan/20 pointer-events-none">
              {city.name}
            </span>
          </button>
        </Marker>
      ))}
    </>
  )
}
