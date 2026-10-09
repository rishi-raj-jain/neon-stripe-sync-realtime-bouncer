import { NeonLogo, StripeLogo } from '@/components/brand/logos'
import { CodeCard, Dim, Key } from '@/components/site/code-card'
import { Reveal } from '@/components/site/reveal'
import { TypeIn } from '@/components/site/type-in'
import { buttonVariants } from '@/components/ui/button'
import { getUser } from '@/lib/auth/server'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

/*
 * Hallmark · macrostructure: Split Studio · genre: modern-minimal · theme: Cobalt · design-system: design.md
 * Every claim sits beside its proof; the pairing alternates sides down the page, with one
 * graphite band as the page's single dark beat. All figures come from this app (no invented metrics).
 */

const primary = cn(buttonVariants(), 'h-10 rounded-[var(--radius-control)] px-4 text-[0.9375rem] whitespace-nowrap')

export default async function Home() {
  const user = await getUser()

  return (
    <div className="flex flex-col pb-(--space-2xl)">
      {/* Hero diptych: title + lede left, a real request/response right. */}
      <section className="page-frame grid items-center gap-(--space-xl) py-(--space-2xl) lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-(--space-2xl) lg:py-(--space-3xl)">
        <div className="flex min-w-0 flex-col gap-(--space-lg)">
          <h1 className="max-w-[14ch] text-(length:--text-display) leading-[1.02] tracking-[-0.035em]">Content moderation, billed per item.</h1>
          <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed">
            Send text, get back allow, review or block with a score per category. Customers prepay through Stripe, every request is a ledger row priced in SQL, and the balance is a view over synced charges. No webhooks
            anywhere.
          </p>
          <div className="flex flex-wrap items-center gap-x-(--space-lg) gap-y-(--space-sm)">
            <Link href={user ? '/dashboard' : '/auth'} className={primary}>
              {user ? 'Open your dashboard' : 'Get an API key'}
            </Link>
            <a href="#billing" className="link-type text-[0.9375rem] whitespace-nowrap">
              How billing works
            </a>
          </div>
        </div>

        <Reveal className="flex min-w-0 flex-col gap-(--space-sm)">
          <CodeCard label="request">
            <Key>POST</Key> <TypeIn text="/v1/moderate" />
            {'\n'}
            <Dim>Authorization: Bearer bnc_••••••••</Dim>
            {'\n\n'}
            {'{ '}
            <Key>&quot;input&quot;</Key>: [{'\n    '}&quot;Great write-up, thanks!&quot;,{'\n    '}&quot;You are an idiot.&quot; ] {'}'}
          </CodeCard>
          <CodeCard label="response · x-bouncer-units: 2" status="200 OK">
            <Key>&quot;results&quot;</Key>: [{'\n  '}
            {'{ '}
            <Key>&quot;verdict&quot;</Key>: &quot;allow&quot;, <Key>&quot;flagged&quot;</Key>: [] {'}'},{'\n  '}
            {'{ '}
            <Key>&quot;verdict&quot;</Key>: &quot;block&quot;, <Key>&quot;flagged&quot;</Key>: [&quot;harassment&quot;],{'\n    '}
            <Key>&quot;reason&quot;</Key>: &quot;Harassing insult.&quot; {'}'} ],{'\n'}
            <Key>&quot;usage&quot;</Key>: {'{ '}
            <Key>&quot;items&quot;</Key>: 2, <Key>&quot;charge_usd&quot;</Key>: 0.002 {'}'}
            {'\n'}
            <Dim>{'// 2 items, $0.001 each, whatever it took to score them'}</Dim>
          </CodeCard>
        </Reveal>
      </section>

      {/* Proof left, claim right. */}
      <section id="billing" className="page-frame grid scroll-mt-20 items-center gap-(--space-xl) border-t py-(--space-2xl) lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-(--space-2xl)">
        <Reveal className="order-2 min-w-0 lg:order-1">
          <CodeCard label="drizzle/0001_pricing_functions_and_views.sql">
            <Key>create view</Key> app.balances <Key>as</Key>
            {'\n  '}
            <Key>with</Key> purchased <Key>as</Key> (<Dim>{'-- synced Stripe charges'}</Dim>
            {'\n    '}
            <Key>select</Key> sum((amount - amount_refunded) * 10000)
            {'\n      '}
            <Key>from</Key> stripe.charges <Key>where</Key> status = &apos;succeeded&apos;
            {'\n       '}
            <Key>and</Key> paid <Key>and not</Key> disputed),
            {'\n  '}
            spent <Key>as</Key> (<Dim>{'-- the usage ledger'}</Dim>
            {'\n    '}
            <Key>select</Key> sum(price_micros) <Key>from</Key> app.usage_events)
            {'\n  '}
            <Key>select</Key> purchased - spent <Key>as</Key> balance_micros …
          </CodeCard>
        </Reveal>
        <Reveal delay={80} className="order-1 flex min-w-0 flex-col gap-(--space-md) lg:order-2">
          <h2 className="max-w-[18ch] text-(length:--text-display-s) leading-[1.05]">The balance is a view, not a number.</h2>
          <p className="max-w-[48ch] leading-relaxed">
            Purchases are Stripe charges, synced into Postgres within seconds and pro-rated for refunds. Spend is the usage ledger. Nothing ever increments a balance, so a refund in the Stripe Dashboard lowers it on the
            next request and nothing can be counted twice.
          </p>
        </Reveal>
      </section>

      {/* The page's one dark beat: both directions of money, no webhooks. */}
      <section className="border-y bg-(--color-band) text-(--color-graphite-ink)">
        <div className="page-frame grid gap-(--space-xl) py-(--space-3xl) lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-(--space-2xl)">
          <Reveal className="flex min-w-0 flex-col gap-(--space-md)">
            <h2 className="max-w-[16ch] text-(length:--text-display-s) leading-[1.05] text-(--color-graphite-ink)">No webhooks, in either direction.</h2>
            <p className="max-w-[40ch] leading-relaxed text-(--color-graphite-muted)">Writes go to Stripe&apos;s API. Reads come from Postgres. The Stripe Data Pipeline is the only thing in between.</p>
          </Reveal>
          <Reveal delay={80} className="flex min-w-0 flex-col">
            {[
              {
                by: 'stripe',
                title: 'Money in',
                steps: ['Stripe Checkout completes the order', 'the order syncs into Postgres in seconds', 'app.balances counts it'],
              },
              {
                by: 'neon',
                title: 'Auto top-up',
                steps: ['a cron Neon Function finds low balances', 'creates a Stripe invoice for the top-up', 'the invoice syncs back; the balance counts it'],
              },
              {
                by: 'neon',
                title: 'Money out',
                steps: ['the api function scores every item in one AI Gateway call', 'checks the result, then writes one ledger row', 'priced per item in SQL by app.price_micros()'],
              },
            ].map((flow) => (
              <div key={flow.title} className="grid gap-(--space-sm) border-t border-(--color-graphite-rule) py-(--space-lg) sm:grid-cols-[9rem_minmax(0,1fr)]">
                <p className="flex items-center gap-2 font-heading font-bold text-(--color-graphite-ink)">
                  {flow.by === 'stripe' ? <StripeLogo className="size-4" /> : <NeonLogo className="size-4 text-neon" />}
                  {flow.title}
                </p>
                <ol className="flex flex-col gap-1.5 font-mono text-[0.8125rem] text-(--color-graphite-muted)">
                  {flow.steps.map((step, index) => (
                    <li key={step} className="flex gap-2">
                      <span className="text-(--color-signal-on-dark)">{index === 0 ? '→' : '↳'}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </div>
  )
}
