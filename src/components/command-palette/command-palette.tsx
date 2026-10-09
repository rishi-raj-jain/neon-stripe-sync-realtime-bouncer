'use client'

import { signOut } from '@/app/auth/actions'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SITE } from '@/shared/site'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * The ⌘K palette (Hallmark N13): a real, keyboard-first jump list built on the Neon UI dialog.
 * ⌘K / Ctrl+K toggles · type to filter · ↑/↓ to move · ↵ to run · Esc or backdrop to close.
 */
type Command = { id: string; group: string; label: string; hint?: string; run: () => void }

export type PaletteAccess = { signedIn: boolean }

export function useCommands({ signedIn }: PaletteAccess): Command[] {
  const router = useRouter()
  return useMemo(() => {
    const go = (href: string) => () => router.push(href)
    const open = (href: string) => () => window.open(href, '_blank', 'noopener,noreferrer')
    const commands: (Command | false)[] = [
      { id: 'home', group: 'Go to', label: 'Home', hint: '/', run: go('/') },
      signedIn && { id: 'dashboard', group: 'Go to', label: 'Dashboard', hint: '/dashboard', run: go('/dashboard') },
      !signedIn && { id: 'auth', group: 'Go to', label: 'Sign in or create an account', hint: '/auth', run: go('/auth') },
      signedIn && { id: 'keys', group: 'Your account', label: 'Create an API key', run: go('/dashboard?view=keys') },
      signedIn && { id: 'credits', group: 'Your account', label: 'Buy credits', run: go('/dashboard?view=billing') },
      signedIn && { id: 'topup', group: 'Your account', label: 'Auto top-up settings', run: go('/dashboard?view=auto-topup') },
      signedIn && { id: 'playground', group: 'Your account', label: 'Open the playground', run: go('/dashboard?view=playground') },
      signedIn && { id: 'requests', group: 'Your account', label: 'Recent requests', run: go('/dashboard?view=usage') },
      { id: 'github', group: 'Resources', label: 'Source on GitHub', hint: '↗', run: open(SITE.githubUrl) },
      { id: 'stripe-sync', group: 'Resources', label: 'Stripe real-time sync to Postgres', hint: '↗', run: open('https://docs.stripe.com/data/data-pipeline/real-time-sync-to-postgres') },
      { id: 'neon-functions', group: 'Resources', label: 'Neon Functions', hint: '↗', run: open('https://neon.com/docs/reference/neon-ts') },
      signedIn && { id: 'signout', group: 'Session', label: 'Sign out', run: () => void signOut() },
    ]
    return commands.filter((command): command is Command => Boolean(command))
  }, [router, signedIn])
}

export function CommandPalette({ open, onOpenChange, access }: { open: boolean; onOpenChange: (open: boolean) => void; access: PaletteAccess }) {
  const commands = useCommands(access)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? commands.filter((command) => `${command.group} ${command.label}`.toLowerCase().includes(needle)) : commands
  }, [commands, query])

  useEffect(() => setActive(0), [query, open])
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function run(command: Command | undefined) {
    if (!command) return
    onOpenChange(false)
    command.run()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[active])
    }
  }

  let lastGroup = ''
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={inputRef} className="top-[14vh] max-w-[560px] translate-y-0 gap-0 overflow-hidden rounded-[var(--radius-code)] p-0">
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        <div className="flex items-center gap-3 border-b px-4">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page or action…"
            aria-label="Search commands"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="label-mono rounded-[4px] border px-1.5 py-0.5 normal-case">esc</kbd>
        </div>
        <div ref={listRef} id="command-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
          {results.map((command, index) => {
            const header = command.group !== lastGroup ? (lastGroup = command.group) : null
            return (
              <div key={command.id}>
                {header && <p className="label-mono px-3 pt-3 pb-1.5">{header}</p>}
                <button
                  id={`command-${command.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm whitespace-nowrap text-(--color-ink-2)',
                    index === active && 'bg-(--color-accent-wash) text-(--color-ink)',
                  )}
                >
                  <span className="truncate">{command.label}</span>
                  {command.hint && <span className="font-mono text-xs text-muted-foreground">{command.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 border-t px-4 py-2.5">
          <span className="label-mono normal-case">↑ ↓ move</span>
          <span className="label-mono normal-case">↵ open</span>
          <span className="label-mono normal-case">esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground', className)} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4.75" />
      <path d="m10.5 10.5 3.25 3.25" strokeLinecap="round" />
    </svg>
  )
}
