import { Dashboard } from '@/app/dashboard/dashboard'
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

  // The page is the app shell: sidebar + one view at a time (dashboard.tsx, sidebar.tsx).
  return <Dashboard initial={initial} apiBaseUrl={(env.API_BASE_URL ?? '').replace(/\/+$/, '')} returnedFromCheckout={checkout === 'success'} name={user.name || 'you'} />
}
