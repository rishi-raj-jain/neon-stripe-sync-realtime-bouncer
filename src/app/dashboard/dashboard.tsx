'use client'

import { ActivityFeed, type ActivityEntry } from '@/components/activity-feed/activity-feed'
import { ApiKeyList, type ApiKey } from '@/components/api-key-list/api-key-list'
import { ConsumptionChart } from '@/components/consumption-chart/consumption-chart'
import { LogsViewer } from '@/components/logs-viewer/logs-viewer'
import { MetricCard } from '@/components/metric-card/metric-card'
import { CodeCard } from '@/components/site/code-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UpgradeDialog } from '@/components/upgrade-dialog/upgrade-dialog'
import type { Dashboard as DashboardData } from '@/lib/billing'
import { cents, money } from '@/lib/format'
import {
  CREDIT_PACKS,
  MAX_CHARS_PER_ITEM,
  MAX_ITEMS_PER_REQUEST,
  MODERATION_CATEGORIES,
  TOPUP_AMOUNTS_CENTS,
  TOPUP_THRESHOLDS_CENTS,
  unitsFor,
  usd,
  type ModerationCategory,
  type ModerationVerdict,
  type PackId,
} from '@/shared/pricing'
import { DashboardSidebar, isView, MobileNav, VIEWS, type View } from '@/app/dashboard/sidebar'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

