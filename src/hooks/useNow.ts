import { useState, useEffect } from 'react'

/** Returns a stable timestamp that updates every 60s, safe for use during render. */
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function formatTimeAgo(timestamp: number, now: number): string {
  const ago = now - timestamp
  if (ago < 3600_000) return `${Math.round(ago / 60_000)}m`
  if (ago < 86400_000) return `${Math.round(ago / 3600_000)}h`
  return `${Math.round(ago / 86400_000)}d`
}
