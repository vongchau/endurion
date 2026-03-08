// src/views/city/CitySearch.tsx
import { useState, useRef } from 'react'
import { useHUDStore } from '../../store'
import { CITIES } from '../../data/cities'
import type { MapRef } from 'react-map-gl/mapbox'
import type { CityProfile } from '../../types'

interface CitySearchProps {
  mapRef: React.RefObject<MapRef | null>
}

export function CitySearch({ mapRef }: CitySearchProps) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const setSelectedCity = useHUDStore((s) => s.setSelectedCity)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? CITIES.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.state.toLowerCase().includes(query.toLowerCase())
      )
    : CITIES

  function select(city: CityProfile) {
    setSelectedCity(city)
    mapRef.current?.flyTo({ center: [city.lng, city.lat], zoom: city.zoom, duration: 1500 })
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }

  return (
    <div className="fixed top-16 left-4 z-30 w-64 font-mono">
      <div className="flex items-center gap-2 bg-hud-panel border border-hud-cyan/20 px-3 py-2 rounded">
        <span className="text-hud-cyan text-xs">◉</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()}
          placeholder="SEARCH CITY"
          className="flex-1 bg-transparent text-hud-text text-xs outline-none placeholder:text-hud-dim tracking-widest"
        />
      </div>

      {focused && (
        <div className="mt-1 bg-hud-panel border border-hud-cyan/20 rounded overflow-hidden max-h-64 overflow-y-auto">
          {filtered.map((city) => (
            <button
              key={city.id}
              onMouseDown={() => select(city)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-hud-cyan/10 transition-colors
                text-hud-text hover:text-hud-cyan flex justify-between items-center"
            >
              <span className="tracking-widest">{city.name}</span>
              <span className="text-hud-dim">{city.state}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-hud-dim">NO MATCH</div>
          )}
        </div>
      )}
    </div>
  )
}
