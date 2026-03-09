// src/views/city/CityMarkers.tsx
import { useHUDStore } from '../../store'
import { useDrones } from '../../hooks/useDrones'
import { useAirspaceZones } from '../../hooks/useAirspaceZones'
import { DroneLayer } from './DroneLayer'
import { AirspaceZoneLayer } from './AirspaceZoneLayer'

export function CityMarkers() {
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const showUAS    = cityLayers.has('uas')
  const showZones  = cityLayers.has('zones')
  const { drones } = useDrones(showUAS, mapBounds)
  const { zones }  = useAirspaceZones(showZones, mapBounds)

  return (
    <>
      {showZones && <AirspaceZoneLayer zones={zones} />}
      {showUAS && <DroneLayer drones={drones} />}
    </>
  )
}
