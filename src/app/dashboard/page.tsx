import { signOut } from '@/app/auth/actions'
import { Dashboard } from '@/app/dashboard/dashboard'
import { Button } from '@/components/ui/button'
import { env } from '@/env'
import { ensureAccount } from '@/lib/accounts'
import { getUser } from '@/lib/auth/server'
import { getDashboard } from '@/lib/billing'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Server-rendered with all its data (one batched query), so the browser fetches nothing on load. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await getUser()
  if (!user) redirect('/auth')
  const [{ checkout }, account] = await Promise.all([searchParams, ensureAccount(user)])
  const initial = await getDashboard(account)

  return (
    <div className="page-frame flex flex-col gap-(--space-xl) py-(--space-xl)">
      {/* Hallmark · macrostructure: Workbench (app) · theme: Cobalt · design-system: design.md · designed-as-app */}
      <div className="flex items-end justify-between gap-4 border-b pb-(--space-lg)">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[1.75rem] leading-tight">Your API</h1>
          <p className="text-sm text-muted-foreground">
            Keys, credits and usage for <span className="font-medium text-(--color-ink)">{user.name || 'you'}</span>.
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
      <Dashboard initial={initial} apiBaseUrl={(env.API_BASE_URL ?? '').replace(/\/+$/, '')} returnedFromCheckout={checkout === 'success'} />
    </div>
  )
}
