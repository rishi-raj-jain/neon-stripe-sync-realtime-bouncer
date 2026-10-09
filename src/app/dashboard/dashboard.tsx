'use client'

import { ActivityFeed, type ActivityEntry } from '@/components/activity-feed/activity-feed'
import { ApiKeyList, type ApiKey } from '@/components/api-key-list/api-key-list'
import { ConsumptionChart } from '@/components/consumption-chart/consumption-chart'
import { LogsViewer } from '@/components/logs-viewer/logs-viewer'
import { MetricCard } from '@/components/metric-card/metric-card'
import { ModelSelect } from '@/components/model-select/model-select'
import { CodeCard } from '@/components/site/code-card'
import { ThinkingSelect, type ThinkingEffort } from '@/components/thinking-select/thinking-select'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Message, MessageGroup } from '@/components/ui/message'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UpgradeDialog } from '@/components/upgrade-dialog/upgrade-dialog'
import type { Dashboard as DashboardData } from '@/lib/billing'
import { cents, money } from '@/lib/format'
import { CREDIT_PACKS, DEFAULT_MODEL, TOPUP_AMOUNTS_CENTS, TOPUP_THRESHOLDS_CENTS, usd, type PackId } from '@/shared/pricing'
import { useCallback, useEffect, useMemo, useState } from 'react'

const LAST_KEY = 'tollbooth:last-key'
const BASELINE_KEY = 'tollbooth:purchased-before-checkout'
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

