// src/data/cities.ts
import type { CityProfile } from '../types'

export const CITIES: CityProfile[] = [
  { id: 'nyc', name: 'New York City',  state: 'NY', ori: 'NY0303000', lat: 40.7128,  lng: -74.0060,  zoom: 11 },
  { id: 'la',  name: 'Los Angeles',    state: 'CA', ori: 'CA0190200', lat: 34.0522,  lng: -118.2437, zoom: 10 },
  { id: 'chi', name: 'Chicago',        state: 'IL', ori: 'IL0160000', lat: 41.8781,  lng: -87.6298,  zoom: 11 },
  { id: 'hou', name: 'Houston',        state: 'TX', ori: 'TX2010000', lat: 29.7604,  lng: -95.3698,  zoom: 10 },
  { id: 'phx', name: 'Phoenix',        state: 'AZ', ori: 'AZ0020100', lat: 33.4484,  lng: -112.0740, zoom: 10 },
  { id: 'phi', name: 'Philadelphia',   state: 'PA', ori: 'PA5160100', lat: 39.9526,  lng: -75.1652,  zoom: 11 },
  { id: 'sa',  name: 'San Antonio',    state: 'TX', ori: 'TX2010300', lat: 29.4241,  lng: -98.4936,  zoom: 10 },
  { id: 'dal', name: 'Dallas',         state: 'TX', ori: 'TX0570000', lat: 32.7767,  lng: -96.7970,  zoom: 11 },
  { id: 'det', name: 'Detroit',        state: 'MI', ori: 'MI1820000', lat: 42.3314,  lng: -83.0458,  zoom: 11 },
  { id: 'atl', name: 'Atlanta',        state: 'GA', ori: 'GA0440200', lat: 33.7490,  lng: -84.3880,  zoom: 11 },
  { id: 'sd',  name: 'San Diego',      state: 'CA', ori: 'CA0370200', lat: 32.7157,  lng: -117.1611, zoom: 10 },
  { id: 'mia', name: 'Miami',          state: 'FL', ori: 'FL0130100', lat: 25.7617,  lng: -80.1918,  zoom: 11 },
]
