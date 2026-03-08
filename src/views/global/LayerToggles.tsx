// src/views/global/LayerToggles.tsx
import { useHUDStore } from '../../store'
import type { GlobalLayer } from '../../types'

const LAYERS: { key: GlobalLayer; label: string; color: string }[] = [
  { key: 'conflict', label: 'CONFLICT', color: '#ff2d2d' },
  { key: 'disaster', label: 'DISASTER', color: '#ffaa00' },
  { key: 'military', label: 'MILITARY', color: '#00d4ff' },
]

export function LayerToggles() {
  const globalLayers = useHUDStore((s) => s.globalLayers)
  const toggleGlobalLayer = useHUDStore((s) => s.toggleGlobalLayer)

  return (
    <div className="fixed bottom-16 right-4 z-40 flex gap-2">
      {LAYERS.map(({ key, label, color }) => {
        const active = globalLayers.has(key)
        return (
          <button
            key={key}
            onClick={() => toggleGlobalLayer(key)}
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
