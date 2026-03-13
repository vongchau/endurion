// server/utils.ts — shared helpers for server-side caches

export function stripHtml(html: string | undefined, maxLen = 300): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

export function hashLink(prefix: string, link: string): string {
  let h = 0
  for (let i = 0; i < link.length; i++) {
    h = ((h << 5) - h + link.charCodeAt(i)) | 0
  }
  return prefix + '-' + Math.abs(h).toString(36)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
