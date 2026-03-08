// src/views/cyber/CyberLayer.tsx
import { useEffect, useRef, useCallback } from 'react'
import { Marker, useMap } from 'react-map-gl/mapbox'
import { useHUDStore } from '../../store'
import { cyberGraph } from '../../data/cyber-graph'
import type { CyberNode } from '../../types'

const NODE_COLORS: Record<CyberNode['type'], string> = {
  actor: '#ff2d2d',
  compromised: '#ffaa00',
  cluster: '#7b2fff',
  asset: '#00d4ff',
}

function useAnimatedEdges(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  getPixel: (lng: number, lat: number) => [number, number] | null
) {
  const animRef = useRef<number>(0)
  const progressRef = useRef<number[]>(cyberGraph.edges.map(() => Math.random()))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      cyberGraph.edges.forEach((edge, i) => {
        const src = cyberGraph.nodes.find(n => n.id === edge.sourceId)
        const dst = cyberGraph.nodes.find(n => n.id === edge.targetId)
        if (!src || !dst) return

        const srcPx = getPixel(src.lng, src.lat)
        const dstPx = getPixel(dst.lng, dst.lat)
        if (!srcPx || !dstPx) return

        const color = edge.threatScore > 80 ? '#ff2d2d' : edge.threatScore > 60 ? '#ffaa00' : '#00d4ff'

        // Draw edge line
        ctx.beginPath()
        ctx.moveTo(srcPx[0], srcPx[1])
        ctx.lineTo(dstPx[0], dstPx[1])
        ctx.strokeStyle = `${color}40`
        ctx.lineWidth = 1
        ctx.stroke()

        // Animate data packet dot
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
  }, [canvasRef, getPixel])
}

export function CyberLayer() {
  const { current: map } = useMap()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setSelectedEntity = useHUDStore((s) => s.setSelectedEntity)
  const setPanelVisible = useHUDStore((s) => s.setPanelVisible)

  const getPixel = useCallback((lng: number, lat: number): [number, number] | null => {
    if (!map) return null
    const pt = map.project([lng, lat])
    return [pt.x, pt.y]
  }, [map])

  useAnimatedEdges(canvasRef, getPixel)

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

  return (
    <>
      {/* Canvas for animated edges */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
      />

      {/* Node markers */}
      {cyberGraph.nodes.map((node) => {
        const color = NODE_COLORS[node.type]
        return (
          <Marker key={node.id} longitude={node.lng} latitude={node.lat} anchor="center">
            <button
              onClick={() => {
                setSelectedEntity({ type: 'node', data: node })
                setPanelVisible('entity', true)
              }}
              className="relative flex items-center justify-center w-8 h-8 rounded-full border-2 backdrop-blur-sm hover:scale-125 transition-transform"
              style={{
                borderColor: color,
                backgroundColor: `${color}15`,
                boxShadow: `0 0 10px ${color}60`,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            </button>
          </Marker>
        )
      })}
    </>
  )
}