const LAST_KEY = 'bouncer:last-key'
const BASELINE_KEY = 'bouncer:purchased-before-checkout'
/** Orders sync as Checkout Session creates, which can lag up to 10 minutes during the preview. */
const SYNC_PATIENCE_MS = 10 * 60_000

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (response.status === 204) return undefined as T
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`)
  return body as T
}

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function Dashboard({ initial, apiBaseUrl, returnedFromCheckout, name }: { initial: DashboardData; apiBaseUrl: string; returnedFromCheckout: boolean; name: string }) {
  const [data, setData] = useState(initial)
  const searchParams = useSearchParams()
  const requested = searchParams.get('view')
  const view: View = isView(requested) ? requested : 'overview'

  // Views are client-side: pushState keeps them in the URL (and the back button) without a reload.
  const navigate = useCallback((next: View) => {
    window.history.pushState(null, '', next === 'overview' ? '/dashboard' : `/dashboard?view=${next}`)
    window.scrollTo({ top: 0 })
  }, [])
  const [awaitingPayment, setAwaitingPayment] = useState(returnedFromCheckout)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const next = await api<DashboardData>('/api/account')
    setData(next)
    return next
  }, [])

  // Back from Checkout: no webhook to wait on. Poll the balance view until the synced charge lands.
  useEffect(() => {
    if (!awaitingPayment) return
    const baseline = Number(sessionStorage.getItem(BASELINE_KEY) ?? 0)
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      const next = await refresh().catch(() => null)
      if ((next && next.wallet.purchasedMicros > baseline) || Date.now() - startedAt > SYNC_PATIENCE_MS) {
        clearInterval(timer)
        sessionStorage.removeItem(BASELINE_KEY)
        setAwaitingPayment(false)
        window.history.replaceState(null, '', '/dashboard?view=billing')
      }
    }, 2_500)
    return () => clearInterval(timer)
  }, [awaitingPayment, refresh])

  const itemTrend = useMemo(() => data.usage.daily.map((day) => ({ label: day.day.slice(5), value: day.units })), [data.usage.daily])
  const spent30d = data.usage.daily.reduce((total, day) => total + day.spentMicros + day.simulatedMicros, 0)
  const simulated30d = data.usage.daily.reduce((total, day) => total + day.simulatedMicros, 0)

  const balance = (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
      <span className="text-sm">Balance</span>
      <span className="truncate font-mono text-sm tabular-nums">{awaitingPayment ? 'syncing…' : money(data.wallet.balanceMicros)}</span>
    </span>
  )
  const balanceCard = (
    <MetricCard
      label="Balance"
      value={usd(data.wallet.balanceMicros)}
      format="currency"
      comparisonLabel={awaitingPayment ? 'waiting for your payment to sync…' : `${money(data.wallet.purchasedMicros)} bought · ${money(data.wallet.spentMicros)} used`}
    />
  )

  return (
    <div className="flex w-full">
      <DashboardSidebar view={view} onNavigate={navigate} name={name} balance={balance} />
      <div className="min-w-0 flex-1">
        <MobileNav view={view} onNavigate={navigate} />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-(--space-md) py-(--space-xl) sm:px-(--space-lg)">
          {/* Hallmark · macrostructure: Workbench (app) · theme: Cobalt · design-system: design.md · designed-as-app */}
          <header className="flex items-end justify-between gap-4 border-b pb-(--space-lg)">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-xs text-muted-foreground">
                Your account <span aria-hidden>/</span> {name}
              </p>
              <h1 className="text-[1.75rem] leading-tight">{VIEWS[view].label}</h1>
              <p className="text-sm text-muted-foreground">{VIEWS[view].description}</p>
            </div>
            <button type="button" onClick={() => navigate('billing')} className="shrink-0 rounded-(--radius-control) border px-2.5 py-1 font-mono text-xs tabular-nums md:hidden">
              {money(data.wallet.balanceMicros)}
            </button>
          </header>

          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          {view === 'overview' && (
            <>
              {/* Phones: balance full width, the two 30-day figures side by side; tablet and up: one row. */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 [&>*]:min-h-[120px] md:[&>*]:min-h-[168px] [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1">
                {balanceCard}
                <MetricCard label="30-day spend" value={usd(spent30d)} format="currency" comparisonLabel={simulated30d > 0 ? `incl. ${money(simulated30d)} simulated` : 'from the usage ledger'} />
                <MetricCard label="30-day items checked" value={data.usage.daily.reduce((total, day) => total + day.units, 0)} trend={itemTrend.length > 1 ? itemTrend : undefined} />
              </div>
              <SpendChart data={data} />
            </>
          )}
          {view === 'usage' && <Recent data={data} />}
          {view === 'billing' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
              <Credits data={data} onError={setError} />
              <Purchases data={data} />
            </div>
          )}
          {view === 'auto-topup' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
              <AutoTopup data={data} onSaved={refresh} onError={setError} />
              <div className="flex flex-col gap-6 [&>*:first-child]:min-h-[140px]">
                {balanceCard}
                <Purchases data={data} />
              </div>
            </div>
          )}
          {view === 'keys' && <Keys data={data} onChange={refresh} onError={setError} />}
          {view === 'quickstart' && <Quickstart apiBaseUrl={apiBaseUrl} />}
          {view === 'playground' && <Playground apiBaseUrl={apiBaseUrl} limit={data.limit} unitPriceMicros={data.pricing.unitPriceMicros} onCalled={() => refresh().catch(() => {})} />}
        </div>
      </div>
    </div>
  )
}

function Credits({ data, onError }: { data: DashboardData; onError: (message: string | null) => void }) {
  const [selected, setSelected] = useState<PackId | null>(null)
  const [pending, setPending] = useState(false)

  async function buy(pack: PackId) {
    onError(null)
    setPending(true)
    try {
      sessionStorage.setItem(BASELINE_KEY, String(data.wallet.purchasedMicros))
      const { url } = await api<{ url: string }>('/api/checkout', { method: 'POST', body: JSON.stringify({ pack }) })
      window.location.assign(url)
    } catch (e) {
      onError((e as Error).message)
      setPending(false)
    }
  }

  const pack = selected ? CREDIT_PACKS[selected] : null
  return (
    <Card id="credits" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Credits</CardTitle>
        <CardDescription>Prepaid, in dollars, through Stripe Checkout. Credits land a few seconds after checkout, synced from Stripe into Postgres.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CREDIT_PACKS) as PackId[]).map((id) => (
            <Button key={id} variant="outline" className="h-auto flex-col gap-0.5 py-3" onClick={() => setSelected(id)}>
              <span className="text-lg font-semibold tabular-nums">{cents(CREDIT_PACKS[id].cents)}</span>
              <span className="text-xs text-muted-foreground">{CREDIT_PACKS[id].label}</span>
            </Button>
          ))}
        </div>
        {data.card && (
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Card on file</span>
            <span className="font-medium">{`${data.card.brand.toUpperCase()} •••• ${data.card.last4}`}</span>
          </div>
        )}
      </CardContent>
      {pack && (
        <UpgradeDialog
          open={selected !== null}
          onOpenChange={(open) => !open && !pending && setSelected(null)}
          onUpgrade={() => selected && buy(selected)}
          isProcessing={pending}
          title={`${pack.label} credits`}
          description="Paid with Stripe Checkout. Credits show up a few seconds later, synced from Stripe into Postgres."
          plan={{
            name: pack.label,
            price: pack.cents / 100,
            period: 'one-time',
            features: [
              `${cents(pack.cents)} of moderation credit`,
              data.pricing.unitPriceMicros > 0
                ? `About ${Math.floor((pack.cents * 10_000) / data.pricing.unitPriceMicros).toLocaleString('en-US')} items at ${money(data.pricing.unitPriceMicros)} each`
                : 'Billed per item checked',
              'Works with auto top-up',
              'Never expires',
            ],
            action: 'Continue to Checkout',
            working: 'Opening Checkout…',
          }}
        />
      )}
    </Card>
  )
}

/** Spend per day from the usage ledger (Neon UI consumption chart). */
function SpendChart({ data }: { data: DashboardData }) {
  const points = data.usage.daily.map((day) => ({ label: day.day.slice(5), values: { spend: usd(day.spentMicros), simulated: usd(day.simulatedMicros) } }))
  const hasSimulated = data.usage.daily.some((day) => day.simulatedMicros > 0)
  return (
    <ConsumptionChart
      title="Spend per day"
      data={points}
      series={[{ id: 'spend', label: 'Moderation' }, ...(hasSimulated ? [{ id: 'simulated', label: 'Simulated' }] : [])]}
      stacked
      variant="bar"
      formatValue={(value) => money(value * 1_000_000)}
      meteredThrough="the usage ledger"
      empty={<p className="text-sm text-muted-foreground">No usage in the last 30 days yet.</p>}
    />
  )
}

/** Every way credits arrived (Checkout orders, auto top-ups), straight from the Stripe-synced tables. */
function Purchases({ data }: { data: DashboardData }) {
  const entries: ActivityEntry[] = data.purchases.map((purchase) => ({
    id: purchase.id,
    status: purchase.disputed ? 'error' : 'success',
    title: `${cents(purchase.amountCents)} ${purchase.auto ? 'auto top-up' : 'of credits'}`,
    timestamp: new Date(purchase.created * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    source: 'Stripe',
    detail: purchase.disputed ? 'Disputed: not counted' : purchase.refundedCents > 0 ? `Refunded ${cents(purchase.refundedCents)}` : undefined,
    actionLabel: purchase.receiptUrl ? 'Receipt' : undefined,
  }))
  const receipts = new Map(data.purchases.map((purchase) => [purchase.id, purchase.receiptUrl]))
  return (
    <ActivityFeed
      id="purchases"
      className="scroll-mt-20"
      label="Purchases and top-ups"
      entries={entries}
      onAction={(entry) => {
        const url = receipts.get(entry.id)
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      }}
      empty={<p className="text-sm text-muted-foreground">Buy a credit pack and it shows up here a few seconds later.</p>}
    />
  )
}

/** How long to keep watching for a top-up after simulated usage (the cron runs every 5 minutes) or a manual run. */
const TOPUP_WATCH_MS = 7 * 60_000

function AutoTopup({ data, onSaved, onError }: { data: DashboardData; onSaved: () => Promise<DashboardData>; onError: (message: string | null) => void }) {
  const [settings, setSettings] = useState({ enabled: data.autoTopup.enabled, thresholdCents: data.autoTopup.thresholdCents, amountCents: data.autoTopup.amountCents })
  const [saving, setSaving] = useState(false)
  const [simulating, setSimulating] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  // Set while waiting for a top-up to land: the purchased total to beat, when we started, and
  // whether it's the scheduled `topups` run or a manual one (invoice already created).
  const [watch, setWatch] = useState<{ baseline: number; since: number; manual: boolean } | null>(null)
  const [toppedUp, setToppedUp] = useState(false)

  const thresholdMicros = data.autoTopup.thresholdCents * 10_000
  const belowThreshold = data.wallet.balanceMicros < thresholdMicros

  // After simulated usage takes the balance under the threshold, poll until the top-up lands.
  useEffect(() => {
    if (!watch) return
    const timer = setInterval(async () => {
      const next = await onSaved().catch(() => null)
      if (next && next.wallet.purchasedMicros > watch.baseline) {
        setToppedUp(true)
        setWatch(null)
      } else if (Date.now() - watch.since > TOPUP_WATCH_MS) {
        setWatch(null)
      }
    }, 10_000)
    return () => clearInterval(timer)
  }, [watch, onSaved])

  async function simulate(key: string, body: object) {
    onError(null)
    setToppedUp(false)
    setSimulating(key)
    try {
      await api('/api/usage/simulate', { method: 'POST', body: JSON.stringify(body) })
      const next = await onSaved()
      if (next.autoTopup.enabled && next.wallet.balanceMicros < next.autoTopup.thresholdCents * 10_000) setWatch({ baseline: next.wallet.purchasedMicros, since: Date.now(), manual: false })
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSimulating(null)
    }
  }

  // "Top up now": the same top-up as the scheduled run, for this account, right away.
  async function runNow() {
    onError(null)
    setToppedUp(false)
    setRunning(true)
    const baseline = data.wallet.purchasedMicros
    try {
      await api('/api/account/auto-topup/run', { method: 'POST' })
      const next = await onSaved()
      if (next.wallet.purchasedMicros > baseline) setToppedUp(true)
      else setWatch({ baseline, since: Date.now(), manual: true })
    } catch (e) {
      onError((e as Error).message)
      await onSaved().catch(() => null)
    } finally {
      setRunning(false)
    }
  }

  const dirty = settings.enabled !== data.autoTopup.enabled || settings.thresholdCents !== data.autoTopup.thresholdCents || settings.amountCents !== data.autoTopup.amountCents

  async function save() {
    onError(null)
    setSaving(true)
    try {
      await api('/api/account/auto-topup', { method: 'PUT', body: JSON.stringify(settings) })
      const next = await onSaved()
      // Turned on while already under the threshold: the next cron run tops up, so watch for it.
      if (next.autoTopup.enabled && next.wallet.balanceMicros < next.autoTopup.thresholdCents * 10_000) setWatch({ baseline: next.wallet.purchasedMicros, since: Date.now(), manual: false })
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const thresholdItems = TOPUP_THRESHOLDS_CENTS.map((value) => ({ value: String(value), label: `Below ${cents(value)}` }))
  const amountItems = TOPUP_AMOUNTS_CENTS.map((value) => ({ value: String(value), label: `Add ${cents(value)}` }))

  return (
    <Card id="auto-topup" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Auto top-up</CardTitle>
        <CardDescription>Every 5 minutes a Neon Function checks your balance and adds credits through a Stripe invoice. No webhooks.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
          <span className="font-medium">Top up automatically</span>
          <Switch checked={settings.enabled} disabled={!data.autoTopup.available} onCheckedChange={(enabled) => setSettings((current) => ({ ...current, enabled }))} />
        </label>
        {!data.autoTopup.available && <p className="text-xs text-muted-foreground">Buy credits once to turn this on.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label>When balance is</Label>
            <Select items={thresholdItems} value={String(settings.thresholdCents)} onValueChange={(value) => value && setSettings((current) => ({ ...current, thresholdCents: Number(value) }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {thresholdItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Charge</Label>
            <Select items={amountItems} value={String(settings.amountCents)} onValueChange={(value) => value && setSettings((current) => ({ ...current, amountCents: Number(value) }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {amountItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {data.autoTopup.error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">Switched off: {data.autoTopup.error}</p>}
        <div className="flex flex-col gap-2.5 rounded-md border border-dashed px-3 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Try it without spending</span>
            <span className="text-xs text-muted-foreground">Simulated usage takes credits off your balance with no moderation behind it, so it costs nothing. It doesn&apos;t count toward the daily limit.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={simulating !== null || data.wallet.balanceMicros <= 0} onClick={() => simulate('1', { kind: 'amount', cents: 100 })}>
              {simulating === '1' ? 'Using…' : 'Use $1'}
            </Button>
            <Button size="sm" variant="outline" disabled={simulating !== null || data.wallet.balanceMicros <= 0} onClick={() => simulate('5', { kind: 'amount', cents: 500 })}>
              {simulating === '5' ? 'Using…' : 'Use $5'}
            </Button>
            <Button size="sm" variant="outline" disabled={simulating !== null || belowThreshold} onClick={() => simulate('below', { kind: 'below-threshold' })}>
              {simulating === 'below' ? 'Using…' : `Drop below ${cents(data.autoTopup.thresholdCents)}`}
            </Button>
          </div>
          {watch && !watch.manual && (
            <p className="text-xs text-(--color-ink-2)">
              Balance is under {cents(data.autoTopup.thresholdCents)}. The next run of the topups function (every 5 minutes) adds {cents(data.autoTopup.amountCents)}; watching for it, or top up now.
            </p>
          )}
          {watch?.manual && <p className="text-xs text-(--color-ink-2)">Invoice created in Stripe. Waiting for it to sync back into Neon…</p>}
          {!watch && belowThreshold && !data.autoTopup.enabled && data.wallet.balanceMicros >= 0 && (
            <p className="text-xs text-muted-foreground">Balance is under the threshold. Turn on auto top-up and save to see it refill, or top up now.</p>
          )}
          {toppedUp && <p className="text-xs text-primary">Topped up: the invoice synced from Stripe and the balance view counted it.</p>}
        </div>
        <div className="flex flex-col gap-2.5 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Run it now</span>
            <span className="text-xs text-muted-foreground">
              {belowThreshold ? 'Skip the 5-minute wait: the same top-up the function runs, for your account, right now.' : `Runs once your balance is under ${cents(data.autoTopup.thresholdCents)}.`}
            </span>
          </div>
          <Button size="sm" variant="outline" className="self-start sm:self-auto" disabled={!data.autoTopup.available || !belowThreshold || running || Boolean(watch?.manual)} onClick={runNow}>
            {running ? 'Topping up…' : `Top up ${cents(data.autoTopup.amountCents)} now`}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {data.autoTopup.recent[0] ? `Last: ${cents(data.autoTopup.recent[0].amountCents)} ${data.autoTopup.recent[0].status}, ${when(data.autoTopup.recent[0].createdAt)}` : 'No top-ups yet.'}
          </span>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Keys({ data, onChange, onError }: { data: DashboardData; onChange: () => Promise<unknown>; onError: (message: string | null) => void }) {
  const keys: ApiKey[] = data.keys.map((key) => ({
    id: key.id,
    name: `${key.name} · ${key.prefix}…`,
    scope: 'personal',
    createdAt: new Date(key.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    lastUsedAt: key.lastUsedAt ? when(key.lastUsedAt) : undefined,
  }))

  async function create(name: string) {
    onError(null)
    const { key } = await api<{ key: string }>('/api/keys', { method: 'POST', body: JSON.stringify({ name }) })
    // Kept for this tab only, so the Playground view can use it. The server never has it again.
    sessionStorage.setItem(LAST_KEY, key)
    window.dispatchEvent(new Event(LAST_KEY))
    await onChange()
    return key
  }

  async function revoke(key: ApiKey) {
    onError(null)
    await api(`/api/keys/${key.id}`, { method: 'DELETE' })
    await onChange()
  }

  return (
    <div id="keys" className="scroll-mt-20">
      <ApiKeyList label="API keys" keys={keys} onCreate={create} onRevoke={revoke} />
    </div>
  )
}

function Quickstart({ apiBaseUrl }: { apiBaseUrl: string }) {
  const base = apiBaseUrl || 'https://<your-api>'
  const snippets = {
    curl: `curl ${base}/v1/moderate \\
  -H "Authorization: Bearer $BOUNCER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": ["Great write-up, thanks!", "You are an idiot."]}'`,
    node: `const response = await fetch('${base}/v1/moderate', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${process.env.BOUNCER_API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: ['Great write-up, thanks!', 'You are an idiot.'] }),
})
const { results } = await response.json()
// results[i].verdict: 'allow' | 'review' | 'block'`,
    python: `import os, requests

response = requests.post(
    "${base}/v1/moderate",
    headers={"Authorization": f"Bearer {os.environ['BOUNCER_API_KEY']}"},
    json={"input": ["Great write-up, thanks!", "You are an idiot."]},
)
for result in response.json()["results"]:
    print(result["verdict"], result["flagged"])`,
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quickstart</CardTitle>
        <CardDescription>
          Send up to {MAX_ITEMS_PER_REQUEST} texts per request. Each comes back as allow, review or block, with a score per category and a short reason. You pay per item, and only for results that pass validation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:gap-3">
          <span className="shrink-0 text-muted-foreground">Endpoint</span>
          <code className="min-w-0 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{apiBaseUrl ? `POST ${apiBaseUrl}/v1/moderate` : 'Deploy the api function first (npx neon deploy)'}</code>
        </div>
        <Tabs defaultValue="curl" className="min-w-0">
          <TabsList>
            <TabsTrigger value="curl">curl</TabsTrigger>
            <TabsTrigger value="node">Node</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
          </TabsList>
          {(Object.keys(snippets) as (keyof typeof snippets)[]).map((key) => (
            <TabsContent key={key} value={key} className="min-w-0">
              <CodeCard label={key}>{snippets[key]}</CodeCard>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

type ModerationResult = { verdict: ModerationVerdict; flagged: ModerationCategory[]; scores: Record<ModerationCategory, number>; reason: string }
type PlaygroundResult = { items: string[]; results: ModerationResult[]; units: number; chargeUsd: string | null; ms: number }

const SAMPLE_ITEMS = ['Thanks for the detailed write-up, this fixed my build.', 'You are a complete idiot and everyone here is sick of you.', 'Earn $5,000 a week from home!!! DM me for the link'].join('\n')

const VERDICT_BADGE: Record<ModerationVerdict, 'outline' | 'secondary' | 'destructive'> = { allow: 'outline', review: 'secondary', block: 'destructive' }

function Playground({ apiBaseUrl, limit, unitPriceMicros, onCalled }: { apiBaseUrl: string; limit: DashboardData['limit']; unitPriceMicros: number; onCalled: () => void }) {
  const [key, setKey] = useState('')
  const [text, setText] = useState(SAMPLE_ITEMS)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const load = () => setKey((current) => current || sessionStorage.getItem(LAST_KEY) || '')
    load()
    window.addEventListener(LAST_KEY, load)
    return () => window.removeEventListener(LAST_KEY, load)
  }, [])

  // One item per non-empty line, the way the API counts them.
  const items = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const units = items.reduce((total, item) => total + unitsFor(item), 0)
  const invalid =
    items.length > MAX_ITEMS_PER_REQUEST
      ? `At most ${MAX_ITEMS_PER_REQUEST} items per request.`
      : items.some((item) => item.length > MAX_CHARS_PER_ITEM)
        ? `Each item can be at most ${MAX_CHARS_PER_ITEM} characters.`
        : null

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    const startedAt = performance.now()
    try {
      const response = await fetch(`${apiBaseUrl}/v1/moderate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: items }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`)
      setResult({ items, results: body.results ?? [], units: body.usage?.units ?? units, chargeUsd: response.headers.get('x-bouncer-charge-usd'), ms: Math.round(performance.now() - startedAt) })
      onCalled()
    } catch (e) {
      setFailure((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card id="playground" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Playground</CardTitle>
        <CardDescription>Moderates text from the browser with your key, like any customer would, and bills the same way: per item. This demo allows {limit.perDay} requests per account per day.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={send} className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="playground-key">API key</Label>
            <Input id="playground-key" type="password" placeholder="bnc_… (create one under API keys)" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="playground-items">Items, one per line</Label>
            <textarea
              id="playground-items"
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {invalid ? (
                <span className="text-destructive">{invalid}</span>
              ) : (
                <>
                  {items.length} {items.length === 1 ? 'item' : 'items'} · {units} {units === 1 ? 'unit' : 'units'}
                  {unitPriceMicros > 0 && <> · {money(units * unitPriceMicros)}</>}
                </>
              )}{' '}
              ·{' '}
              <span className={limit.remaining === 0 ? 'text-destructive' : undefined}>
                {limit.remaining} of {limit.perDay} requests left today
              </span>
              {limit.remaining === 0 && limit.nextSlotAt && (
                // Local time differs between server and browser; the browser's rendering wins.
                <span suppressHydrationWarning> · next at {new Date(limit.nextSlotAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              )}
            </span>
            <Button type="submit" className="w-full sm:w-auto" disabled={busy || !key.trim() || items.length === 0 || Boolean(invalid) || !apiBaseUrl || limit.remaining === 0}>
              {busy ? 'Checking…' : 'Check'}
            </Button>
          </div>
        </form>
        {failure && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{failure}</p>}
        {result && (
          <div className="mt-4 flex flex-col gap-3 border-t pt-4">
            <ul className="flex flex-col divide-y rounded-md border">
              {result.results.map((item, index) => {
                const top = MODERATION_CATEGORIES.reduce((best, category) => (item.scores[category] > item.scores[best] ? category : best), MODERATION_CATEGORIES[0])
                return (
                  <li key={index} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                    <Badge variant={VERDICT_BADGE[item.verdict]} className="w-16 shrink-0 uppercase">
                      {item.verdict}
                    </Badge>
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm break-words">{result.items[index]}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.flagged.length > 0
                          ? item.flagged.map((category) => `${category.replace('_', ' ')} ${item.scores[category].toFixed(2)}`).join(' · ')
                          : `highest: ${top.replace('_', ' ')} ${item.scores[top].toFixed(2)}`}
                        {item.reason && <> · {item.reason}</>}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{result.items.length} items</Badge>
              <Badge variant="outline">{result.units} units</Badge>
              {result.chargeUsd && <Badge>charged ${Number(result.chargeUsd).toFixed(6)}</Badge>}
              <Badge variant="secondary">{result.ms} ms</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The usage ledger, one line per request, in the Neon UI logs viewer. */
function Recent({ data }: { data: DashboardData }) {
  const lines = data.usage.recent
    .slice()
    .reverse()
    .map((event) => ({
      id: event.id,
      at: event.createdAt,
      timestamp: new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level: event.simulated ? ('warn' as const) : event.status >= 400 ? ('error' as const) : ('info' as const),
      source: event.service,
      message: event.simulated
        ? `simulated usage · ${money(event.priceMicros)} · no moderation behind it`
        : event.service !== 'moderate'
          ? `earlier API call · ${money(event.priceMicros)}`
          : event.status >= 400
            ? `scoring failed · not charged${event.latencyMs ? ` · ${event.latencyMs} ms` : ''}`
            : `${event.units} ${event.units === 1 ? 'unit' : 'units'} · ${money(event.priceMicros)}${event.latencyMs ? ` · ${event.latencyMs} ms` : ''}`,
    }))
  return (
    <div id="requests" className="min-w-0 scroll-mt-20">
      <LogsViewer title="Usage ledger" lines={lines} visibleRows={10} defaultFollow />
    </div>
  )
}
