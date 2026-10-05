/**
 * Full-screen animated starfield behind every page, in the spirit of
 * deep.space. A fixed <canvas> sits under the app; stars drift slowly and
 * twinkle. Drawing starts in an effect, so the prerendered landing page is
 * still plain HTML, and it stops for people who prefer reduced motion.
 */

import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  r: number
  speed: number
  phase: number
}

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let stars: Star[] = []
    let frame = 0
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round((width * height) / 5200)
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.08 ? 1.3 : Math.random() * 0.9 + 0.2,
        speed: Math.random() * 0.08 + 0.02,
        phase: Math.random() * Math.PI * 2,
      }))
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)
      for (const s of stars) {
        if (!still) {
          s.y -= s.speed
          if (s.y < -2) {
            s.y = height + 2
            s.x = Math.random() * width
          }
        }
        const twinkle = still ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(t / 1400 + s.phase))
        ctx.globalAlpha = twinkle * (s.r > 1 ? 0.95 : 0.7)
        ctx.fillStyle = s.r > 1 ? '#c9c9ff' : '#ffffff'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (!still) frame = requestAnimationFrame(draw)
    }

    resize()
    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
      {/* A faint violet glow near the top, like the DeepSpace hero */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh]"
        style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(120,110,255,0.14), transparent 70%)' }}
      />
    </>
  )
}

/** The four-point sparkle mark used beside the name. */
export function Sparkle({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12 6.2-.6 11.4-5.8 12-12z" />
    </svg>
  )
}
