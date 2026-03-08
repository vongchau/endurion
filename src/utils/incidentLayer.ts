// src/utils/incidentLayer.ts
import type { GlobalIncident, GlobalLayer } from '../types'

const DISASTER_TYPES = new Set([
  'Earthquake', 'Flood', 'Wildfire', 'Volcano',
  'Severe Storm', 'Landslide', 'Drought',
])

export function incidentToLayer(incident: GlobalIncident): GlobalLayer {
  if (incident.source === 'usgs' || incident.source === 'gdacs' || incident.source === 'eonet') return 'disaster'
  if (DISASTER_TYPES.has(incident.type)) return 'disaster'
  return 'conflict'
}
