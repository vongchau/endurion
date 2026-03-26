// src/components/MapCanvas/index.tsx
import { useCallback, useEffect, useState } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapMouseEvent, ViewStateChangeEvent } from 'react-map-gl/mapbox'
import type { AISVessel, DroneFlight, NewsArticle } from '../../types'
import { useHUDStore } from '../../store'
import { GlobalMarkers } from '../../views/global/GlobalMarkers'
import { CityMarkers } from '../../views/city/CityMarkers'
import { CyberLayer } from '../../views/cyber/CyberLayer'
import { SpaceLayer } from '../../views/space/SpaceLayer'
import { mapRef } from '../../mapRef'
import { droneTrailsRef } from '../../droneTrails'

// Build-time token (works in local dev with .env.local)
const BUILD_TIME_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

import type { CityBasemap } from '../../types'

const VIEW_CONFIGS = {
  global: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  city: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11', // overridden by cityBasemap
    initialViewState: { longitude: -96, latitude: 38, zoom: 3.5 },
  },
  cyber: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
  space: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
  },
}

const CITY_BASEMAP_STYLES: Record<CityBasemap, string> = {
  'streets-dark': 'mapbox://styles/mapbox/dark-v11',
  'streets-light': 'mapbox://styles/mapbox/streets-v12',
  'satellite': 'mapbox://styles/mapbox/satellite-streets-v12',
}

