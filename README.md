# Tollbooth

![Tollbooth: sell an LLM API, metered per token, built on Neon and Stripe](src/app/opengraph-image.png)

Sell an LLM API, metered per token. A reference app for **Stripe real-time sync to Postgres**
on **Neon**, with no Stripe webhooks anywhere.

```
 Customer ──Bearer tb_…──▶ Neon Function `api` (OpenAI-compatible, custom domain)
                              │ 1 query: key → account → app.balances → model sold?
                              │                     ▲ synced stripe.charges − usage ledger
                              ▼
                         Neon AI Gateway (gpt-oss-20b) ──▶ usage → app.usage_events
                                                            (priced in SQL at write time)
 Dashboard ──Checkout (100% off)──▶ Stripe ══ real-time sync ══▶ stripe.checkout_sessions
 Neon Function `topups` (cron) ──$0 invoice──▶ Stripe ══▶ stripe.invoices
```

| Piece                                | Used for                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Stripe Data Pipeline → Neon          | `stripe.*` tables: free orders (`checkout_sessions`), top-ups (`invoices`), paid orders (`charges`), prices, codes |
| Neon Functions + custom domain       | `api`: the public, metered OpenAI-compatible endpoint; `topups`: auto top-ups                                      |
| Neon schedule trigger                | runs `topups` every 5 minutes, even while Postgres is scaled to zero                                               |
| Neon AI Gateway                      | the one model we resell and answer every request with: `gpt-oss-20b`, the cheapest per call; no provider keys      |
| Neon Auth (Managed Better Auth)      | dashboard sign-up/in; users live in `neon_auth.*`                                                                  |
| Next.js 16 on Vercel `cle1`          | dashboard and API routes, next to the Neon project in `aws-us-east-2`                                              |
| `@neondatabase/serverless` + Drizzle | every query, in the app and in the functions; schema/migrations on `DATABASE_URL_UNPOOLED`                         |
| Neon UI (ui.neon.com) + Hallmark     | components (metric cards, API key list, thinking select, …) re-themed to the Cobalt system in `design.md`          |

## How it works

- **The balance is derived, not stored.** `app.balances` = succeeded, undisputed Stripe charges
  (pro-rated for refunds) − the usage ledger. A refund in the Stripe Dashboard lowers the balance
  seconds later; nothing is ever incremented, so nothing can be double-credited.
- **One query per call to authorize.** The `api` function hashes the bearer key and, in one
  round trip, finds the account, reads its balance (pushed down to that one account) and checks
  the model is sold. Empty balance → `402 insufficient_quota`.
- **Every call is a ledger row.** After AI Gateway answers, the function writes the token counts
  (input, cached, output, reasoning) and computes `price_micros` and `cost_micros` in SQL with
  `app.price_micros()` / `app.cost_micros()`. Past calls keep what they were charged.
  Streaming works too: usage is read from the final SSE chunk. `gpt-oss-20b` reports no
  reasoning-token count, so its completion tokens are split by the share of reasoning text vs
  answer text (an estimate; the total is exact), returned as `x-tollbooth-reasoning-tokens`.
- **Every purchase is free (for the demo).** `AUTO_PROMOTION_CODE = 'TOLLBOOTH100'` (100% off,
  created by `npm run seed`) is applied to every Checkout Session and every top-up. A $0 order has
  no charge, so `app.balances` also counts completed $0 Checkout Sessions and paid $0 invoices at
  the pack's face value (`metadata.credits_cents`). Set the code to `null` to charge for real:
  Checkout then saves the card and top-ups charge it off-session.
- **Auto top-ups without webhooks.** Every 5 minutes `topups` finds accounts under their
  threshold and creates a Stripe invoice for the top-up with the promotion code (finalizing a $0
  invoice marks it paid; idempotency keys per 15-minute window). The invoice syncs back and the
  balance view counts it. A failure switches auto top-up off, with the reason in the dashboard.
- **Or top up now.** The dashboard's "Top up now" button runs the same code (`src/shared/topups.ts`,
  shared with the function) for your account, without waiting for the schedule: same threshold,
  same amount, same invoice. It skips the switch and the cooldown, but waits while the last top-up
  is still syncing, so a double click can't add credits twice.
- **Simulated usage, to demo auto top-up for free.** The dashboard's auto top-up card has
  "Use $1", "Use $5" and "Drop below threshold". They insert rows into `app.simulated_spend` (no
  AI Gateway call, no cost); `app.balances` subtracts them like real usage, so the `topups`
  function refills the balance on its next run (or "Top up now" does it right away). Simulated spend never counts toward the daily
  limit, never takes a balance below zero, and shows as its own series in the chart and ledger.
- **Two generations per account per day.** A demo guard against abuse (`DAILY_REQUEST_LIMIT`),
  checked in the same query as the key and balance. Once used up: `429` with `Retry-After`.

Money is integer micro-dollars (`*_micros`) and rates are USD per million tokens, so
tokens × rate is exact.

## API

OpenAI-compatible. Point any OpenAI SDK at the base URL shown in the dashboard:

