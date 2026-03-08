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
  type: 'incident' | 'poi' | 'node' | 'satellite'
  data: GlobalIncident | CityPOI | CyberNode | Satellite
}

export interface PanelState {
  eventFeed: boolean
  entity: boolean
  statusBar: boolean
  timeline: boolean
}
