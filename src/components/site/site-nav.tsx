'use client'

import { AppLogo, GitHubIcon } from '@/components/brand/logos'
import { CommandPalette, SearchIcon, type PaletteAccess } from '@/components/command-palette/command-palette'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SITE } from '@/shared/site'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Hallmark N13 in the Cobalt voice: a flush, hairline-bordered bar. Wordmark and the app's
 * real destinations on the left; a bordered ⌘K search affordance, GitHub and the one cobalt
 * button on the right. The ⌘K opens a working command palette.
 */
export function SiteNav({ access }: { access: PaletteAccess }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const links = [access.signedIn && { href: '/dashboard', label: 'Dashboard' }].filter((link): link is { href: string; label: string } => Boolean(link))

  return (
    <header className="sticky top-0 z-(--z-sticky) border-b bg-(--color-paper)/92 backdrop-blur-sm">
      {/* The dashboard is a full-width app shell, so its bar lines the wordmark up with the sidebar. */}
      <div className={cn('flex h-14 items-center gap-4 sm:gap-6', pathname.startsWith('/dashboard') ? 'w-full px-(--space-md) sm:px-(--space-lg) md:px-[1.375rem]' : 'page-frame')}>
        <Link href="/" className="flex shrink-0 items-center gap-2 font-heading text-[1.0625rem] font-bold tracking-tight whitespace-nowrap text-(--color-ink)">
          <AppLogo className="size-6" />
          {SITE.name}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-5 md:flex">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-(--dur-short) hover:text-(--color-ink)',
                  active && 'text-(--color-ink) after:absolute after:inset-x-0 after:-bottom-[17px] after:h-0.5 after:bg-primary',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Jump to (⌘K)"
            className="flex h-9 items-center gap-2.5 rounded-[var(--radius-control)] border bg-(--color-paper-2) px-2.5 text-sm text-muted-foreground transition-colors duration-(--dur-short) hover:border-(--color-rule-2) sm:w-56 sm:pr-1.5"
          >
            <SearchIcon />
            <span className="hidden flex-1 text-left whitespace-nowrap sm:inline">Jump to…</span>
            <kbd className="hidden rounded-[4px] border bg-card px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline">⌘K</kbd>
          </button>
          <a href={SITE.githubUrl} target="_blank" rel="noreferrer" aria-label="Source on GitHub" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'hidden sm:inline-flex')}>
            <GitHubIcon className="size-4" />
          </a>
          {access.signedIn ? (
            <Link href="/dashboard?view=billing" className={cn(buttonVariants({ size: 'sm' }), 'h-9 rounded-[var(--radius-control)] px-3 whitespace-nowrap')}>
              Buy credits
            </Link>
          ) : (
            <Link href="/auth" className={cn(buttonVariants({ size: 'sm' }), 'h-9 rounded-[var(--radius-control)] px-3 whitespace-nowrap')}>
              Get an API key
            </Link>
          )}
        </div>
      </div>
      <CommandPalette open={open} onOpenChange={setOpen} access={access} />
    </header>
  )
}
