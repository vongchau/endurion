// src/data/global-incidents.ts
import { GlobalIncident } from '../types'

export const globalIncidents: GlobalIncident[] = [
  { id: 'g1', lat: 48.8566, lng: 2.3522, country: 'France', type: 'Cyber Intrusion', severity: 'critical', timestamp: '2026-03-08T14:23:00Z', summary: 'State-sponsored APT detected in financial sector infrastructure' },
  { id: 'g2', lat: 35.6762, lng: 139.6503, country: 'Japan', type: 'Signal Intelligence', severity: 'high', timestamp: '2026-03-08T13:55:00Z', summary: 'Unusual radio frequency activity near naval installation' },
  { id: 'g3', lat: 55.7558, lng: 37.6173, country: 'Russia', type: 'Disinformation', severity: 'high', timestamp: '2026-03-08T13:40:00Z', summary: 'Coordinated social media campaign targeting EU elections' },
  { id: 'g4', lat: 39.9042, lng: 116.4074, country: 'China', type: 'Supply Chain', severity: 'medium', timestamp: '2026-03-08T12:10:00Z', summary: 'Anomalous firmware update detected in telecom hardware' },
  { id: 'g5', lat: 28.6139, lng: 77.2090, country: 'India', type: 'Border Activity', severity: 'medium', timestamp: '2026-03-08T11:30:00Z', summary: 'Elevated troop movements along northern corridor' },
  { id: 'g6', lat: 33.8688, lng: 151.2093, country: 'Australia', type: 'Cyber Intrusion', severity: 'low', timestamp: '2026-03-08T10:15:00Z', summary: 'Port scanning activity against government networks' },
  { id: 'g7', lat: 51.5074, lng: -0.1278, country: 'UK', type: 'Human Intelligence', severity: 'high', timestamp: '2026-03-08T09:45:00Z', summary: 'Asset contact interrupted — status unknown' },
  { id: 'g8', lat: -33.8688, lng: -70.6693, country: 'Chile', type: 'Economic', severity: 'low', timestamp: '2026-03-08T08:20:00Z', summary: 'Unusual commodity futures activity in copper markets' },
  { id: 'g9', lat: 24.4539, lng: 54.3773, country: 'UAE', type: 'Cyber Intrusion', severity: 'critical', timestamp: '2026-03-08T07:55:00Z', summary: 'Zero-day exploit deployed against energy infrastructure' },
  { id: 'g10', lat: 40.7128, lng: -74.0060, country: 'USA', type: 'Threat Actor', severity: 'high', timestamp: '2026-03-08T07:00:00Z', summary: 'PHANTOM-9 group resurfaces with new C2 infrastructure' },
]
