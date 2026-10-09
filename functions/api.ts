import { DAILY_REQUEST_LIMIT, DEFAULT_MAX_COMPLETION_TOKENS, MAX_COMPLETION_TOKENS, usd } from '@/shared/pricing'
import { sql } from '@functions/lib/db'
import { env } from '@functions/lib/env'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { createHash, randomUUID } from 'node:crypto'

/**
 * Tollbooth's public API: OpenAI-compatible, metered per token, served by a Neon Function
 * (optionally on a custom domain, see neon.ts).
 *
 *   1. AUTH + BALANCE in one query: hash the bearer key, find the account, read its balance
 *      from app.balances (synced Stripe charges − the usage ledger), check the model is sold.
 *   2. FORWARD to Neon AI Gateway (no provider keys here), always to gpt-oss-20b.
 *   3. METER: write one ledger row with the token counts. Price and cost are computed in SQL
 *      from app.model_rates / app.model_costs.
 */

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** `usedToday`: billed calls in the last 24 hours; `nextSlotAt`: when the oldest of them ages out. */
type Caller = { keyId: string; accountId: string; balanceMicros: number; modelSold: boolean; usedToday: number; nextSlotAt: string | null }

const app = new Hono()

// Browsers may call the API directly (the dashboard playground does). Keys, not cookies, so
// any origin is fine.
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['authorization', 'content-type'],
    exposeHeaders: ['retry-after', 'x-tollbooth-request-id', 'x-tollbooth-model', 'x-tollbooth-reasoning-tokens', 'x-tollbooth-charge-usd', 'x-tollbooth-balance-usd'],
    maxAge: 86400,
  }),
)

app.get('/', (c) => c.json({ name: 'Tollbooth API', endpoints: ['GET /v1/models', 'POST /v1/chat/completions'] }))

app.get('/v1/models', async (c) => {
  const caller = await authenticate(c, null)
  if (!caller) return apiError(c, 401, 'invalid_api_key', 'Missing or invalid API key.')
  const rows = (await sql`select model from app.model_rates where active order by model`) as { model: string }[]
  return c.json({ object: 'list', data: rows.map(({ model }) => ({ id: model, object: 'model', owned_by: 'tollbooth' })) })
})

