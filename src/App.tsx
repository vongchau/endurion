import { MapCanvas } from './components/MapCanvas'
import { CommandSwitcher } from './components/CommandSwitcher'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App() {
  useKeyboardShortcuts()

  return (
    <div className="relative w-full h-full bg-hud-bg overflow-hidden">
      <MapCanvas />
      <CommandSwitcher />
    </div>
  )
}
