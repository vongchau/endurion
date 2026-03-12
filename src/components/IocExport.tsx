// src/components/IocExport.tsx — copy/export IOCs from cyber articles
import { useState } from 'react'

interface IocExportProps {
  iocs: string[]
  cves: string[]
  malware: string[]
  actor?: string
  title?: string
}

export function IocExport({ iocs, cves, malware, actor, title }: IocExportProps) {
  const [copied, setCopied] = useState(false)
  const hasData = iocs.length > 0 || cves.length > 0

  if (!hasData) return null

  const buildText = () => {
    const lines: string[] = []
    if (title) lines.push(`# ${title}`, '')
    if (actor) lines.push(`Actor: ${actor}`, '')
    if (iocs.length > 0) {
      lines.push('## IOCs', ...iocs, '')
    }
    if (cves.length > 0) {
      lines.push('## CVEs', ...cves, '')
    }
    if (malware.length > 0) {
      lines.push('## Malware', ...malware, '')
    }
    return lines.join('\n')
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportCsv = () => {
    const rows = [
      ['type', 'value'],
      ...iocs.map(i => ['ioc', i]),
      ...cves.map(c => ['cve', c]),
      ...malware.map(m => ['malware', m]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iocs-${actor?.replace(/\s+/g, '-') ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-1.5 mt-2 mb-1">
      <button
        onClick={handleCopy}
        className="flex-1 px-2 py-1.5 rounded border text-center font-mono text-[9px] tracking-wider transition-colors border-hud-green/30 text-hud-green hover:bg-hud-green/10"
      >
        {copied ? 'COPIED' : 'COPY IOCs'}
      </button>
      <button
        onClick={handleExportCsv}
        className="flex-1 px-2 py-1.5 rounded border text-center font-mono text-[9px] tracking-wider transition-colors border-hud-dim/30 text-hud-dim hover:bg-hud-dim/10"
      >
        EXPORT CSV
      </button>
    </div>
  )
}
