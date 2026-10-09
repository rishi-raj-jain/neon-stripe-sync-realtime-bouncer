import { AppLogo, NeonLogo, StripeLogo } from '@/components/brand/logos'
import { SiteNav } from '@/components/site/site-nav'
import { env } from '@/env'
import { getUser } from '@/lib/auth/server'
import { SITE } from '@/shared/site'
import type { Metadata } from 'next'
import { Google_Sans, Google_Sans_Code } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

// Google Sans everywhere (design.md): headings and body, with Google Sans Code for code, labels
// and figures. Exposed as CSS variables that tokens.css reads. next/font has no fallback
// metrics for these yet, so the system fallback is named explicitly.
const sans = Google_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-google-sans', display: 'swap', adjustFontFallback: false, fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'] })
const code = Google_Sans_Code({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-google-sans-code', display: 'swap', adjustFontFallback: false, fallback: ['ui-monospace', 'monospace'] })

// The social card is the pre-rendered src/app/opengraph-image.png (npm run og), which Next
// serves as og:image by file convention. X falls back to it for twitter:image.
// The header reads the session (the Dashboard link), so nothing here is static.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: SITE.name,
  description: 'Sell an LLM API, metered per token: Neon Functions, AI Gateway and Stripe synced to Postgres, with no webhooks.',
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  const access = { signedIn: Boolean(user) }

  return (
    <html lang="en" className={`dark ${sans.variable} ${code.variable}`}>
      <body className="flex min-h-screen flex-col">
        <SiteNav access={access} />
        {/* Pages own their width (.page-frame), so a section can run full-bleed without 100vw. */}
        <main className="w-full flex-1">{children}</main>
        {/* Hallmark Ft5 · Statement: one closing sentence, the meta row muted beneath it. */}
        <footer className="border-t">
          <div className="page-frame flex flex-col gap-(--space-xl) pt-(--space-2xl) pb-(--space-lg)">
            <p className="max-w-[28ch] font-heading text-[clamp(1.75rem,2.5vw+1rem,2.75rem)] leading-[1.08] font-bold tracking-[-0.03em] text-(--color-ink)">Every token metered. Every balance a view.</p>
            <div className="flex flex-col gap-3 border-t pt-(--space-md) text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
              <span className="flex items-center gap-2 font-heading font-bold whitespace-nowrap text-(--color-ink)">
                <AppLogo className="size-4" />
                {SITE.name}
              </span>
              <a href="https://neon.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 whitespace-nowrap hover:text-(--color-ink)">
                <NeonLogo className="size-3.5 text-neon" title="Neon" />
                Built on Neon
              </a>
              <a href="https://stripe.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 whitespace-nowrap hover:text-(--color-ink)">
                <StripeLogo className="size-3.5" title="Stripe" />
                Payments by Stripe
              </a>
              <span className="whitespace-nowrap sm:ml-auto">
                Built by{' '}
                <a href="https://rishi.app" target="_blank" rel="noreferrer" className="link-type">
                  Rishi
                </a>
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
