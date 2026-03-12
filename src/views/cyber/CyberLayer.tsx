// src/views/cyber/CyberLayer.tsx
import { useEffect, useRef, useCallback, useMemo } from 'react'
import { Marker, useMap } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { useCyberNews } from '../../hooks/useCyberNews'
import type { CyberNewsNode, CyberNewsGraph, CyberNewsArticle } from '../../types'

const NODE_COLORS: Record<CyberNewsNode['type'], string> = {
  actor: '#ff2d2d',
  target: '#00d4ff',
}

const NODE_SIZES: Record<CyberNewsNode['type'], { outer: string; inner: string }> = {
  actor: { outer: 'w-10 h-10', inner: 'w-2.5 h-2.5' },
  target: { outer: 'w-8 h-8', inner: 'w-2 h-2' },
}

function useAnimatedEdges(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  getPixel: (lng: number, lat: number) => [number, number] | null,
  graph: CyberNewsGraph | null
) {
  const animRef = useRef<number>(0)
  const progressRef = useRef<number[]>([])

  useEffect(() => {
    const edgeCount = graph?.edges.length ?? 0
    if (progressRef.current.length !== edgeCount) {
      progressRef.current = Array.from({ length: edgeCount }, () => Math.random())
    }
  }, [graph?.edges.length])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !graph) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
      graph.edges.forEach((edge, i) => {
        const src = nodeMap.get(edge.sourceId)
        const dst = nodeMap.get(edge.targetId)
        if (!src || !dst) return

        const srcPx = getPixel(src.lng, src.lat)
        const dstPx = getPixel(dst.lng, dst.lat)
        if (!srcPx || !dstPx) return

        const color = edge.threatScore > 80 ? '#ff2d2d' : edge.threatScore > 50 ? '#ffaa00' : '#00d4ff'

        // Draw edge line
        ctx.beginPath()
        ctx.moveTo(srcPx[0], srcPx[1])
        ctx.lineTo(dstPx[0], dstPx[1])
        ctx.strokeStyle = `${color}40`
        ctx.lineWidth = Math.min(edge.articleCount, 4)
        ctx.stroke()

        // Animate data packet dot
        if (progressRef.current[i] === undefined) progressRef.current[i] = Math.random()
        progressRef.current[i] = (progressRef.current[i] + 0.003) % 1
        const t = progressRef.current[i]
        const px = srcPx[0] + (dstPx[0] - srcPx[0]) * t
        const py = srcPx[1] + (dstPx[1] - srcPx[1]) * t
        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.shadowBlur = 6
        ctx.shadowColor = color
        ctx.fill()
        ctx.shadowBlur = 0
      })

      animRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animRef.current)
  }, [canvasRef, getPixel, graph])
}

export function CyberLayer() {
  const { current: map } = useMap()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)
  const { graph, articles, loading } = useCyberNews()

  // Build a lookup: node id → first matching article for entity panel
  const nodeArticleMap = useMemo(() => {
    const map = new Map<string, CyberNewsArticle>()
    for (const a of articles) {
      if (a.sourceActor) {
        const actorId = `actor-${a.sourceActor.toLowerCase().replace(/\s+/g, '-')}`
        if (!map.has(actorId)) map.set(actorId, a)
      }
      if (a.target) {
        const targetId = `target-${a.target.toLowerCase().replace(/\s+/g, '-')}`
        if (!map.has(targetId)) map.set(targetId, a)
      }
    }
    return map
  }, [articles])

  const getPixel = useCallback((lng: number, lat: number): [number, number] | null => {
    if (!map) return null
    const pt = map.project([lng, lat])
    return [pt.x, pt.y]
  }, [map])

  useAnimatedEdges(canvasRef, getPixel, graph)

  // Sync canvas size to map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    const resize = () => {
      const container = map.getContainer()
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
    }
    resize()
    map.on('resize', resize)
    return () => { map.off('resize', resize) }
  }, [map])

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <span className="text-cyan-400 font-mono text-sm tracking-widest animate-pulse">
          SYNCING CYBER THREAT INTEL...
        </span>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <span className="text-dim font-mono text-sm tracking-widest">
          AWAITING THREAT EXTRACTION...
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Canvas for animated edges */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
      />

      {/* Node markers */}
      {graph.nodes.map((node) => {
        const color = NODE_COLORS[node.type]
        const sizes = NODE_SIZES[node.type]
        return (
          <Marker key={node.id} longitude={node.lng} latitude={node.lat} anchor="center">
            <button
              onClick={() => {
                if (node.type === 'actor') {
                  // Fetch actor profile
                  fetch(`/api/cyber/actor/${encodeURIComponent(node.label)}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(profile => {
                      if (profile) {
                        setSelectedEntity({ type: 'actorProfile', data: profile })
                        setPanelVisible('entity', true)
                      }
                    })
                    .catch(() => {})
                } else {
                  const article = nodeArticleMap.get(node.id)
                  if (article) {
                    setSelectedEntity({ type: 'cyberNews', data: article })
                    setPanelVisible('entity', true)
                  }
                }
              }}
              className={`relative flex items-center justify-center ${sizes.outer} rounded-full border-2 backdrop-blur-sm hover:scale-125 transition-transform`}
              style={{
                borderColor: color,
                backgroundColor: `${color}15`,
                boxShadow: `0 0 10px ${color}60`,
              }}
              title={`${node.label} — ${node.type.toUpperCase()} (${node.articleCount} articles)`}
            >
              <span className={`${sizes.inner} rounded-full`} style={{ backgroundColor: color }} />
              {node.articleCount > 1 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-hud-panel border text-[7px] font-mono flex items-center justify-center"
                  style={{ borderColor: color, color }}>
                  {node.articleCount}
                </span>
              )}
            </button>
          </Marker>
        )
      })}
    </>
  )
}
