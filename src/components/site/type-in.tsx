'use client'

import { useEffect, useState } from 'react'

/** Types one line in once, then stays static. Reduced motion shows it whole immediately. */
export function TypeIn({ text, delayMs = 400, stepMs = 28 }: { text: string; delayMs?: number; stepMs?: number }) {
  const [shown, setShown] = useState(text.length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setShown(0)
    let index = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      index += 1
      setShown(index)
      if (index < text.length) timer = setTimeout(tick, stepMs)
    }
    timer = setTimeout(tick, delayMs)
    return () => clearTimeout(timer)
  }, [text, delayMs, stepMs])

  return (
    <span aria-label={text}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {shown < text.length && <span aria-hidden="true" className="ml-px inline-block h-[1.1em] w-[0.55ch] translate-y-[0.15em] bg-(--color-signal-on-dark)" />}
    </span>
  )
}
