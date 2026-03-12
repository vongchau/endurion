// src/types/index.ts
import type * as GeoJSON from 'geojson'

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

export type GlobalLayer = 'conflict' | 'disaster' | 'military' | 'maritime' | 'news'

export type CityLayer = 'uas' | 'zones' | 'traffic' | 'weather' | 'crime' | 'aircraft' | 'power'

export interface AISVessel {
  mmsi: number
  name: string
  lat: number
  lng: number
  speed: number       // knots
  course: number      // COG degrees 0–360
  heading: number     // true heading degrees 0–360
  shipType: number    // AIS numeric ship type
  shipTypeName: string
  destination: string
  callSign: string
  imo: number
  draught: number
  eta: string
  lengthOverall: number  // dimensionA + dimensionB
  beam: number           // dimensionC + dimensionD
  timestamp: number
}

export interface VesselDensityZone {
  lat: number
  lng: number
  intensity: number   // 0.0–1.0 log-normalized
  vesselCount: number
  deltaPct: number    // % change from previous window
}

export interface MilitaryCandidate {
  mmsi: number
  name: string
  lat: number
  lng: number
  heading: number
  speed: number
  course: number
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
  vesselTypes: Record<string, number>  // ship type breakdown
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
  region: string
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

export interface TrafficIncident {
  id: string
  lat: number
  lng: number
  category: 'accident' | 'congestion' | 'roadClosed' | 'roadWorks' | 'weather' | 'other'
  severity: 1 | 2 | 3 | 4
  description: string
  delay: number
  startTime: number
  endTime?: number
}

export interface WeatherAlert {
  id: string
  event: string
  severity: 'extreme' | 'severe' | 'moderate' | 'minor'
  urgency: 'immediate' | 'expected' | 'future'
  headline: string
  description: string
  instruction?: string
  onset: number
  expires: number
  geometry: GeoJSON.Geometry | null
}

export interface CrimeIncident {
  id: string
  lat: number
  lng: number
  type: string
  description: string
  timestamp: number
  city: 'chicago' | 'nyc' | 'la'
  severity: 'violent' | 'property' | 'other'
}

export interface LowAltAircraft {
  id: string
  icao24: string
  callsign: string
  lat: number
  lng: number
  altitude: number
  velocity: number
  heading: number
  verticalRate: number
  squawk: string | null
  onGround: boolean
  timestamp: number
}

export interface PowerOutage {
  id: string
  state: string
  county: string
  utility: string
  customersAffected: number
  reportedStart: number
  estimatedRestoration?: number
  cause?: string
  geometry: GeoJSON.Geometry | null
  centroid: { lat: number; lng: number }
}

export interface MapBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface CyberNode {
  id: string
  lat: number
  lng: number
  label: string
  type: 'actor' | 'asset' | 'cluster' | 'compromised'
  threatScore: number // 0-100
  // Cloudflare enrichment
  country?: string
  category?: string
  targetIndustry?: string
  eventCount?: number
  tags?: string[]
  parentId?: string  // for burst nodes — links back to actor node
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

export type FeedCategory =
  | 'world_news' | 'regional' | 'defense_security' | 'think_tanks'
  | 'government' | 'tech' | 'economic' | 'humanitarian' | 'osint'
  | 'energy_resources'

export type FeedRegion =
  | 'global' | 'americas' | 'europe' | 'mena' | 'asia' | 'africa'
  | 'russia_eurasia'

export type NewsPriority = 'critical' | 'high' | 'medium' | 'low'

export interface NewsArticle {
  id: string
  title: string
  link: string
  source: string
  category: FeedCategory
  region: FeedRegion
  pubDate: string
  timestamp: number
  description?: string
  priority: NewsPriority
  latitude?: number
  longitude?: number
  locationName?: string
}

export type CyberAttackType =
  | 'ransomware' | 'apt' | 'phishing' | 'exploit' | 'ddos'
  | 'data_breach' | 'vulnerability' | 'supply_chain' | 'malware' | 'other'

export type CyberSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface CyberNewsArticle {
  id: string
  title: string
  link: string
  source: string
  pubDate: string
  timestamp: number
  description?: string
  sourceActor?: string
  sourceCountry?: string
  sourceLat?: number
  sourceLng?: number
  target?: string
  targetCountry?: string
  targetLat?: number
  targetLng?: number
  attackType: CyberAttackType
  severity: CyberSeverity
  malwareFamily: string[]
  cves: string[]
  iocs: string[]
  mitreTactics: string[]
  extracted: boolean
}

export interface CyberNewsNode {
  id: string
  label: string
  type: 'actor' | 'target'
  lat: number
  lng: number
  country?: string
  threatScore: number
  articleCount: number
  attackTypes: string[]
}

export interface CyberNewsEdge {
  id: string
  sourceId: string
  targetId: string
  attackType: string
  threatScore: number
  articleCount: number
}

export interface CyberNewsGraph {
  nodes: CyberNewsNode[]
  edges: CyberNewsEdge[]
}

// ── Cyber Aggregation Types ─────────────────────────────────────────

export interface ThreatStats {
  totalArticles: number
  extractedArticles: number
  activeActors: number
  activeTargets: number
  criticalCount24h: number
  highCount24h: number
  topAttackTypes: { name: string; count: number }[]
  topActors: { name: string; count: number; severity: string }[]
  topTargets: { name: string; count: number }[]
  topMalware: { name: string; count: number }[]
  trendingCves: { id: string; count: number }[]
}

export interface MitreHeatmapCell {
  tacticId: string
  tacticName: string
  count: number
  severity: string
}

export interface Campaign {
  id: string
  actor: string
  attackType: string
  malware: string[]
  targets: string[]
  articleCount: number
  severity: string
  firstSeen: number
  lastSeen: number
  articleIds: string[]
}

export interface ActorProfile {
  name: string
  country: string | null
  lat: number | null
  lng: number | null
  threatScore: number
  articleCount: number
  attackTypes: string[]
  targets: { name: string; country: string | null }[]
  malware: string[]
  cves: string[]
  mitreTactics: string[]
  recentArticles: { id: string; title: string; severity: string; timestamp: number }[]
  firstSeen: number
  lastSeen: number
}

export interface TemporalBucket {
  timestamp: number
  total: number
  critical: number
  high: number
  medium: number
  low: number
  attackTypes: Record<string, number>
}

export interface GeoHeatmapPoint {
  lat: number
  lng: number
  weight: number
  type: 'actor' | 'target'
}

export interface CveDetail {
  id: string
  description: string
  cvssScore: number | null
  cvssVector: string | null
  cvssSeverity: string | null
  publishedDate: string
  lastModified: string
  references: string[]
  affectedProducts: string[]
  exploitAvailable: boolean
}

export type CyberPanel = 'graph' | 'heatmap' | 'mitre'

export interface CyberClusterData {
  label: string
  nodeType: 'actor' | 'target'
  articles: CyberNewsArticle[]
}

export interface Entity {
  type: 'incident' | 'node' | 'satellite' | 'vessel' | 'drone' | 'news' | 'cyberNews' | 'newsCluster' | 'actorProfile' | 'edgeDetail' | 'cyberCluster' | 'traffic' | 'weatherAlert' | 'crime' | 'aircraft' | 'powerOutage'
  data: GlobalIncident | CyberNode | Satellite | AISVessel | DroneFlight | NewsArticle | CyberNewsArticle | NewsArticle[] | ActorProfile | CyberNewsArticle[] | CyberClusterData | TrafficIncident | WeatherAlert | CrimeIncident | LowAltAircraft | PowerOutage
}

export interface PanelState {
  eventFeed: boolean
  entity: boolean
  statusBar: boolean
  timeline: boolean
}
