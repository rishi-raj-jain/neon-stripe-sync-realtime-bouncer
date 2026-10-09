'use server'

import { env } from '@/env'
import { auth } from '@/lib/auth/server'
import { usernameToEmail } from '@/lib/auth/username'
import { redirect } from 'next/navigation'
import * as v from 'valibot'

export type AuthResult = { error: string; field?: 'name' | 'email' | 'password' }

// Usernames map to placeholder emails for Neon Auth; see lib/auth/username.ts.
const toEmail = usernameToEmail

const Username = v.pipe(v.string(), v.trim(), v.regex(/^[a-zA-Z0-9_.-]{3,30}$/, '3–30 letters, numbers, ".", "_" or "-".'))
const Password = v.pipe(v.string(), v.minLength(8, 'At least 8 characters.'), v.maxLength(128, 'At most 128 characters.'))
const SignIn = v.object({ username: Username, password: Password })
const SignUp = v.object({ ...SignIn.entries, name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Add your name.'), v.maxLength(80)) })

type UpstreamError = { message?: string; code?: string; status?: number } | null | undefined

function friendly(error: UpstreamError, mode: 'sign-in' | 'sign-up'): AuthResult {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  if (code === 'USER_ALREADY_EXISTS' || /already exists/i.test(message)) return { error: 'That username is taken.', field: 'email' }
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || /invalid (email|password)/i.test(message)) return { error: 'Wrong username or password.', field: 'password' }
  if (code === 'PASSWORD_TOO_SHORT') return { error: 'At least 8 characters.', field: 'password' }
  return { error: message || (mode === 'sign-up' ? "Couldn't create your account. Try again." : "Couldn't sign you in. Try again.") }
}

function invalid(issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]): AuthResult {
  const first = issues[0]
  const key = first.path?.[0]?.key
  const field = key === 'username' ? 'email' : key === 'password' ? 'password' : key === 'name' ? 'name' : undefined
  return { error: first.message, field }
}

export async function signUpWithUsername(input: { name?: string; username: string; password: string }): Promise<AuthResult> {
  const parsed = v.safeParse(SignUp, input)
  if (!parsed.success) return invalid(parsed.issues)

  const { name, username, password } = parsed.output
  const { error } = await auth.signUp.email({ name, email: toEmail(username), password })
  if (error) return friendly(error, 'sign-up')
  redirect('/dashboard')
}

export async function signInWithUsername(input: { username: string; password: string }): Promise<AuthResult> {
  const parsed = v.safeParse(SignIn, input)
  if (!parsed.success) return invalid(parsed.issues)

  const { username, password } = parsed.output
  const { error } = await auth.signIn.email({ email: toEmail(username), password })
  if (error) return friendly(error, 'sign-in')
  redirect('/dashboard')
}

/**
 * "Try the demo account": one shared login whose password never leaves the server.
 * Created on first use, signed into every time after.
 */
export async function signInAsDemo(): Promise<AuthResult> {
  if (!env.DEMO_PASSWORD) return { error: 'The demo account is not configured (set DEMO_PASSWORD).' }
  const email = toEmail(env.DEMO_USERNAME)

  const signIn = await auth.signIn.email({ email, password: env.DEMO_PASSWORD })
  if (!signIn.error) redirect('/dashboard')

  const signUp = await auth.signUp.email({ name: env.DEMO_USERNAME, email, password: env.DEMO_PASSWORD })
  if (signUp.error) return { error: 'The demo account is unavailable right now.' }
  redirect('/dashboard')
}

export async function signOut() {
  await auth.signOut()
  redirect('/')
}
