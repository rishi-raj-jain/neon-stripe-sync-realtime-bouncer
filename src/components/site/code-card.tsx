import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * The Cobalt code surface: graphite, hairline-framed, 10px radius. A file label and an optional
 * status chip sit in a plain header row (no drawn window chrome).
 */
export function CodeCard({ label, status, children, className }: { label: string; status?: string; children: ReactNode; className?: string }) {
  return (
    <figure className={cn('min-w-0 overflow-hidden rounded-[var(--radius-code)] border border-(--color-graphite-rule) bg-(--color-graphite) shadow-(--shadow-whisper)', className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-(--color-graphite-rule) px-4 py-2.5">
        <span className="truncate font-mono text-xs text-(--color-graphite-muted)">{label}</span>
        {status && <span className="shrink-0 rounded-[4px] border border-(--color-signal-on-dark)/40 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-[0.06em] text-(--color-signal-on-dark)">{status}</span>}
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-[1.7] text-(--color-graphite-ink)">{children}</pre>
    </figure>
  )
}

/** Syntax roles for CodeCard content: keys/methods in the signal, punctuation muted. */
export const Key = ({ children }: { children: ReactNode }) => <span className="text-(--color-signal-on-dark)">{children}</span>
export const Dim = ({ children }: { children: ReactNode }) => <span className="text-(--color-graphite-muted)">{children}</span>
