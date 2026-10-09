# Design: Bouncer

A locked design system for this app, produced by `hallmark redesign`. Every page reads this
file before changing its look. Do not regenerate per page: amend this file when the system
needs to grow. The values live in [`tokens.css`](tokens.css); the ui.neon.com components are
re-themed through it (they read `--background`, `--primary`, `--border`, … which tokens.css maps
onto the Cobalt tokens), so they are used as-is.

## Genre

modern-minimal (an API product for developers and the people who bill them).

## Macrostructure family

- Marketing (`/`): **Split Studio**. Every claim sits beside its proof, the pairing alternates
  sides down the page, and exactly one full-bleed raised band breaks the rhythm.
- App (`/dashboard`): **Workbench**. Small functional headings, hairline
  panels, mono labels, tabular figures. No hero, no enrichment. (Amended: the owner asked for a
  sidebar, after the Neon Console.) A full-width app shell: a sticky sidebar (name, a cobalt-tinted
  balance row, Overview / Usage / Billing / Auto top-up, a divider, the expandable API group with
  keys / quickstart / playground, then sign out and collapse at the foot) and one view at a time
  (`?view=…`). Tablets get the icon rail; phones a sticky, scrollable strip under the nav.
- Auth (`/auth`): a two-column diptych, copy left, the Neon UI auth form right.

## Theme: Cobalt, dark (amended: the owner asked for dark mode)

- `--color-paper` oklch(15.5% 0.012 258) graphite, never #000
- `--color-surface` oklch(18.5% 0.013 258) cards (raised = lighter)
- `--color-paper-2` oklch(20% 0.014 258) inputs, table heads, the ⌘K field
- `--color-rule` oklch(28.5% 0.016 258) every hairline
- `--color-ink` oklch(95.5% 0.006 255) headings, never #fff
- `--color-ink-2` oklch(84% 0.01 255) body
- `--color-muted` oklch(71% 0.012 257) secondary text
- `--color-accent` oklch(70% 0.16 256) electric cobalt, lifted for the dark ground; dark text
  on it (< 5% of a view)
- `--color-graphite` oklch(11.5% 0.012 260) code cards (a deeper well)
- `--color-band` oklch(19.5% 0.015 258) the landing page's one raised band
- `--color-danger` oklch(70% 0.16 25) functional only: money lost, destructive actions

No shadows on the dark ground (they read as glow). Brand marks keep their own colours (Neon
green, Stripe blurple) at icon size only.

## Components

ui.neon.com first, re-themed only through tokens.css: metric cards, consumption chart, activity
feed, API key list, logs viewer, upgrade dialog, auth
form, tabs, switch, select. Hand-built only where Neon UI has nothing: the ⌘K palette (on the Neon dialog) and code cards.

## Typography

- Google Sans everywhere (owner's call): display at 700 with tracking −0.025em to −0.035em,
  roman only (no italic headings); body at 400/500
- Google Sans Code 400/500, the same family's mono, for code, kbd hints, machine labels and
  figures
- Hierarchy comes from weight (700 vs 400), size and tracking, not from a second family
- Hero: `--text-display` = clamp(2.5rem, 4.5vw + 1rem, 4.5rem); section heads `--text-display-s`

## Spacing

4-point named scale (`--space-3xs` … `--space-4xl`). Content width is `.page-frame` (72rem).

## Shape and depth

6px radius on controls (`--radius-control`), 10px on code cards (`--radius-code`). Hairlines
carry structure; the only shadow is `--shadow-whisper` under code cards.

## Motion

- Easings `--ease-out` / `--ease-in` / `--ease-in-out`; durations micro 120 / short 220 / long 420 ms.
- Reveal: fade + 10px rise once per section (IntersectionObserver); the hero types one line in once.
- Reduced motion: everything static and visible.

## Microinteractions stance

- ⌘K / Ctrl+K opens a working command palette everywhere (↑ ↓ ↵ Esc).
- Silent success; destructive or irreversible actions use the Neon UI hold-to-confirm dialog.
- Focus rings show instantly in cobalt; links get a cobalt underline on hover.

## CTA voice

- Primary: one solid cobalt button per view, 6px radius, names the destination ("Get an API key").
- Secondary: an outlined button or a typographic link ("How billing works").

## What pages MUST share

Wordmark (mark + Google Sans 700), the cobalt accent and its restraint, Google Sans + Code, the
6px control radius, the bordered N13 nav with ⌘K, and the Ft5 statement footer.

## What pages MAY differ on

Marketing pages may add one graphite band and code cards as proof. App pages may not add bands
or decoration: function carries them.

## Exports

### tokens.css

See [`tokens.css`](tokens.css) at the project root (the source of truth).

### shadcn/ui CSS variables

`--background` paper · `--foreground` ink · `--primary` accent · `--primary-foreground`
accent-ink · `--muted`/`--secondary`/`--accent` paper-2 · `--muted-foreground` muted ·
`--border` rule · `--input` rule-2 · `--ring` focus · `--radius` 6px (mapped in tokens.css).
