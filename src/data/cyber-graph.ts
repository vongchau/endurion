// src/data/cyber-graph.ts
import type { CyberGraph } from '../types'

export const cyberGraph: CyberGraph = {
  nodes: [
    { id: 'n1', lat: 40.7128, lng: -74.0060, label: 'PHANTOM-9', type: 'actor', threatScore: 95 },
    { id: 'n2', lat: 51.5074, lng: -0.1278, label: 'C2-LONDON', type: 'compromised', threatScore: 88 },
    { id: 'n3', lat: 48.8566, lng: 2.3522, label: 'C2-PARIS', type: 'compromised', threatScore: 82 },
    { id: 'n4', lat: 35.6762, lng: 139.6503, label: 'CLUSTER-TOKYO', type: 'cluster', threatScore: 67 },
    { id: 'n5', lat: 37.7749, lng: -122.4194, label: 'INFRA-SF', type: 'asset', threatScore: 45 },
    { id: 'n6', lat: 55.7558, lng: 37.6173, label: 'ORIGIN-MOSCOW', type: 'actor', threatScore: 91 },
    { id: 'n7', lat: 39.9042, lng: 116.4074, label: 'RELAY-BEIJING', type: 'compromised', threatScore: 78 },
    { id: 'n8', lat: 1.3521, lng: 103.8198, label: 'CLUSTER-SG', type: 'cluster', threatScore: 52 },
    { id: 'n9', lat: -23.5505, lng: -46.6333, label: 'PROXY-SAO', type: 'compromised', threatScore: 61 },
    { id: 'n10', lat: 25.2048, lng: 55.2708, label: 'RELAY-DUBAI', type: 'compromised', threatScore: 74 },
  ],
  edges: [
    { id: 'e1', sourceId: 'n6', targetId: 'n2', protocol: 'TLS/443', threatScore: 88, bytesPerSec: 45200 },
    { id: 'e2', sourceId: 'n6', targetId: 'n3', protocol: 'TLS/443', threatScore: 82, bytesPerSec: 31000 },
    { id: 'e3', sourceId: 'n2', targetId: 'n1', protocol: 'SSH/22', threatScore: 91, bytesPerSec: 12800 },
    { id: 'e4', sourceId: 'n3', targetId: 'n1', protocol: 'HTTP/80', threatScore: 76, bytesPerSec: 8900 },
    { id: 'e5', sourceId: 'n7', targetId: 'n4', protocol: 'DNS/53', threatScore: 67, bytesPerSec: 5200 },
    { id: 'e6', sourceId: 'n4', targetId: 'n8', protocol: 'TLS/443', threatScore: 55, bytesPerSec: 22100 },
    { id: 'e7', sourceId: 'n1', targetId: 'n5', protocol: 'HTTPS/443', threatScore: 94, bytesPerSec: 67800 },
    { id: 'e8', sourceId: 'n9', targetId: 'n1', protocol: 'TOR', threatScore: 70, bytesPerSec: 3400 },
    { id: 'e9', sourceId: 'n10', targetId: 'n2', protocol: 'TLS/443', threatScore: 74, bytesPerSec: 18900 },
    { id: 'e10', sourceId: 'n8', targetId: 'n5', protocol: 'SSH/22', threatScore: 49, bytesPerSec: 7600 },
  ],
}
