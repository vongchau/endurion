// src/views/city/DroneTimelineWrapper.tsx — connects history hook to timeline UI
import { useHUDStore } from '../../store'
import { useDroneHistory } from '../../hooks/useDroneHistory'
import { DroneTimeline } from './DroneTimeline'

export function DroneTimelineWrapper() {
  const activeView = useHUDStore((s) => s.activeView)
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const dronePlayback = useHUDStore((s) => s.dronePlayback)

  const showUAS = activeView === 'city' && cityLayers.has('uas')
  const isHistory = dronePlayback === 'history'

  const { timeRange, positionCount } = useDroneHistory(showUAS && isHistory)

  if (!showUAS) return null

  return (
    <DroneTimeline
      positionCount={isHistory ? positionCount : 0}
      timeRange={timeRange}
    />
  )
}
