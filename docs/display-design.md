# Display Page Design Guide

The rules display pages are built from. Display pages are per-program operator dashboards: widgets on a
12-column grid, compiled to HTML and shown in a WebView on phones, tablets and desktop. Use this guide when
you build the compiler's stylesheet, a new widget type, or a default page template, and to critique a
screenshot (see the checklist at the end).

The guide draws on industrial High Performance HMI (ISA-101), Grafana, Home Assistant tile and Mushroom cards,
Apple's widget guidance, Material 3, automotive UIs, and Vercel/Linear-style dark dashboards.

---

## 1. Principles

1. **Calm by default, loud only when it matters.** (High Performance HMI) The normal state is neutral greys
   with one accent. Saturated colour means something needs the operator: a fault, a warning, a running
   process. A page where everything is green and red says nothing.
2. **Colour = meaning, and the meaning never changes.** Green is always ok/running, amber is always
   warning, red is always fault/stop-needed, the accent (blue) is always interactive. Never use status
   colours for decoration, and never use colour as the only cue. Pair it with a word or an icon
   ("Running", "Fault").
3. **Hierarchy you can see from across the bench.** Every page has one hero (the thing the program is
   about: a camera, a main value, the embedded plugin), then supporting stats, then detail. Size and
   position carry importance. Colour does not. (ISA-101 Level 1→4, Grafana "general to specific")
4. **One primary action.** At most one filled accent button per page (usually Run). Everything else is
   tonal, outlined or text. Destructive actions are clear but not enormous.
5. **Glanceable values.** The number is the content. Labels are small and quiet, values are large and
   tabular, units are lighter than the value. Readable in two seconds (Apple widgets, Tesla speed readout).
6. **Density with breathing room.** Fill the grid with no dead quadrants, but keep a consistent 16 px of
   padding inside every card. Lay out the page to match the space you have, and don't stretch one card to
   fill it.
7. **Alignment and consistency.** Every card shares one radius, one padding, one label style and one
   header pattern. Card edges sit on the grid and baselines line up across a row.
8. **Flat and honest.** No 3D bevels, gradients on data, glow or animated decoration. Motion only for live
   data and state changes, and keep it short (150-200 ms).

---

## 2. Design tokens

Expose them as CSS custom properties on `:root`. The compiler picks the theme from the app's theme, and
plugin iframes get the same variables (see §3.8). Values are tuned to work together. Change them as a set.

### Colour: dark theme (default for operator screens)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0E1013` | Page background |
| `--surface` | `#16191E` | Cards |
| `--surface-raised` | `#1D2127` | Card headers, hover, inputs, chips, nested panels |
| `--border` | `#262B33` | 1 px hairline card border, dividers, chart gridlines |
| `--border-strong` | `#363C46` | Outlined buttons, focus-adjacent edges |
| `--text` | `#E7E9EC` | Values, titles |
| `--text-2` | `#A2A9B4` | Labels, secondary text |
| `--text-3` | `#6B7380` | Units, timestamps, axis labels, disabled |
| `--accent` | `#4C8DFF` | Primary button, links, focus ring, default graph line |
| `--accent-soft` | `rgba(76,141,255,0.14)` | Tonal buttons, selected chips |
| `--ok` | `#3FB950` | Running / true / healthy |
| `--warn` | `#E3A008` | Warning, approaching limit |
| `--error` | `#F0524D` | Fault, stop, false-when-bad |
| `--info` | `#58A6FF` | Neutral notices, "idle but ready" |
| `--ok-soft` / `--warn-soft` / `--error-soft` | status colour at 14% alpha | Pill and tonal backgrounds |

### Colour: light theme

| Token | Hex | Notes |
|---|---|---|
| `--bg` | `#F3F4F6` | Light grey page, so white cards separate without heavy shadows (HP-HMI "light grey") |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-raised` | `#F7F8FA` | Headers, inputs, nested panels |
| `--border` | `#E2E5E9` | Hairline |
| `--border-strong` | `#CDD2D8` | Outlined buttons |
| `--text` | `#14171C` | |
| `--text-2` | `#4B5361` | |
| `--text-3` | `#868E9A` | |
| `--accent` | `#2563EB` | |
| `--accent-soft` | `rgba(37,99,235,0.10)` | |
| `--ok` | `#1A7F37` | Darker shades keep 4.5:1 contrast as text on white |
| `--warn` | `#B7791F` | |
| `--error` | `#CF222E` | |
| `--info` | `#0969DA` | |
| `--*-soft` | status colour at 10% alpha | |

