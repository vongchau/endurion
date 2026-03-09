// server/sources/cloudflare.ts
// Cloudflare Cloudforce One — Threat Events API

const BASE = 'https://api.cloudflare.com/client/v4/accounts'

export interface CloudflareThreatEvent {
  id: string
  attacker: string
  attackerCountry: string
  category: string
  categoryId: string
  date: string
  targetIndustry: string
  tags: string[]
  tlp: string
  accountability: string
}

export async function fetchThreatEvents(
  accountId: string,
  apiKey: string
): Promise<CloudflareThreatEvent[]> {
  const url = `${BASE}/${accountId}/cloudforce-one/events`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Cloudflare events API ${res.status}: ${await res.text()}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : (json.result ?? json.data ?? [])
}

