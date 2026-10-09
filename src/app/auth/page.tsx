import { getUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { AuthPanel } from '@/app/auth/auth-panel'

export const dynamic = 'force-dynamic'

export default async function AuthPage() {
  if (await getUser()) redirect('/dashboard')
  return <AuthPanel />
}