Contrast: `--text` and `--text-2` must pass 4.5:1 on `--surface` in both themes. `--text-3` is only for
non-essential text at ≥ 12 px. Graph series after the first: `#4C8DFF`, `#2BB3A6`, `#A371F7`, `#E3A008`,
`#F778BA` (dark). In light, use the same hues one step darker. Never put status red or green on a plain
data series.

### Shape, space, elevation

- **Radius:** `--r-sm: 6px` (pills, chips, inputs), `--r-md: 10px` (buttons), `--r-lg: 14px` (cards),
  `--r-full: 999px` (status pills, dots). Inner radius = outer radius − padding, so content nested in a
  card uses `--r-sm`.
- **Spacing (8-pt, with a 4 px half-step):** `4, 8, 12, 16, 24, 32, 48`. Card padding 16 (12 on phone).
  Grid gutter 12 (phone) / 16 (tablet, desktop). Page padding 16 / 24 / 32 (phone / tablet / desktop).
  Label-to-value gap 4. Gap between stacked sections 24.
- **Shadows:** dark theme uses **no shadows**. Elevation comes from a lighter surface plus the hairline
  border. Light theme: cards `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.04)` plus the border.
  Popovers only: `0 8px 24px rgba(16,24,40,.12)`.
- **Touch targets:** ≥ 44 px tall for anything tappable (Apple HIG / Material 48 dp).

### Type scale

Font: system UI stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Values use
`font-variant-numeric: tabular-nums` (and `lining-nums`) so digits don't jitter as they update. Mono only
for raw ids and serial text.

| Role | Size / line-height | Weight | Notes |
|---|---|---|---|
| Hero value | 48 / 52 | 600 | One per page max (main value, big gauge readout). Letter-spacing −0.02em |
| Value | 32 / 36 | 600 | Value tiles, gauge centre |
| Value (compact) | 22 / 28 | 600 | Small tiles, graph last-value |
| Page title | 20 / 28 | 600 | Header strip only |
| Section heading | 15 / 20 | 600 | Text widget "heading" style |
| Body | 14 / 20 | 400 | Text widget paragraphs, messages |
| Label | 12 / 16 | 500 | UPPERCASE, letter-spacing 0.06em, `--text-2` |
| Unit / meta | 12-13 / 16 | 400 | `--text-3`, units sit at the value baseline |
| Button | 14 / 20 | 600 | Sentence case |

Scale the value roles down one step on phone (48→36, 32→26) and never below 22 for a primary value.

---

## 3. Widget rules

All widgets share one **card**: `--surface`, 1 px `--border`, `--r-lg`, 16 px padding, a label in the
top-left (Label style). Content fills the card, with no inner borders or nested cards. Status is shown with
a pill or a dot. Never tint the whole card, except a critical alarm tile, which may use `--error-soft`
as its background.

### 3.1 Value tile
- Layout top to bottom: **LABEL** (12, uppercase, `--text-2`), then **value** (32, tabular, `--text`)
  with the **unit** inline after it in 13 / `--text-3`, then an optional sub-line (12, `--text-3`):
  "min 2.1 · max 4.8", "updated 2 s ago", or a delta.
