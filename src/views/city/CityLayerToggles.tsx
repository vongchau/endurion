// src/views/city/CityLayerToggles.tsx
import { useHUDStore } from '../../store'
import type { CityLayer } from '../../types'

const LAYERS: { key: CityLayer; label: string; color: string }[] = [
  { key: 'uas',   label: 'UAS',   color: '#7b2fff' },
  { key: 'zones', label: 'ZONES', color: '#ffaa00' },
]

export function CityLayerToggles() {
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const toggleCityLayer = useHUDStore((s) => s.toggleCityLayer)

  return (
    <div className="fixed bottom-16 right-4 z-40 flex gap-2">
      {LAYERS.map(({ key, label, color }) => {
        const active = cityLayers.has(key)
        return (
          <button
            key={key}
            onClick={() => toggleCityLayer(key)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[10px] tracking-widest border transition-all"
            style={{
              borderColor: active ? color : '#4a6080',
              color:       active ? color : '#4a6080',
              backgroundColor: active ? `${color}15` : 'transparent',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ backgroundColor: active ? color : '#4a6080' }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