```bash
curl "$API_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $TOLLBOOTH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-oss-20b", "messages": [{"role": "user", "content": "Hello!"}]}'
```

- `GET /v1/models`, `POST /v1/chat/completions` (`stream: true` supported).
- Responses carry `x-tollbooth-request-id`, `x-tollbooth-charge-usd`, `x-tollbooth-balance-usd`.
- Every request is answered by `gpt-oss-20b`, whatever `model` says (`x-tollbooth-model`).
- Output is capped at 8,192 tokens per call (2,048 by default) to bound the cost of one request.
- 2 generations per account per rolling 24 hours (`429` + `Retry-After` after that).

Dashboard routes (Next.js, session cookie):

| Route                         | Method      | What it does                                                                                      |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `/api/checkout`               | POST        | `{ pack }` → Stripe Checkout URL (saves the card)                                                 |
| `/api/account`                | GET         | balance, card on file, purchases, keys, usage (one round trip)                                    |
| `/api/account/auto-topup`     | PUT         | `{ enabled, thresholdCents, amountCents }`                                                        |
| `/api/account/auto-topup/run` | POST        | top up now (same rules as the `topups` function), skipping the wait for the next scheduled run    |
| `/api/usage/simulate`         | POST        | `{ kind: 'amount', cents }` or `{ kind: 'below-threshold' }`: simulated usage, no AI Gateway call |
| `/api/keys`, `/api/keys/[id]` | POST/DELETE | create (plaintext returned once, SHA-256 stored) / revoke                                         |

## Setup

You need Node 24+, a paid Neon plan (Functions, AI Gateway) and Stripe real-time sync preview
access.

```bash
npm install
```

1. **Neon project:** `tollbooth` (`old-leaf-44412943`) in `aws-us-east-2`, linked in `.neon`.
2. **Your secrets** in `.env` (see `.env.example`): `NEON_AUTH_COOKIE_SECRET`,
   `STRIPE_SECRET_KEY` (test mode) and `DEMO_PASSWORD`.
3. **Provision everything in `neon.ts`** (Auth, AI Gateway, both functions, the trigger):

   ```bash
   npm run neon:plan
   npx neon deploy            # later deploys to the protected main: --allow-protected
   ```

   Optional: set `API_CUSTOM_DOMAIN=api.yourdomain.com` before deploying to serve the API on
   your own domain, then set `API_BASE_URL=https://api.yourdomain.com` for the dashboard.

4. **Stripe pipeline:** Stripe Dashboard → Data management → Pipelines → **Neon**, pick this
   project, keep schema `stripe`, enable at least `customers`, `charges`, `payment_intents`,
   `checkout_sessions`, `invoices`, `prices` and `promotion_codes`.
5. **Migrate and seed.** The wallet view needs the `stripe` tables, so the migration checks for them first; the seed creates the Stripe prices and the promotion code:

   ```bash
   npm run db:migrate
   npm run seed
   ```

   Keep the `--> statement-breakpoint` markers between statements in `drizzle/*.sql`: the
   migrator splits on them, and the HTTP driver runs one statement per query.

6. **Run it:** `npm run dev`, click **Try the demo account** (`Phoenix`), buy credits (free:
   the code applies itself), create a key and try the playground.

### Deploy to Vercel

`vercel.json` pins functions to `cle1`. Add the env vars from `.env`; `APP_URL` falls back to the
Vercel URLs.

## Security

- **SQL injection:** every query is Drizzle's builder or a tagged template (`sql`…``), both of
  which bind values as parameters. Ids from requests are validated as uuids first.
- **API keys:** 32 random bytes, shown once; only the SHA-256 is stored and compared.
- **HTTPS (production only):** when `NODE_ENV=production`, env validation requires `https://`
  for Neon Auth, the AI Gateway, the API base URL and `APP_URL` (plain `http://` only for
  localhost), and responses send HSTS, `nosniff`, `X-Frame-Options: DENY` and a small CSP.
  `npm run dev` skips both.

## Design

The look is a locked system in [`design.md`](design.md), produced with the
[Hallmark](https://www.usehallmark.com/) skill (`hallmark redesign`): modern-minimal, **Cobalt**
theme in its dark variant. Graphite paper, one electric-cobalt signal, Google Sans everywhere
(Google Sans Code for code), hairlines instead of shadows, code cards as proof, a working ⌘K
palette.

All values live in [`tokens.css`](tokens.css). The ui.neon.com components are used unmodified:
`tokens.css` maps their variables (`--background`, `--primary`, `--border`, …) onto the Cobalt
tokens. Marketing is a **Split Studio** page (claim beside proof, one raised band); the
dashboard is a **Workbench** app shell (a Neon Console-style sidebar, one view at a time, `?view=…`) built from Neon UI: metric cards, consumption chart, activity
feed, API key list, model and thinking selects, message bubbles, logs viewer, upgrade dialog.
Responsive at phone, tablet and desktop widths.

### Social card

`src/app/opengraph-image.png` is pre-rendered by `npm run og` (headless Chrome) from
`tokens.css` and the site's own faces. Re-run it only after changing the name, the copy or the
mark.
