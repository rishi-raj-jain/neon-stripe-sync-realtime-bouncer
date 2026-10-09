'use client'

import { signOut } from '@/app/auth/actions'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ChartLine, ChevronDown, Code, CreditCard, KeyRound, LayoutGrid, LogOut, MessageSquare, PanelLeftClose, PanelLeftOpen, Plug, RefreshCw, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The dashboard's views, one per sidebar item (?view=…). Laid out after the Neon Console: a few
 * top-level pages, then one expandable group.
 */
export const VIEWS = {
  overview: { label: 'Overview', icon: LayoutGrid, description: 'Balance, spend and requests at a glance.' },
  usage: { label: 'Usage', icon: ChartLine, description: 'Every billed call and every simulated spend, newest first.' },
  billing: { label: 'Billing', icon: CreditCard, description: 'Credit packs and every purchase, synced from Stripe into Postgres.' },
  'auto-topup': { label: 'Auto top-up', icon: RefreshCw, description: 'Refill the balance automatically, or on demand, with a Stripe invoice.' },
  keys: { label: 'API keys', icon: KeyRound, description: 'Bearer keys for the API. Only a SHA-256 of each is stored.' },
  quickstart: { label: 'Quickstart', icon: Code, description: 'Call the API from curl, Node or Python.' },
  playground: { label: 'Playground', icon: MessageSquare, description: 'Call your API from the browser, metered like any customer.' },
} satisfies Record<string, { label: string; icon: LucideIcon; description: string }>

export type View = keyof typeof VIEWS

export const isView = (value: string | null): value is View => value !== null && value in VIEWS

const TOP: View[] = ['overview', 'usage', 'billing', 'auto-topup']
const API: View[] = ['keys', 'quickstart', 'playground']

const COLLAPSED_KEY = 'tollbooth:sidebar-collapsed'

/** Desktop and tablet: a sticky sidebar. Tablet always shows the icon rail; desktop can collapse to it. */
export function DashboardSidebar({ view, onNavigate, name, balance }: { view: View; onNavigate: (view: View) => void; name: string; balance: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [wide, setWide] = useState(true)
  const [apiOpen, setApiOpen] = useState(true)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
    } catch {}
    const query = window.matchMedia('(min-width: 64rem)')
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  function toggle() {
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, current ? '0' : '1')
      } catch {}
      return !current
    })
  }

  // Icon rail: always on tablets, on desktop when collapsed.
  const rail = collapsed || !wide
  const label = rail ? 'sr-only' : ''

  return (
    <TooltipProvider>
      <aside className={cn('sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r md:flex', rail ? 'w-16' : 'w-64')}>
        <div className="flex flex-col gap-3 p-3">
          {!rail && (
            <div className="flex flex-col gap-0.5 rounded-(--radius-control) border px-3 py-2">
              <span className="text-xs text-muted-foreground">Your API</span>
              <span className="truncate text-sm font-medium text-(--color-ink)">{name}</span>
            </div>
          )}
          <NavButton rail={rail} label="Balance" onClick={() => onNavigate('billing')} className="border border-primary/35 bg-primary/10 text-primary hover:bg-primary/15">
            <CreditCard />
            {rail ? <span className="sr-only">Balance</span> : balance}
          </NavButton>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3" aria-label="Dashboard">
          {TOP.map((id) => (
            <NavItem key={id} id={id} view={view} rail={rail} label={label} onNavigate={onNavigate} />
          ))}
          <div className="my-2 border-t" />
          {/* The rail shows the group's items directly; a toggle there would hide nothing useful. */}
          {!rail && (
            <NavButton rail={false} label="API" onClick={() => setApiOpen((open) => !open)} aria-expanded={apiOpen} className="text-muted-foreground hover:text-(--color-ink)">
              <Plug />
              <span className="flex-1 text-left">API</span>
              <ChevronDown className={cn('size-4 transition-transform duration-(--dur-micro)', !apiOpen && '-rotate-90')} />
            </NavButton>
          )}
          {(apiOpen || rail) && (
            <div className={cn('flex flex-col gap-0.5', !rail && 'pl-4')}>
              {API.map((id) => (
                <NavItem key={id} id={id} view={view} rail={rail} label={label} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </nav>

        <div className="flex flex-col gap-0.5 border-t p-3">
          <form action={signOut}>
            <NavButton rail={rail} label="Sign out" type="submit" className="text-muted-foreground hover:text-(--color-ink)">
              <LogOut />
              <span className={label}>Sign out</span>
            </NavButton>
          </form>
          {wide && (
            <NavButton rail={rail} label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={toggle} className="text-muted-foreground hover:text-(--color-ink)">
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              <span className={label}>{collapsed ? 'Expand menu' : 'Collapse menu'}</span>
            </NavButton>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}

function NavItem({ id, view, rail, label, onNavigate }: { id: View; view: View; rail: boolean; label: string; onNavigate: (view: View) => void }) {
  const { label: text, icon: Icon } = VIEWS[id]
  const active = id === view
  return (
    <NavButton
      rail={rail}
      label={text}
      onClick={() => onNavigate(id)}
      aria-current={active ? 'page' : undefined}
      className={active ? 'bg-(--color-paper-2) font-medium text-(--color-ink)' : 'text-muted-foreground hover:bg-(--color-paper-2)/60 hover:text-(--color-ink)'}
    >
      <Icon />
      <span className={label}>{text}</span>
    </NavButton>
  )
}

/** A sidebar row; in the icon rail it gets a tooltip with its label. */
function NavButton({ rail, label, className, children, ...props }: { rail: boolean; label: string } & React.ComponentProps<'button'>) {
  const classes = cn(
    'flex h-9 w-full items-center gap-3 rounded-(--radius-control) px-2.5 text-sm transition-colors duration-(--dur-micro) outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
    rail && 'justify-center px-0',
    className,
  )
  const button = (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  )
  if (!rail) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Phones: the same views as a sticky, scrollable strip under the site nav. */
export function MobileNav({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const strip = useRef<HTMLElement>(null)

  // Keep the current view's tab in sight (e.g. opened straight to ?view=playground).
  useEffect(() => {
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [view])

  return (
    <nav ref={strip} className="sticky top-14 z-10 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b bg-(--color-paper)/92 px-(--space-md) py-2 backdrop-blur-sm md:hidden" aria-label="Dashboard">
      {[...TOP, ...API].map((id) => {
        const { label, icon: Icon } = VIEWS[id]
        const active = id === view
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-control) px-2.5 text-sm whitespace-nowrap [&_svg]:size-3.5',
              active ? 'bg-(--color-paper-2) font-medium text-(--color-ink)' : 'text-muted-foreground',
            )}
          >
            <Icon />
            {label}
          </button>
        )
      })}
      <form action={signOut} className="ml-auto shrink-0 border-l pl-1">
        <button type="submit" className="flex h-8 items-center gap-1.5 rounded-(--radius-control) px-2.5 text-sm whitespace-nowrap text-muted-foreground [&_svg]:size-3.5">
          <LogOut />
          Sign out
        </button>
      </form>
    </nav>
  )
}
