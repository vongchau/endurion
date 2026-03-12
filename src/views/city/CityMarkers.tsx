// src/views/city/CityMarkers.tsx
import { useMemo } from 'react'
import { useHUDStore } from '../../store'
import { useDrones } from '../../hooks/useDrones'
import { useAirspaceZones } from '../../hooks/useAirspaceZones'
import { useTrafficIncidents } from '../../hooks/useTrafficIncidents'
import { useWeatherAlerts } from '../../hooks/useWeatherAlerts'
import { useCrimeIncidents } from '../../hooks/useCrimeIncidents'
import { useLowAltAircraft } from '../../hooks/useLowAltAircraft'
import { usePowerOutages } from '../../hooks/usePowerOutages'
import { DroneLayer } from './DroneLayer'
import { AirspaceZoneLayer } from './AirspaceZoneLayer'
import { TrafficLayer } from './TrafficLayer'
import { WeatherLayer } from './WeatherLayer'
import { CrimeLayer } from './CrimeLayer'
import { AircraftLayer } from './AircraftLayer'
import { PowerLayer } from './PowerLayer'

export function CityMarkers() {
  const cityLayers = useHUDStore((s) => s.cityLayers)
  const mapBounds  = useHUDStore((s) => s.mapBounds)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const showUAS      = cityLayers.has('uas')
  const showZones    = cityLayers.has('zones')
  const showTraffic  = cityLayers.has('traffic')
  const showWeather  = cityLayers.has('weather')
  const showCrime    = cityLayers.has('crime')
  const showAircraft = cityLayers.has('aircraft')
  const showPower    = cityLayers.has('power')

  const { drones }              = useDrones(showUAS, mapBounds)
  const { zones }               = useAirspaceZones(showZones, mapBounds)
  const { data: trafficData }   = useTrafficIncidents(showTraffic, mapBounds)
  const { data: crimeData }     = useCrimeIncidents(showCrime, mapBounds)
  const { data: aircraftData }  = useLowAltAircraft(showAircraft, mapBounds)

  // Weather and power use center point instead of bbox
  const center = useMemo(() => {
    if (!mapBounds) return null
    return {
      lat: (mapBounds.minLat + mapBounds.maxLat) / 2,
      lng: (mapBounds.minLng + mapBounds.maxLng) / 2,
    }
  }, [mapBounds])

  const { data: weatherData } = useWeatherAlerts(showWeather, center)
  const { data: powerData }   = usePowerOutages(showPower, center)

  return (
    <>
      {showPower && <PowerLayer outages={powerData} />}
      {showWeather && <WeatherLayer alerts={weatherData} />}
      {showZones && <AirspaceZoneLayer zones={zones} />}
      {showCrime && <CrimeLayer incidents={crimeData} />}
      {showTraffic && <TrafficLayer incidents={trafficData} />}
      {showUAS && <DroneLayer drones={drones} />}
      {showAircraft && (
        <AircraftLayer
          aircraft={aircraftData}
          onSelect={(a) => {
            setSelectedEntity({ type: 'aircraft', data: a })
            setPanelVisible('entity', true)
          }}
        />
      )}
    </>
  )
}
