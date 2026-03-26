import type { DroneTrailPoint } from './types'

/** Shared lookup for drone trails — written by DroneLayer, read by MapCanvas on click. */
export const droneTrailsRef = new Map<string, DroneTrailPoint[]>()
