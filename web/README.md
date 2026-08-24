# UtilizationIQ — web

Static operations dashboard for consulting resource utilization. Six screens,
no framework, no build step, no runtime network calls.

## Running it

Open `web/index.html` directly in a browser. That's it — there is no server
requirement and no install step.

To serve it over HTTP instead:

```bash
python -m http.server 8502 --directory web
```

## Why there's no `fetch`

Seed data ships as `assets/data/seed-data.js`, a plain script that assigns
`window.IQ_SEED`. An earlier version fetched a `.json` file, which silently
broke the entire site when opened from `file://` — browsers treat a sibling
file as cross-origin and block it, so every page hung on skeleton loaders.
Shipping the data as a script removes that failure mode entirely and costs one
fewer round trip. The CI workflow fails the build if a `fetch(` reappears in
`web/assets/js/`.

## Structure

| File | Role |
| --- | --- |
| `assets/css/styles.css` | Whole design system: tokens, light/dark themes, every component |
| `assets/js/iq-data.js` | Seed access, filter state, all shared rollups |
| `assets/js/iq-findings.js` | Detection rules; each finding carries its own evidence string |
| `assets/js/iq-charts.js` | Inline-SVG line/bar/sparkline rendering |
| `assets/js/iq-table.js` | Sorting, CSV serialization, download |
| `assets/js/iq-shell.js` | Nav, topbar, theme switch, command palette |
| `assets/js/page-*.js` | One controller per screen |
| `assets/data/seed-data.js` | Generated — do not hand-edit |

Regenerate the dataset with:

```bash
python scripts/generate_web_data.py
```

## Design notes

Three typographic voices, each with one job: **Newsreader** (serif) for page
titles and headline figures, **Inter** for interface text, **IBM Plex Mono**
for every numeric cell so table columns align like a ledger. Palette is
warm-neutral — bone in light, warm charcoal in dark — with a desaturated
ink-navy accent. Green/amber/red are reserved strictly for data status and are
never used on chrome, and status is always paired with a text label rather than
carried by color alone.

Themes are light / dark / system, persisted in `localStorage` and applied by an
inline script in each `<head>` so there is no flash of the wrong theme on load.

## The one identity that matters

`utilization % = billable_hours ÷ available_hours`, computed from the same row
on every screen. Reconciliation totals, Reports totals, and the Overview KPI
cards are all derived from the same rollups in `iq-data.js`, so they agree by
construction rather than by coincidence.

## Accessibility

WCAG AA contrast verified in both themes (lowest ratio 5.13:1). Sortable
headers are keyboard-operable with `aria-sort`; expandable rows expose
`aria-expanded`; there's a skip link, visible focus rings, and
`prefers-reduced-motion` support.

## Keyboard

- `Ctrl`/`Cmd` + `K` — command palette (jump to a screen, set a filter, flip theme)
- `↑` `↓` `↵` `Esc` — navigate the palette
- `Tab` + `↵`/`Space` — sort a column or expand a row
