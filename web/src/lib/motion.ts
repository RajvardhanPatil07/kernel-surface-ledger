import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const frame = useRef<number>(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(2, -10 * progress)
      setValue(target * eased)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
      else setValue(target)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, durationMs])

  return value
}

export function formatWeight(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
}
