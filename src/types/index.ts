// src/types/index.ts

export type ViewMode = 'global' | 'city' | 'cyber' | 'space'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'nominal'

export interface GlobalIncident {
  id: string
  lat: number
  lng: number
  country: string
  type: string
  severity: Severity
  timestamp: string
  summary: string
  source: 'usgs' | 'gdacs' | 'eonet' | 'acled'
  url?: string
}

export interface MilitaryFlight {
  id: string        // ICAO 24-bit hex
  callsign: string
  lat: number
  lng: number
  altitude: number  // meters
  velocity: number  // m/s
  heading: number   // degrees 0–360
  country: string
  timestamp: string
}

export type GlobalLayer = 'conflict' | 'disaster' | 'military' | 'maritime'

export type CityLayer = 'uas'

export interface AISVessel {
  mmsi: number
  name: string
  lat: number
  lng: number
  speed: number       // knots
  heading: number     // degrees 0–360
  shipType: number    // AIS numeric ship type
  shipTypeName: string
  timestamp: number
}

export interface VesselDensityZone {
  lat: number
  lng: number
  intensity: number   // 0.0–1.0 log-normalized
  vesselCount: number
}

export interface MilitaryCandidate {
  mmsi: number
  name: string
  lat: number
  lng: number
  heading: number
  speed: number
  shipType: number
  reason: string      // human-readable detection reason
  timestamp: number
}

export interface Chokepoint {
  name: string
  lat: number
  lng: number
  radius: number      // degrees, search radius
  vesselCount: number // live count from aisCache
}

export interface AISDisruption {
  id: string
  name: string
  type: 'chokepoint_congestion' | 'dark_ship'
  lat: number
  lng: number
  severity: 'low' | 'elevated' | 'high'
  vesselCount: number
  description: string
}

export interface DroneFlight {
  id: string              // operation_id
  sensorId: string
  lat: number
  lng: number
  altitude: number        // meters MSL
  speed: number           // m/s horizontal
  verticalSpeed: number   // m/s
  heading: number         // degrees 0-360
  state: string           // 'grounded' | 'airborne' | etc.
  timestamp: number
}

export interface MapBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface CityPOI {
  id: string
  lat: number
  lng: number
  district: string
  type: 'surveillance' | 'incident' | 'asset'
  label: string
  activityLevel: number // 0-100
}

export interface CyberNode {
  id: string
  lat: number
  lng: number
  label: string
  type: 'actor' | 'asset' | 'cluster' | 'compromised'
  threatScore: number // 0-100
}

export interface CyberEdge {
  id: string
  sourceId: string
  targetId: string
  protocol: string
  threatScore: number
  bytesPerSec: number
}

export interface CyberGraph {
  nodes: CyberNode[]
  edges: CyberEdge[]
}

export interface Satellite {
  id: string          // NORAD catalog number e.g. "25544"
  name: string        // e.g. "ISS (ZARYA)" or "STARLINK-1007"
  lat: number
  lng: number
  altitude: number    // km above Earth
  velocity: number    // km/s
  inclination: number // degrees
  type: 'iss' | 'starlink'
}

export interface Entity {
  type: 'incident' | 'poi' | 'node' | 'satellite' | 'vessel' | 'drone'
  data: GlobalIncident | CityPOI | CyberNode | Satellite | AISVessel | DroneFlight
}

export interface PanelState {
  eventFeed: boolean
  entity: boolean
  statusBar: boolean
  timeline: boolean
}

export interface CityProfile {
  id: string
  name: string
  state: string
  ori: string       // FBI Originating Agency Identifier, e.g. 'NY0303000'
  lat: number
  lng: number
  zoom: number
}

export interface CrimeProfileResponse {
  city: string
  ori: string
  fetchedAt: string
  trend: Array<{ year: number; count: number }>
  offenses: Array<{ offense: string; count: number }>
  weapons: Array<{ weapon: string; count: number }>
  offenderDemo: {
    age: Record<string, number>
    race: Record<string, number>
    sex: Record<string, number>
  }
  victimDemo: {
    age: Record<string, number>
    race: Record<string, number>
    sex: Record<string, number>
  }
  timeOfDay: Array<{ hour: number; count: number }>
}