export function Dashboard({ initial, apiBaseUrl, returnedFromCheckout }: { initial: DashboardData; apiBaseUrl: string; returnedFromCheckout: boolean }) {
  const [data, setData] = useState(initial)
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
        window.history.replaceState(null, '', '/dashboard')
      }
    }, 2_500)
    return () => clearInterval(timer)
  }, [awaitingPayment, refresh])

  const requestTrend = useMemo(() => data.usage.daily.map((day) => ({ label: day.day.slice(5), value: day.requests })), [data.usage.daily])
  const spent30d = data.usage.daily.reduce((total, day) => total + day.spentMicros, 0)

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {/* Phones: balance full width, the two 30-day figures side by side; tablet and up: one row. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 [&>*]:min-h-[120px] md:[&>*]:min-h-[168px]">
        <MetricCard
          className="col-span-2 md:col-span-1"
          label="Balance"
          value={usd(data.wallet.balanceMicros)}
          format="currency"
          comparisonLabel={awaitingPayment ? 'waiting for your payment to sync…' : `${money(data.wallet.purchasedMicros)} bought · ${money(data.wallet.spentMicros)} used`}
        />
        <MetricCard label="30-day spend" value={usd(spent30d)} format="currency" comparisonLabel="from the usage ledger" />
        <MetricCard label="30-day requests" value={data.usage.daily.reduce((total, day) => total + day.requests, 0)} trend={requestTrend.length > 1 ? requestTrend : undefined} />
      </div>

      <SpendChart data={data} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Credits data={data} onError={setError} />
        <AutoTopup data={data} onSaved={refresh} onError={setError} />
      </div>
      <Purchases data={data} />

      <Keys data={data} onChange={refresh} onError={setError} />
      <Quickstart apiBaseUrl={apiBaseUrl} />
      <Playground apiBaseUrl={apiBaseUrl} limit={data.limit} onCalled={() => refresh().catch(() => {})} />
      <Recent data={data} />
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
            features: [`${cents(pack.cents)} of API credit`, `Billed per token on ${DEFAULT_MODEL}`, 'Works with auto top-up', 'Never expires'],
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
  const points = data.usage.daily.map((day) => ({ label: day.day.slice(5), values: { spend: usd(day.spentMicros) } }))
  return (
    <ConsumptionChart
      title="Spend per day"
      data={points}
      series={[{ id: 'spend', label: 'Spend' }]}
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

function AutoTopup({ data, onSaved, onError }: { data: DashboardData; onSaved: () => Promise<unknown>; onError: (message: string | null) => void }) {
  const [settings, setSettings] = useState({ enabled: data.autoTopup.enabled, thresholdCents: data.autoTopup.thresholdCents, amountCents: data.autoTopup.amountCents })
  const [saving, setSaving] = useState(false)
  const dirty = settings.enabled !== data.autoTopup.enabled || settings.thresholdCents !== data.autoTopup.thresholdCents || settings.amountCents !== data.autoTopup.amountCents

  async function save() {
    onError(null)
    setSaving(true)
    try {
      await api('/api/account/auto-topup', { method: 'PUT', body: JSON.stringify(settings) })
      await onSaved()
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
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {data.autoTopup.recent[0] ? `Last: ${cents(data.autoTopup.recent[0].amountCents)} ${data.autoTopup.recent[0].status}, ${when(data.autoTopup.recent[0].createdAt)}` : 'No automatic top-ups yet.'}
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
    // Kept for this tab only, so the playground below can use it. The server never has it again.
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
    curl: `curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer $TOLLBOOTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${DEFAULT_MODEL}", "messages": [{"role": "user", "content": "Hello!"}]}'`,
    node: `import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '${base}/v1', apiKey: process.env.TOLLBOOTH_API_KEY })
const reply = await client.chat.completions.create({
  model: '${DEFAULT_MODEL}',
  messages: [{ role: 'user', content: 'Hello!' }],
})`,
    python: `from openai import OpenAI

client = OpenAI(base_url="${base}/v1", api_key=os.environ["TOLLBOOTH_API_KEY"])
reply = client.chat.completions.create(
    model="${DEFAULT_MODEL}",
    messages=[{"role": "user", "content": "Hello!"}],
)`,
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quickstart</CardTitle>
        <CardDescription>OpenAI-compatible: point any OpenAI SDK at this base URL with your key. Every request is answered by {DEFAULT_MODEL}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:gap-3">
          <span className="shrink-0 text-muted-foreground">Base URL</span>
          <code className="min-w-0 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{apiBaseUrl ? `${apiBaseUrl}/v1` : 'Deploy the api function first (npx neon deploy)'}</code>
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

type PlaygroundResult = { prompt: string; text: string; inputTokens: number; outputTokens: number; reasoningTokens: number; chargeUsd: string | null; ms: number }

/** gpt-oss accepts low, medium and high; the selector's extra steps map to the nearest one. */
const EFFORT: Record<ThinkingEffort, string> = { off: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high' }

/** The one model we sell. The API answers every request with it. */
const MODELS = [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL, provider: 'openai', reasoning: true, tag: 'cheapest' }]

function Playground({ apiBaseUrl, limit, onCalled }: { apiBaseUrl: string; limit: DashboardData['limit']; onCalled: () => void }) {
  const [key, setKey] = useState('')
  const [prompt, setPrompt] = useState('In two sentences: why do prepaid API credits beat monthly invoices for a small AI startup?')
  const [effort, setEffort] = useState<ThinkingEffort>('low')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const load = () => setKey((current) => current || sessionStorage.getItem(LAST_KEY) || '')
    load()
    window.addEventListener(LAST_KEY, load)
    return () => window.removeEventListener(LAST_KEY, load)
  }, [])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    const startedAt = performance.now()
    try {
      const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: DEFAULT_MODEL, messages: [{ role: 'user', content: prompt }], reasoning_effort: EFFORT[effort] }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`)
      setResult({
        prompt,
        text: body.choices?.[0]?.message?.content ?? '',
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        // Reported by GPT-5 models; for gpt-oss the API estimates it and returns it in a header.
        reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? Number(response.headers.get('x-tollbooth-reasoning-tokens') ?? 0),
        chargeUsd: response.headers.get('x-tollbooth-charge-usd'),
        ms: Math.round(performance.now() - startedAt),
      })
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
        <CardDescription>
          Calls your API from the browser with your key, like any customer would. Turn reasoning up and watch the hidden tokens (and the charge) grow. This demo allows {limit.perDay} generations per account per day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={send} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="playground-key">API key</Label>
              <Input id="playground-key" type="password" placeholder="tb_… (create one above)" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Model</Label>
              <ModelSelect models={MODELS} value={DEFAULT_MODEL} className="w-full md:w-56" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Reasoning</Label>
              <ThinkingSelect value={effort} onValueChange={setEffort} size="md" className="w-full md:w-auto" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="playground-prompt">Prompt</Label>
            <textarea
              id="playground-prompt"
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {DEFAULT_MODEL} via Neon AI Gateway · reasoning_effort: {EFFORT[effort]} ·{' '}
              <span className={limit.remaining === 0 ? 'text-destructive' : undefined}>
                {limit.remaining} of {limit.perDay} generations left today
              </span>
              {limit.remaining === 0 && limit.nextSlotAt && (
                // Local time differs between server and browser; the browser's rendering wins.
                <span suppressHydrationWarning> · next at {new Date(limit.nextSlotAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              )}
            </span>
            <Button type="submit" className="w-full sm:w-auto" disabled={busy || !key.trim() || !prompt.trim() || !apiBaseUrl || limit.remaining === 0}>
              {busy ? 'Calling…' : 'Send'}
            </Button>
          </div>
        </form>
        {failure && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{failure}</p>}
        {result && (
          <div className="mt-4 flex flex-col gap-3 border-t pt-4">
            <MessageGroup>
              <Message align="end">
                <Bubble align="end" variant="tinted">
                  <BubbleContent className="whitespace-pre-wrap">{result.prompt}</BubbleContent>
                </Bubble>
              </Message>
              <Message>
                <Bubble variant="outline">
                  <BubbleContent className="whitespace-pre-wrap">{result.text || <span className="text-muted-foreground">(empty answer: the output budget went to reasoning)</span>}</BubbleContent>
                </Bubble>
              </Message>
            </MessageGroup>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{result.inputTokens} in</Badge>
              <Badge variant="outline">{result.outputTokens - result.reasoningTokens} visible out</Badge>
              <Badge variant="outline">~{result.reasoningTokens} reasoning</Badge>
              {result.chargeUsd && <Badge>charged ${Number(result.chargeUsd).toFixed(6)}</Badge>}
              <Badge variant="secondary">{result.ms} ms</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The usage ledger, one line per billed call, in the Neon UI logs viewer. */
function Recent({ data }: { data: DashboardData }) {
  const lines = data.usage.recent
    .slice()
    .reverse()
    .map((event) => ({
      id: event.id,
      at: event.createdAt,
      timestamp: new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level: 'info' as const,
      source: event.model,
      message: `${event.inputTokens} in · ${event.outputTokens - event.reasoningTokens} out · ${event.reasoningTokens} reasoning · ${money(event.priceMicros)}${event.latencyMs ? ` · ${event.latencyMs} ms` : ''}`,
    }))
  return (
    <div id="requests" className="min-w-0 scroll-mt-20">
      <LogsViewer title="Usage ledger" lines={lines} visibleRows={10} defaultFollow />
    </div>
  )
}