export function MapCanvas() {
  const activeView = useHUDStore((s) => s.activeView)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible   = useHUDStore((s) => s.setPanelVisible)
  const setMapZoom   = useHUDStore((s) => s.setMapZoom)
  const setMapBounds = useHUDStore((s) => s.setMapBounds)
  const cityBasemap  = useHUDStore((s) => s.cityBasemap)
  const config = VIEW_CONFIGS[activeView]
  const mapStyle = activeView === 'city' ? CITY_BASEMAP_STYLES[cityBasemap] : config.mapStyle

  // Use build-time token if available, otherwise fetch from server at runtime
  const [mapboxToken, setMapboxToken] = useState(BUILD_TIME_TOKEN || '')
  useEffect(() => {
    if (mapboxToken) return
    fetch('/api/config').then(r => r.json())
      .then((cfg: { mapboxToken: string }) => { if (cfg.mapboxToken) setMapboxToken(cfg.mapboxToken) })
      .catch(() => {})
  }, [mapboxToken])

  const handleMoveEnd = useCallback((evt: ViewStateChangeEvent) => {
    const map = mapRef.current?.getMap()
    if (!map) return
    setMapZoom(evt.viewState.zoom)
    const b = map.getBounds()
    if (b) {
      setMapBounds({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      })
    }
  }, [setMapZoom, setMapBounds])

  const handleMapClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return

    // Cluster click — expand all leaves into EntityPanel
    if (feature.layer?.id === 'news-clusters') {
      const clusterId = feature.properties?.cluster_id as number | undefined
      const map = mapRef.current?.getMap()
      if (clusterId === undefined || !map) return

      const source = map.getSource('news-articles')
      if (!source || !('getClusterLeaves' in source)) return

      ;(source as { getClusterLeaves: (id: number, limit: number, offset: number, cb: (err: Error | null, features: GeoJSON.Feature[] | null) => void) => void })
        .getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
        if (err || !leaves) return
        const articles: NewsArticle[] = leaves.map((leaf) => {
          const p = leaf.properties as Record<string, unknown>
          const coords = (leaf.geometry as GeoJSON.Point).coordinates
          return {
            id:           String(p.id ?? ''),
            title:        String(p.title ?? ''),
            link:         String(p.link ?? ''),
            source:       String(p.source ?? ''),
            category:     (p.category ?? 'world_news') as NewsArticle['category'],
            region:       (p.region ?? 'global') as NewsArticle['region'],
            pubDate:      '',
            timestamp:    Number(p.timestamp ?? 0),
            priority:     (p.priority ?? 'low') as NewsArticle['priority'],
            latitude:     coords[1],
            longitude:    coords[0],
            locationName: String(p.locationName ?? ''),
          }
        })
        articles.sort((a, b) => b.timestamp - a.timestamp)
        setSelectedEntity({ type: 'newsCluster', data: articles })
        setPanelVisible('entity', true)
      })
      return
    }

    if (feature.layer?.id === 'news-points') {
      const p = feature.properties as Record<string, unknown>
      const news: NewsArticle = {
        id:           String(p.id ?? ''),
        title:        String(p.title ?? ''),
        link:         String(p.link ?? ''),
        source:       String(p.source ?? ''),
        category:     (p.category ?? 'world_news') as NewsArticle['category'],
        region:       (p.region ?? 'global') as NewsArticle['region'],
        pubDate:      '',
        timestamp:    Number(p.timestamp ?? 0),
        priority:     (p.priority ?? 'low') as NewsArticle['priority'],
        latitude:     event.lngLat.lat,
        longitude:    event.lngLat.lng,
        locationName: String(p.locationName ?? ''),
      }
      setSelectedEntity({ type: 'news', data: news })
      setPanelVisible('entity', true)
      return
    }

    if (feature.layer?.id === 'drone-points') {
      const p = feature.properties as Record<string, unknown>
      const droneId = String(p.id ?? '')
      const drone: DroneFlight = {
        id:            droneId,
        sensorId:      String(p.sensorId ?? ''),
        lat:           event.lngLat.lat,
        lng:           event.lngLat.lng,
        altitude:      Number(p.altitude ?? 0),
        speed:         Number(p.speed ?? 0),
        verticalSpeed: Number(p.verticalSpeed ?? 0),
        heading:       Number(p.heading ?? 0),
        state:         String(p.state ?? 'unknown'),
        timestamp:     Number(p.timestamp ?? 0),
        trail:         [],
      }
      setSelectedEntity({ type: 'drone', data: drone })
      setPanelVisible('entity', true)

      // Fit map to the drone's flight trail
      const trail = droneTrailsRef.get(droneId)
      const map = mapRef.current?.getMap()
      if (map && trail && trail.length >= 2) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
        for (const pt of trail) {
          if (pt.lng < minLng) minLng = pt.lng
          if (pt.lat < minLat) minLat = pt.lat
          if (pt.lng > maxLng) maxLng = pt.lng
          if (pt.lat > maxLat) maxLat = pt.lat
        }
        map.fitBounds([minLng, minLat, maxLng, maxLat], {
          padding: 80,
          maxZoom: 16,
          duration: 1500,
        })
      } else if (map) {
        map.flyTo({ center: [event.lngLat.lng, event.lngLat.lat], zoom: 15, duration: 1500 })
      }
      return
    }

    if (feature.layer?.id === 'traffic-points') {
      const p = feature.properties as Record<string, unknown>
      setSelectedEntity({ type: 'traffic', data: {
        id: String(p.id ?? ''), lat: event.lngLat.lat, lng: event.lngLat.lng,
        category: String(p.category ?? 'other') as 'accident'|'congestion'|'roadClosed'|'roadWorks'|'weather'|'other',
        severity: Number(p.severity ?? 1) as 1|2|3|4,
        description: String(p.description ?? ''), delay: Number(p.delay ?? 0),
        startTime: Date.now(),
      }})
      setPanelVisible('entity', true)
      return
    }

    if (feature.layer?.id === 'crime-points') {
      const p = feature.properties as Record<string, unknown>
      setSelectedEntity({ type: 'crime', data: {
        id: String(p.id ?? ''), lat: event.lngLat.lat, lng: event.lngLat.lng,
        type: String(p.type ?? ''), description: String(p.type ?? ''),
        timestamp: Date.now(), city: String(p.city ?? '') as 'chicago'|'nyc'|'la',
        severity: String(p.severity ?? 'other') as 'violent'|'property'|'other',
      }})
      setPanelVisible('entity', true)
      return
    }

    if (feature.layer?.id === 'weather-fill') {
      const p = feature.properties as Record<string, unknown>
      setSelectedEntity({ type: 'weatherAlert', data: {
        id: String(p.id ?? ''), event: String(p.event ?? ''),
        severity: String(p.severity ?? 'minor') as 'extreme'|'severe'|'moderate'|'minor',
        urgency: 'expected' as const, headline: String(p.event ?? ''),
        description: '', onset: Date.now(), expires: Date.now() + 3600_000,
        geometry: null,
      }})
      setPanelVisible('entity', true)
      return
    }

    if (feature.layer?.id !== 'vessel-points') return
    const p = feature.properties as Record<string, unknown>
    const vessel: AISVessel = {
      mmsi:         Number(p.mmsi),
      name:         String(p.name ?? ''),
      lat:          event.lngLat.lat,
      lng:          event.lngLat.lng,
      speed:        Number(p.speed ?? 0),
      course:       Number(p.course ?? 0),
      heading:      Number(p.heading ?? 0),
      shipType:     Number(p.shipType ?? 0),
      shipTypeName: String(p.shipTypeName ?? ''),
      destination:  String(p.destination ?? ''),
      callSign:     String(p.callSign ?? ''),
      imo:          Number(p.imo ?? 0),
      draught:      Number(p.draught ?? 0),
      eta:          String(p.eta ?? ''),
      lengthOverall: Number(p.lengthOverall ?? 0),
      beam:         Number(p.beam ?? 0),
      timestamp:    Number(p.timestamp ?? 0),
    }
    setSelectedEntity({ type: 'vessel', data: vessel })
    setPanelVisible('entity', true)
  }, [setSelectedEntity, setPanelVisible])

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    if (activeView === 'global') {
      map.setFog({ color: 'rgb(5, 8, 16)', 'high-color': 'rgb(0, 50, 80)', 'horizon-blend': 0.02 })
    }
    if (activeView === 'space') {
      map.setFog({ color: 'rgb(2, 4, 8)', 'high-color': 'rgb(0, 0, 20)', 'horizon-blend': 0.01 })
    }
    // Capture initial zoom & bounds
    setMapZoom(map.getZoom())
    const b = map.getBounds()
    if (b) {
      setMapBounds({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      })
    }
  }, [activeView, setMapZoom, setMapBounds])

  if (!mapboxToken) return <div className="absolute inset-0 bg-hud-bg" />

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        key={activeView === 'city' ? `city-${cityBasemap}` : activeView}
        mapboxAccessToken={mapboxToken}
        mapStyle={mapStyle}
        initialViewState={config.initialViewState}
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        interactiveLayerIds={
          activeView === 'global' ? ['vessel-points', 'news-points', 'news-clusters'] :
          activeView === 'city' ? ['drone-points', 'traffic-points', 'crime-points', 'weather-fill'] :
          []
        }
        projection={activeView === 'global' || activeView === 'space' ? 'globe' : 'mercator'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {activeView === 'global' && <GlobalMarkers />}
        {activeView === 'city' && <CityMarkers />}
        {activeView === 'cyber' && <CyberLayer />}
        {activeView === 'space' && <SpaceLayer />}
      </Map>
    </div>
  )
}
