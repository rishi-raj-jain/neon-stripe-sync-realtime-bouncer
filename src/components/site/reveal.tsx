'use client'

import { cn } from '@/lib/utils'
import { useEffect, useRef, useState, type ComponentProps } from 'react'

/** Fades + rises once when scrolled into view (static under reduced motion, see globals.css). */
export function Reveal({ className, delay = 0, style, ...props }: ComponentProps<'div'> & { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  // State, not classList: a re-render must never take a revealed section away again.
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className={cn('reveal', shown && 'is-in', className)} style={{ transitionDelay: `${delay}ms`, ...style }} {...props} />
}
