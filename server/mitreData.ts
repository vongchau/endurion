// server/mitreData.ts — MITRE ATT&CK Enterprise matrix (v15)

export interface MitreTactic {
  id: string
  name: string
  shortName: string
  order: number
}

export interface MitreTechnique {
  id: string
  name: string
  tacticIds: string[]
}

export const TACTICS: MitreTactic[] = [
  { id: 'TA0043', name: 'Reconnaissance',        shortName: 'reconnaissance',        order: 0 },
  { id: 'TA0042', name: 'Resource Development',   shortName: 'resource-development',   order: 1 },
  { id: 'TA0001', name: 'Initial Access',         shortName: 'initial-access',         order: 2 },
  { id: 'TA0002', name: 'Execution',              shortName: 'execution',              order: 3 },
  { id: 'TA0003', name: 'Persistence',            shortName: 'persistence',            order: 4 },
  { id: 'TA0004', name: 'Privilege Escalation',   shortName: 'privilege-escalation',   order: 5 },
  { id: 'TA0005', name: 'Defense Evasion',        shortName: 'defense-evasion',        order: 6 },
  { id: 'TA0006', name: 'Credential Access',      shortName: 'credential-access',      order: 7 },
  { id: 'TA0007', name: 'Discovery',              shortName: 'discovery',              order: 8 },
  { id: 'TA0008', name: 'Lateral Movement',       shortName: 'lateral-movement',       order: 9 },
  { id: 'TA0009', name: 'Collection',             shortName: 'collection',             order: 10 },
  { id: 'TA0011', name: 'Command and Control',    shortName: 'command-and-control',    order: 11 },
  { id: 'TA0010', name: 'Exfiltration',           shortName: 'exfiltration',           order: 12 },
  { id: 'TA0040', name: 'Impact',                 shortName: 'impact',                 order: 13 },
]

const TACTIC_ALIASES: Record<string, string> = {}
for (const t of TACTICS) {
  const lower = t.name.toLowerCase()
  TACTIC_ALIASES[lower] = t.id
  TACTIC_ALIASES[t.shortName] = t.id
  if (lower === 'command and control') TACTIC_ALIASES['c2'] = t.id
  if (lower === 'command and control') TACTIC_ALIASES['command & control'] = t.id
  if (lower === 'privilege escalation') TACTIC_ALIASES['priv esc'] = t.id
}

export function resolveTacticId(name: string): string | null {
  return TACTIC_ALIASES[name.toLowerCase().trim()] ?? null
}

export function getTactics(): MitreTactic[] {
  return TACTICS
}
