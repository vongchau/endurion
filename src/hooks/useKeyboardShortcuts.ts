// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react'
import { useHUDStore } from '../store'

export function useKeyboardShortcuts() {
  const setActiveView = useHUDStore((s) => s.setActiveView)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire if user is typing in an input
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case '1': setActiveView('global'); break
        case '2': setActiveView('city'); break
        case '3': setActiveView('cyber'); break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveView])
}
