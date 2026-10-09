import { AppLogo, NeonLogo, StripeLogo } from '@/components/brand/logos'
import { SITE } from '@/shared/site'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Pre-renders the social card to src/app/opengraph-image.png, once:
 *   - Next serves that file as the site's og:image (file convention, nothing to run at build)
 *   - the README embeds the same PNG
 *
 * Plain HTML screenshotted by headless Chrome, using the site's own tokens.css (Cobalt, see
 * design.md) and its real faces: Google Sans and Google Sans Code.
 * Re-run only after changing the name, the copy or the mark:
 *
 *   npm run og                      # CHROME_PATH=… to use another Chrome/Chromium
 */
const OUT = resolve('src/app/opengraph-image.png')
const [WIDTH, HEIGHT] = [1200, 630]
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TOKENS = readFileSync(resolve('tokens.css'), 'utf8')

const card = (
  <main>
    <div className="copy">
      <div className="brand">
        <AppLogo className="mark" />
        {SITE.name}
      </div>
      <h1>Sell an LLM API by the token.</h1>
      <div className="chips">
        <span className="chip">
          <NeonLogo className="neon" />
          Neon
        </span>
        <span className="chip">
          <StripeLogo />
          Stripe
        </span>
        <span className="note">no webhooks</span>
      </div>
    </div>
    <figure className="code">
      <figcaption>
        <span>POST /v1/chat/completions</span>
        <span className="ok">200 OK</span>
      </figcaption>
      <pre>
        <span className="k">&quot;usage&quot;</span>: {'{'}
        {'\n  '}
        <span className="k">&quot;prompt_tokens&quot;</span>: 107,{'\n  '}
        <span className="k">&quot;completion_tokens&quot;</span>: 274,{'\n  '}
        <span className="k">&quot;cached_tokens&quot;</span>: 32{'\n'}
        {'}'}
        {'\n'}
        <span className="dim">{'// gpt-oss-20b · 3-word answer'}</span>
      </pre>
    </figure>
  </main>
)

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500;700&family=Google+Sans+Code:wght@400;500&display=block" rel="stylesheet">
<style>
  /* tokens.css names the next/font variables; outside Next they are just the family names. */
  :root { --font-google-sans: 'Google Sans'; --font-google-sans-code: 'Google Sans Code'; }
${TOKENS}
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
  main { display: grid; grid-template-columns: 1.05fr 1fr; align-items: center; gap: 56px; width: 100%; height: 100%; padding: 72px 72px 72px 80px; border-bottom: 10px solid var(--color-accent); }
  .copy { display: flex; flex-direction: column; gap: 36px; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 14px; font: 700 34px/1 var(--font-display); letter-spacing: -0.02em; }
  .mark { width: 44px; height: 44px; color: var(--color-ink); }
  h1 { font: 700 76px/1.02 var(--font-display); letter-spacing: -0.035em; }
  .chips { display: flex; align-items: center; gap: 14px; }
  .chip { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border: 1px solid var(--color-rule); border-radius: var(--radius-control); background: var(--color-surface); font: 500 26px/1 var(--font-body); }
  .chip svg { width: 26px; height: 26px; }
  .neon { color: var(--color-ink); }
  .note { margin-left: 6px; font: 500 22px/1 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-muted); }
  .code { min-width: 0; border: 1px solid var(--color-graphite-rule); border-radius: var(--radius-code); background: var(--color-graphite); overflow: hidden; }
  figcaption { display: flex; justify-content: space-between; gap: 16px; padding: 16px 22px; border-bottom: 1px solid var(--color-graphite-rule); font: 400 17px/1 var(--font-mono); color: var(--color-graphite-muted); }
  .dim { color: var(--color-graphite-muted); }
  figcaption span { white-space: nowrap; }
  .ok { padding: 4px 8px; border: 1px solid var(--color-signal-on-dark); border-radius: 4px; color: var(--color-signal-on-dark); font-weight: 500; letter-spacing: 0.06em; }
  pre { padding: 26px 22px; font: 400 25px/1.65 var(--font-mono); color: var(--color-graphite-ink); white-space: pre; }
  .k { color: var(--color-signal-on-dark); }
</style>
</head>
<body>${renderToStaticMarkup(card)}</body>
</html>`

const dir = mkdtempSync(join(tmpdir(), 'og-'))
try {
  const page = join(dir, 'card.html')
  writeFileSync(page, html)
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      // Lets the web fonts load before the screenshot is taken.
      '--virtual-time-budget=10000',
      `--user-data-dir=${join(dir, 'profile')}`,
      `--screenshot=${OUT}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore' },
  )
  console.log(`Wrote ${OUT} (${WIDTH}×${HEIGHT})`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