- Left-aligned. Centre a value only in a square tile on its own.
- Fixed decimals per tile (pick from the value's precision), so the width doesn't jump. Show `—` for
  no data. Never show `NaN` or `undefined`.
- Thresholds turn the **value text** amber or red and add a small pill ("High"). The card stays neutral.
- Optional sparkline along the bottom edge: 24 px tall, 1.5 px line in `--text-3`, or the accent when
  the tile is selected.

### 3.2 Gauge
- Prefer a **270° arc or horizontal bar** with a thin track (`--border`, 8 px) and fill in the accent.
  No needles, ticks every 10%, or chrome bezels.
- Shade the **normal range** subtly on the track (HP-HMI analog indicator) and mark limits with small
  ticks in `--warn` / `--error`. The fill turns warn or error only when out of range.
- The value goes in the centre in the Value style, with the unit below. Min and max sit at the arc ends
  in Unit style.

### 3.3 Lamp (true/false)
- Render as a **status pill**, not a big coloured circle: a dot (8 px) plus a word on the `*-soft`
  background, coloured text, `--r-full`, 24-28 px tall. Example: `● Running`, `● Gripper closed`.
- Words come from the config (on/off text). Default to "On"/"Off", never "true"/"false".
- **The normal state is grey** (`--surface-raised` background, `--text-2` text). Use green only when
  "on" is the good, noteworthy state, and red or amber only when it is abnormal. The author picks which
  state is abnormal.
- Several lamps in one tile stack as a list: label on the left, pill on the right, 8 px between rows.
- On a state change, a 200 ms colour fade. No blinking, except an unacknowledged fault (1 Hz, optional).

### 3.4 Graph (live line chart)
- Minimal chrome: no chart border, horizontal gridlines only (`--border`, 3-4 lines), no vertical grid.
  Axis labels in Unit style (`--text-3`). The y-axis sits on the right or is omitted when the range is
  obvious.
- The **last value is prominent**: in the card header at the right (Value compact, series colour), plus
  a 4 px dot at the line's leading edge.
- Line 2 px with round joins. Optional area fill at 8-12% of the series colour. No markers on every point.
- Limits and setpoints are dashed 1 px lines in warn or error with a tiny right-aligned label.
- Legend only for 2+ series, as inline chips in the header. The time window is shown as text
  ("Last 60 s").
- Height ≥ 160 px (phone) / 200 px (tablet+). Don't make a graph shorter than its width / 4.

### 3.5 Image (camera frame)
- The image **fills the card edge to edge** (`object-fit: cover`, card padding 0, radius on the image).
  Lock the card's aspect ratio to the camera's (16:9 or 4:3) so there are no letterbox bands. If the
  aspect is unknown, use `cover` with a centred crop. Never grey bars.
- The label and status sit in an **overlay**: a top-left chip on `rgba(0,0,0,.55)` with white 12 px text
  ("CAMERA · 12 fps"), and an optional top-right live dot. Keep overlays inside a 12 px safe margin.
- When stale (no frame for more than 2× the interval), dim the image to 50% and show "Stale · 4 s" in
  the chip. With no source, show an empty state: an icon plus "No camera frame", in `--text-3` on
  `--surface-raised`.
- A camera is usually the hero. Give it 8 of 12 columns on tablet and desktop.

### 3.6 Button (Run / Stop program)
- **Run = the one primary:** filled `--accent`, white text, 44-48 px tall, `--r-md`, icon plus label
  ("▶ Run"). Size it to its content or its column. Don't make it a full-card coloured block.
- **Stop** is outlined or tonal: `--error-soft` background, `--error` text, same height as Run. Show it
  as the active control only while running. Otherwise disable it (40% opacity) or hide it. Run and Stop
  can share one card side by side, Run first.
- Other actions (Reset, Home) are tonal (`--accent-soft` / `--accent` text) or outlined
  (`--border-strong`).
- Pressed state: darken 8%. Busy state: an inline spinner replaces the icon and the label changes
  ("Starting…"). Disabled controls show why on hover or long-press.
- Destructive actions that can't be undone ask for confirmation. Stop does **not** need confirmation:
  stopping must stay one tap.

### 3.7 Text (heading)
- Default to the Section heading style (15/600, `--text`) with an optional body line (14, `--text-2`),
  on **no card**: transparent, so it reads as a section divider, not a widget.
- Never repeat the page title. The header strip already shows it, so the compiler should drop or warn
  about a first Text widget that matches the page name.

### 3.8 Plugin (embedded web UI)
- The iframe gets the theme: the compiler injects the token set as CSS variables into the plugin
  document (and `?theme=dark|light`, plus a `postMessage({type:'theme', tokens})` for live changes).
  Plugins should paint `background: var(--surface)` (or transparent) and use `--text*` and `--accent`.
- The plugin sits in a standard card with padding 0 and the radius clipped. Don't nest a second dark
  panel inside a light card. If a plugin can't be themed, the card switches to a matching surface with
  a label strip, so the mismatch looks intended.
- Lock the aspect ratio to the plugin's content (square for a board-style UI) so it doesn't float in
  empty space. Usually the hero.

---

## 4. Layout

**Grid.** 12 columns. Gutter 12/16, page padding 16/24/32 (phone/tablet/desktop). Row unit 8 px. Card
heights snap to multiples of 8, and the cards in a row share a height.

**Breakpoints.** Phone < 600 px: 4-column grid (each widget spans 2 or 4, so 1-2 per row).
Tablet 600-1099: 8 columns. Desktop ≥ 1100: 12 columns. Authors place widgets on 12 columns. The
compiler reflows in source order: the hero goes full width on phone, value tiles go two per row,
buttons go into a sticky bottom bar on phone.

**Page composition (top to bottom).**
1. **Header strip** (no card, 56-64 px): page title (Page title style) + program **status pill**
   ("Running", "Idle", "Fault") + cycle/time meta in `--text-3` on the left. The primary action(s) on
   the right. This is the only place the title appears.
2. **Hero row:** the main widget (camera, plugin, main graph) at 8 columns, with a 4-column side stack of
   2-4 key value tiles or lamps.
3. **Supporting row(s):** value tiles at 3 columns each (4 per row) or graphs at 6 columns each.
4. **Detail:** longer lists, secondary graphs, notes.

**Rules.**
- No empty grid quadrants. If a row isn't full, widen the cards in it so it is.
- Value tiles in a row share a size. Don't mix 2-, 3- and 5-column tiles in one row.
- Group related widgets under a Text heading rather than adding boxes inside boxes.
- Keep 4-8 key values on the first screen. More than that belongs to a second page (ISA-101: overview
  first, detail on demand).
- Controls stay in predictable places: the header on desktop, the bottom bar on phone. Never mid-page
  between data.
- Respect safe-area insets in the WebView. On phone, the sticky action bar sits above the home indicator.

---

## 5. Review checklist

Score a screenshot against these. Each "no" is a defect.

1. Is the page grey or neutral, with saturated colour appearing **only** for status and the one primary
   action?
2. Does every coloured element mean ok, warn, error, info or interactive, and is each colour used for
   exactly one of those?
3. Is there exactly **one** filled primary button, with Stop and others tonal or outlined (no giant red
   or green blocks)?
4. Can you tell the program state (running/idle/fault) within 2 seconds from the header pill?
5. Does the page title appear once, in the header strip?
6. Is there a clear hero widget, with value tiles visually subordinate to it?
7. Are values large and tabular, with small uppercase labels and lighter units, and no `NaN` or raw
   `true`/`false`?
8. Does the camera image fill its card with no letterbox bands, with its label as an overlay?
9. Does the embedded plugin match the page theme (no mismatched dark or light panel)?
10. Do all cards share radius, border, padding and label position, with edges and baselines aligned?
11. Is there no large empty area, and are rows full without stretched or orphaned cards?
12. Are graphs minimal (horizontal grid only, last value visible, no chart border)?
13. Are lamps pills with words, grey in the normal state?
14. At phone width, does it reflow to 1-2 columns with controls reachable at the bottom and no horizontal
    scroll?
15. In both themes, does all text pass contrast, and does nothing rely on colour alone?

---

## 6. References

- ISA-101 / High Performance HMI overviews: <https://www.automation.com/article/the-high-performance-hmi>,
  <https://control.com/technical-articles/going-gray/>,
  <https://docs.tatsoft.com/display/FX/High+Performance+HMI+Compliance+How-to>
- Hollifield, Oliver, Nimmo, Habibi, *The High Performance HMI Handbook* (PAS, 2008)
- Grafana dashboard best practices:
  <https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/>
- Home Assistant tile card: <https://www.home-assistant.io/dashboards/tile/>. Mushroom cards:
  <https://github.com/piitaya/lovelace-mushroom>
- Apple HIG, widgets and charts: <https://developer.apple.com/design/human-interface-guidelines/widgets>,
  <https://developer.apple.com/design/human-interface-guidelines/charts>
- Material 3, type scale and buttons: <https://m3.material.io/styles/typography/type-scale-tokens>,
  <https://m3.material.io/components/buttons/guidelines>
- Vercel Geist colour system (step-based backgrounds, borders, text): <https://vercel.com/geist/colors>
- Linear UI redesign notes (calm dark surfaces, reduced colour): <https://linear.app/now/how-we-redesigned-the-linear-ui>
