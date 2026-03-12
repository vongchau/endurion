// src/components/panels/CveDetail.tsx — enriched CVE display with CVSS scores
import { useCveEnrichment } from '../../hooks/useCveEnrichment'
import type { CveDetail as CveDetailType } from '../../types'

function CveCard({ cve }: { cve: CveDetailType }) {
  const scoreColor = cve.cvssScore === null ? '#4a6080'
    : cve.cvssScore >= 9.0 ? '#ff2d2d'
    : cve.cvssScore >= 7.0 ? '#ffaa00'
    : cve.cvssScore >= 4.0 ? '#00d4ff'
    : '#00ff88'

  return (
    <div className="px-2 py-1.5 rounded border border-hud-amber/20 bg-hud-amber/5 mb-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-hud-amber">{cve.id}</span>
        {cve.cvssScore !== null && (
          <span className="font-mono text-[9px] font-bold" style={{ color: scoreColor }}>
            {cve.cvssScore.toFixed(1)} {cve.cvssSeverity ?? ''}
          </span>
        )}
      </div>
      {cve.exploitAvailable && (
        <span className="inline-block mt-0.5 px-1 py-0.5 rounded text-[7px] font-mono bg-hud-red/20 text-hud-red border border-hud-red/30">
          EXPLOIT AVAILABLE
        </span>
      )}
      {cve.description && (
        <p className="font-mono text-[8px] text-hud-dim leading-snug mt-1 line-clamp-2">
          {cve.description}
        </p>
      )}
      {cve.affectedProducts.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {cve.affectedProducts.slice(0, 3).map(p => (
            <span key={p} className="px-1 py-0.5 rounded text-[7px] font-mono bg-hud-dim/10 text-hud-dim border border-hud-dim/20">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CveFallbackTag({ id }: { id: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-hud-amber/10 text-hud-amber border border-hud-amber/20">
      {id}
    </span>
  )
}

export function EnrichedCveSection({ cveIds }: { cveIds: string[] }) {
  const { cves, loading } = useCveEnrichment(cveIds)

  if (cveIds.length === 0) return null

  return (
    <div className="mb-2">
      {cveIds.map(id => {
        const enriched = cves[id]
        return enriched ? (
          <CveCard key={id} cve={enriched} />
        ) : (
          <div key={id} className="mb-1">
            <CveFallbackTag id={id} />
            {loading && <span className="font-mono text-[7px] text-hud-dim ml-1 animate-pulse">enriching...</span>}
          </div>
        )
      })}
    </div>
  )
}
