// src/data/city-pois.ts
import { CityPOI } from '../types'

// Centered on New York City
export const cityPOIs: CityPOI[] = [
  { id: 'c1', lat: 40.7580, lng: -73.9855, district: 'Midtown', type: 'surveillance', label: 'NODE-47', activityLevel: 72 },
  { id: 'c2', lat: 40.7061, lng: -74.0088, district: 'Financial District', type: 'asset', label: 'ASSET-ALPHA', activityLevel: 91 },
  { id: 'c3', lat: 40.7282, lng: -73.7949, district: 'Jamaica', type: 'incident', label: 'INC-2241', activityLevel: 88 },
  { id: 'c4', lat: 40.6892, lng: -74.0445, district: 'Statue Island', type: 'surveillance', label: 'NODE-12', activityLevel: 34 },
  { id: 'c5', lat: 40.7831, lng: -73.9712, district: 'Upper West Side', type: 'incident', label: 'INC-2238', activityLevel: 65 },
  { id: 'c6', lat: 40.6782, lng: -73.9442, district: 'Brooklyn', type: 'surveillance', label: 'NODE-88', activityLevel: 55 },
  { id: 'c7', lat: 40.7282, lng: -73.7949, district: 'Queens', type: 'asset', label: 'ASSET-BRAVO', activityLevel: 43 },
  { id: 'c8', lat: 40.8448, lng: -73.8648, district: 'Bronx', type: 'incident', label: 'INC-2239', activityLevel: 79 },
  { id: 'c9', lat: 40.7484, lng: -73.9967, district: 'Chelsea', type: 'surveillance', label: 'NODE-23', activityLevel: 61 },
  { id: 'c10', lat: 40.7614, lng: -73.9776, district: 'Midtown East', type: 'asset', label: 'ASSET-GAMMA', activityLevel: 97 },
]