app.post('/v1/chat/completions', async (c) => {
  const startedAt = Date.now()
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return apiError(c, 400, 'invalid_request_error', 'Body must be JSON with a non-empty `messages` array.')
  }

  // Every request is answered by the one model we sell (gpt-oss-20b, the cheapest on AI Gateway),
  // whatever `model` the caller names. The response's `model` field says what actually ran.
  const model = env.DEFAULT_MODEL
  const caller = await authenticate(c, model)
  if (!caller) return apiError(c, 401, 'invalid_api_key', 'Missing or invalid API key.')
  if (!caller.modelSold) return apiError(c, 503, 'service_unavailable', `Model "${model}" has no rates in app.model_rates.`)
  // Demo limit: DAILY_REQUEST_LIMIT generations per account per rolling 24 hours.
  if (caller.usedToday >= DAILY_REQUEST_LIMIT) {
    const retryAfter = caller.nextSlotAt ? Math.max(1, Math.ceil((Date.parse(caller.nextSlotAt) - Date.now()) / 1000)) : 3600
    c.header('retry-after', String(retryAfter))
    return apiError(c, 429, 'rate_limit_exceeded', `This demo allows ${DAILY_REQUEST_LIMIT} generations per account per 24 hours. Try again in about ${Math.ceil(retryAfter / 3600)} h.`)
  }
  if (caller.balanceMicros <= 0) {
    return apiError(c, 402, 'insufficient_quota', 'Your Tollbooth balance is empty. Add credits or turn on auto top-up in the dashboard.')
  }

  // Bound the cost of a single call. gpt-oss takes `max_tokens` (it rejects the newer
  // `max_completion_tokens`), so either spelling from the caller becomes `max_tokens`.
  const requested = Number(body.max_completion_tokens ?? body.max_tokens ?? DEFAULT_MAX_COMPLETION_TOKENS)
  const upstreamBody: Record<string, unknown> = { ...body, model, max_tokens: Math.min(Math.max(1, requested || DEFAULT_MAX_COMPLETION_TOKENS), MAX_COMPLETION_TOKENS) }
  delete upstreamBody.max_completion_tokens
  const stream = body.stream === true
  // Streams only report usage in a final chunk when asked to; we always need it to bill.
  if (stream) upstreamBody.stream_options = { ...(body.stream_options as object | undefined), include_usage: true }

  if (!env.NEON_AI_GATEWAY_BASE_URL || !env.NEON_AI_GATEWAY_TOKEN) {
    return apiError(c, 503, 'service_unavailable', 'AI Gateway is not enabled on this branch (aiGateway: true in neon.ts).')
  }
  const upstream = await fetch(`${env.NEON_AI_GATEWAY_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.NEON_AI_GATEWAY_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(upstreamBody),
  })

  const requestId = randomUUID()
  const meter = (usage: Usage | undefined, text: TextLengths) => record({ requestId, caller, model, usage, reasoningTokens: reasoningTokens(usage, text), status: upstream.status, latencyMs: Date.now() - startedAt })

  // Upstream errors pass through unbilled (no usage happened).
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text()
    log(`request=${requestId} account=${caller.accountId} upstream=${upstream.status}`)
    return new Response(detail || JSON.stringify({ error: { message: 'Upstream error', type: 'upstream_error' } }), {
      status: upstream.status >= 500 ? 502 : upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'x-tollbooth-request-id': requestId },
    })
  }

  if (!stream) {
    const completion = (await upstream.json()) as { usage?: Usage; choices?: { message?: Delta }[] }
    const text = { answer: 0, reasoning: 0 }
    for (const choice of completion.choices ?? []) addText(text, choice.message)
    const charged = await meter(completion.usage, text)
    return c.json(completion, 200, {
      'x-tollbooth-request-id': requestId,
      'x-tollbooth-model': model,
      'x-tollbooth-reasoning-tokens': String(reasoningTokens(completion.usage, text)),
      'x-tollbooth-charge-usd': usd(charged).toFixed(6),
      'x-tollbooth-balance-usd': usd(caller.balanceMicros - charged).toFixed(6),
    })
  }

  // Server-sent events: pass every chunk straight through, keep the last `usage` seen and the
  // length of answer vs reasoning text, and write the ledger row when the stream ends.
  let usage: Usage | undefined
  const text = { answer: 0, reasoning: 0 }
  const read = (line: string) => {
    const chunk = parseSse(line)
    if (!chunk) return
    usage = chunk.usage ?? usage
    for (const choice of chunk.choices ?? []) addText(text, choice.delta)
  }
  let pending = ''
  const decoder = new TextDecoder()
  const metered = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk)
        pending += decoder.decode(chunk, { stream: true })
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) read(line)
      },
      async flush() {
        read(pending)
        await meter(usage, text)
      },
    }),
  )
  return new Response(metered, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-tollbooth-request-id': requestId, 'x-tollbooth-model': model },
  })
})

/**
 * One round trip: key → account → balance (pushed down to this account) → is the model sold →
 * how many calls this account made in the last 24 hours (the demo's daily limit).
 * `model` null skips the model check (GET /v1/models).
 */
async function authenticate(c: Context, model: string | null): Promise<Caller | null> {
  const key = c.req.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!key) return null
  const keyHash = createHash('sha256').update(key).digest('hex')
  const [row] = (await sql`
    with k as (
      select id, account_id from app.api_keys where key_hash = ${keyHash} and revoked_at is null
    )
    select k.id as key_id, k.account_id,
           coalesce((select b.balance_micros from app.balances b where b.account_id = k.account_id), 0)::bigint as balance_micros,
           (${model}::text is null or exists (select 1 from app.model_rates r where r.model = ${model} and r.active)) as model_sold,
           u.used_today, u.oldest + interval '24 hours' as next_slot_at
      from k
      cross join lateral (
        select count(*)::int as used_today, min(e.created_at) as oldest
          from app.usage_events e
         where e.account_id = k.account_id
           and e.created_at > now() - interval '24 hours'
      ) u`) as { key_id: string; account_id: string; balance_micros: string; model_sold: boolean; used_today: number; next_slot_at: string | null }[]
  return row
    ? {
        keyId: row.key_id,
        accountId: row.account_id,
        balanceMicros: Number(row.balance_micros),
        modelSold: row.model_sold,
        usedToday: row.used_today,
        nextSlotAt: row.next_slot_at && new Date(row.next_slot_at).toISOString(),
      }
    : null
}

/** Writes the ledger row and touches the key, in one transaction. Returns the price charged. */
async function record(input: { requestId: string; caller: Caller; model: string; usage: Usage | undefined; reasoningTokens: number; status: number; latencyMs: number }): Promise<number> {
  const { requestId, caller, model, usage, reasoningTokens, status, latencyMs } = input
  const promptTokens = usage?.prompt_tokens ?? 0
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  if (!usage) log(`request=${requestId} account=${caller.accountId} WARNING: no usage reported, recording zero tokens`)

  try {
    const [inserted] = await sql.transaction([
      sql`
        insert into app.usage_events (id, account_id, api_key_id, model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, price_micros, cost_micros, status, latency_ms)
        values (${requestId}, ${caller.accountId}, ${caller.keyId}, ${model}, ${promptTokens}, ${cachedTokens}, ${completionTokens}, ${reasoningTokens},
                app.price_micros(${model}, ${promptTokens}, ${cachedTokens}, ${completionTokens}, ${reasoningTokens}),
                app.cost_micros(${model}, ${promptTokens}, ${cachedTokens}, ${completionTokens}),
                ${status}, ${latencyMs})
        returning price_micros`,
      sql`update app.api_keys set last_used_at = now() where id = ${caller.keyId}`,
    ])
    const charged = Number((inserted as { price_micros: string }[])[0]?.price_micros ?? 0)
    log(`request=${requestId} account=${caller.accountId} model=${model} in=${promptTokens} out=${completionTokens} reasoning=${reasoningTokens} charged=${charged}`)
    return charged
  } catch (error) {
    // The call already happened; never fail the customer's response over bookkeeping.
    console.error(`[api] request=${requestId} failed to record usage`, error)
    return 0
  }
}

type Delta = { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }
type TextLengths = { answer: number; reasoning: number }

function addText(text: TextLengths, delta: Delta | undefined) {
  text.answer += delta?.content?.length ?? 0
  text.reasoning += (delta?.reasoning_content ?? delta?.reasoning)?.length ?? 0
}

/**
 * Reasoning tokens, billed at their own rate. GPT-5 models report them; gpt-oss returns the
 * reasoning as text (`reasoning_content`) but no count, so its completion tokens are split by
 * the share of reasoning text vs answer text. An estimate, but the total is exact.
 */
function reasoningTokens(usage: Usage | undefined, text: TextLengths): number {
  const reported = usage?.completion_tokens_details?.reasoning_tokens
  if (typeof reported === 'number') return reported
  const characters = text.answer + text.reasoning
  return characters > 0 ? Math.round(((usage?.completion_tokens ?? 0) * text.reasoning) / characters) : 0
}

function parseSse(line: string): { usage?: Usage | null; choices?: { delta?: Delta }[] } | null {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function apiError(c: Context, status: 400 | 401 | 402 | 429 | 503, code: string, message: string) {
  return c.json({ error: { message, type: code, code } }, status)
}

const log = (message: string) => console.log(`[api] branch=${env.NEON_BRANCH} ${message}`)

export default app
