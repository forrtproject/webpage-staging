# FReD Apps Style Rules

The FReD apps (landing page, Explorer, Annotator) use the design system of the
**FLoRA Replication Atlas** ([live](https://forrt.org/flora-replication-atlas/),
source: `forrtproject/flora-replication-atlas`, `src/index.css`). When something
below doesn't cover a case, copy what the Atlas does.

All tokens live in [`shared/css/theme.css`](shared/css/theme.css). Component CSS
and JavaScript read tokens; they never hard-code colours.

---

## Colour

### Brand and surfaces
| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#853953` | `#d68aa7` | Links, primary buttons, active states, headline numbers |
| `--primary-dark` | `#612d53` | `#e7a9c0` | Hover for primary |
| `--primary-light` | `#a04d6b` | `#c27093` | KPI labels |
| `--primary-faint` | `#f9f0f4` | `#3a2530` | Active row, KPI band, hover tint |
| `--primary-soft` | `#ecd9e0` | `#5a3446` | Feature-card border, underlines |
| `--on-primary` | `#fff` | `#1b181a` | Text on a `--primary` fill |
| `--neutral` | `#2c2c2c` | `#121011` | Top bar and footer |
| `--surface` | `#f3f4f4` | `#1b181a` | Page background, inset panels, table header |
| `--surface-alt` | `#e8e9e9` | `#242023` | Secondary-button hover, tracks |
| `--white` | `#fff` | `#2a2528` | Cards, panels, inputs, chart background |

### Text and lines
| Token | Light | Dark |
|---|---|---|
| `--text` | `#2c2c2c` | `#ece8ea` |
| `--text-secondary` | `#4a4a4a` | `#cdc6ca` |
| `--text-muted` | `#5c5c5c` | `#a9a1a6` |
| `--text-faint` | `#696969` | `#958d92` |
| `--border` | `#d0d1d1` | `#463f43` |
| `--border-light` | `#e0e1e1` | `#383236` |

### Outcomes: these encode data, not decoration
There are two distinct outcome palettes:
- **UI chrome** (badges, alerts, verdict text) uses the Atlas status tokens (`--success`, `--warning`, `--error`).
- **ECharts figures** (bars, scatter points, trend lines, legends) use the FLoRA Explorer `--color-chart-*` palette (`forrtproject/flora-explorer`, `react-frontend` branch `src/styles/tokens.css`), tuned so in-bar labels stay readable and series marks keep at least 3:1 contrast in dark mode.

| UI Meaning | Fill / dot | Text | Tint background | Border |
|---|---|---|---|---|
| Success | `--success` | `--success-light` | `--success-bg` | `--success-border` |
| Mixed | `--warning` (fills only, fails AA as text) | `--warning-text` | `--warning-bg` | `--warning-border` |
| Failure | `--error` | `--error` | `--error-bg` | `--error-border` |
| Not coded / not calculable | `--border` | `--text-muted` | `--surface-alt` | `--border` |

| Chart Token | Light | Dark | Outcome labels |
|---|---|---|---|
| `--color-chart-successful` | `#248073` | `#7ad9b5` | success, successful, successful replication, homogeneous & jointly significant |
| `--color-chart-failed` | `#c24a33` | `#f08570` | failure, failed, failed replication, informative failure, homogeneous & not significant |
| `--color-chart-technical-failure` | `#7a2a23` | `#d9645a` | failure (reversal), not homogeneous & not significant |
| `--color-chart-failure-partial` | `#d0684b` | `#f4a582` | failure (not homogeneous but jointly significantly above 0) |
| `--color-chart-mixed` | `#d9a441` | `#e3b657` | mixed |
| `--color-chart-qualified` | `#7b61a8` | `#c0a8fa` | statistically successful but flawed |
| `--color-chart-descriptive` | `#5d7186` | `#7a92a8` | descriptive only |
| `--color-chart-uninformative` | `#a3907a` | `#c2b29c` | OS not significant, uninformative |
| `--color-chart-not-coded` | `#c3c7ce` | `#5a5f69` | not calculable, not coded (deliberately faint: unassessed) |
| `--color-chart-original` / `--color-chart-replication` | `#853953` / `#6f7686` | `#d68aa7` / `#a3a9b6` | Forest plot original (circle) and replication (diamond) |
| `--sig-yes` / `--sig-no` | `#853953` / `#696969` | `#d68aa7` / `#958d92` | Scatterplot significance rugs |

The label → token map lives in `FReD.successCriteria.colorTokens`
([shared/js/success-criteria.js](shared/js/success-criteria.js)). Never use colour
alone: every chart pairs colour with legends, labels, or distinct marker shapes.

---

## Typography

- **Display:** Domine (headings, card and modal titles, brand name, big numbers)
- **Body:** Source Sans 3 (everything else)
- Both are self-hosted in `shared/fonts/` (SIL OFL, licences alongside); declared in `shared/css/fonts.css`.

| Token | Size | Use |
|---|---|---|
| `--fs-9` | clamp(30–46px) | Landing hero title (plum) |
| `--fs-8` | clamp(24–32px) | Section headings, `h1` |
| `--fs-7` | clamp(19–21px) | KPI numbers, `h2` |
| `--fs-6` | 16px | Card / modal titles |
| `--fs-5` | 14px | Body copy, inputs |
| `--fs-4` | 13px | Dense UI, buttons, tables |
| `--fs-3` | 12px | Meta, footer, table headers |
| `--fs-2` / `--fs-1` | 11 / 10px | Pills, eyebrow labels (uppercase, letter-spaced) |

---

## Shape, elevation, motion

- **Radius by role:** inputs/tags `--radius-sm` (4px), buttons/controls `--radius` (8px), cards/panels/modals `--radius-lg` (14px), chips/pills `--radius-full`. `50%` only for true circles.
- **Shadows** are plum-tinted: `--shadow-sm` (resting cards), `--shadow-md` (hovered cards), `--shadow-lg` (modals, dropdowns).
- **Motion:** `--transition-fast` (0.12s) for hovers, `--transition` (0.24s) for larger moves. Everything respects `prefers-reduced-motion`.
- **Focus:** a 2px `--primary` outline on `:focus-visible` for every interactive element.

---

## Components

- **Top bar** (`.page-header` > `.topbar`): 52px, `--neutral`, FORRT icon tile + two-line name (Domine title, uppercase subtitle), translucent white nav links, theme toggle as a 32px tile.
- **Footer** (`.footer-bar`): slim `--neutral` strip, 12px text, underlined links.
- **Cards:** white, `--border-light` border, `--radius-lg`, `--shadow-sm`; header in Domine 16px with a hairline divider.
- **Buttons:** primary = `--primary` fill; secondary = white with `--border`; outline = transparent with `--border`. 13px, weight 600.
- **Sidebar nav** (`.sidebar-nav-link`): active row is `--primary-faint` with a 3px `--primary` bar on the left (Atlas list rows), never a solid fill.
- **Tabs:** muted 600-weight labels; active tab is `--primary` with a 2px inset underline.
- **KPI band** (`.sidebar-counts`, `.effect-count`): `--primary-faint` strip, Domine plum numbers, uppercase labels.
- **Badges / outcome pills:** pill radius, tint background + border + text colour from the outcome table.
- **Alerts:** tint background with a 4px coloured left border.
- **Tables (DataTables):** `--surface` header with 12px uppercase labels; hairline row dividers; hover and selected rows use `--primary-faint` (selected adds the 3px left bar). DataTables CSS loads **before** `theme.css` so the overrides win.
- **Modals:** blurred dark backdrop, white `--radius-lg` box, Domine title, `--surface` footer strip.

---

## Theme toggle

1. On load: saved preference in `localStorage['fred-theme']`, else the system preference.
2. Applies `data-theme="light|dark"` on `<html>`; dark mode only overrides tokens.
3. Dispatches a `themechange` event; charts re-render on it.

## ECharts figures (FReD Explorer)

Explorer renders every chart with **Apache ECharts 6.1.0** using the **SVG renderer** (`renderer: 'svg'`) via the shared helpers in [`shared/js/charts.js`](shared/js/charts.js) (ported from `forrtproject/flora-explorer` `react-frontend`):

- `FReD.charts.finishOption(option, { width })` applies the shared paper ground (`--white`), `--font-body`, top-left circular legend, dark HTML-escaped tooltips, and `prefers-reduced-motion` animation gating.
- `FReD.charts.valueAxis()`, `categoryAxis()`, `countAxis()`, `stackCorners()`, `labelColor()`, and `horizontalBarHeight()` keep axis and bar styling consistent across views.
- `FReD.charts.mount(container, spec)` defers initialisation until the container has non-zero width (hidden tabs), redraws on resize and `themechange`, adds `role="img"` + `aria-label`, renders a keyboard-accessible **"View chart data"** `<details>` table underneath, and wires a **"Copy chart CSV"** button (formula-injection safe).
- `FReD.charts.exportSvg()` and `FReD.charts.exportPng()` provide crisp SVG and 2× PNG downloads for the forest plot.

---

## Responsive breakpoints

| Breakpoint | Change |
|---|---|
| `960px` | Sidebar collapses to one column; top bar collapses to a hamburger menu |
| `768px` | Card headers stack; landing app cells stack |
| `640px` | Base font 14px; top-bar subtitle hidden; footer stacks |
