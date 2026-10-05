# UI Kit — migration conventions

Standardized components + design tokens for every screen. Import everything from
`@/src/components/ui/kit`. **Do not edit files in this folder** — if a screen needs
something the kit lacks, compose locally from tokens and note it in your report.

## Tokens (use these, never hardcode)

```ts
import { colors, spacing, radii, type, shadows } from "@/src/components/ui/kit";
```

- `colors` — `background` (page), `surface` (cards), `surfaceMuted` (inputs/wells),
  `border`, `text` / `textSecondary` / `textMuted` / `textFaint`,
  `accent` / `accentSoft` / `accentBorder` / `accentFaded`, `success`/`warning`/`danger`
  (+ `*Soft` fills and matching `*Border` tints), `surfaceDark`/`onSurfaceDark`/
  `overlayDark` (toasts, floating toolbars over camera feeds), `onAccent`, `overlay`.
  Mapping from hex you'll encounter: `#f3f4f6`→background, `#fff`→surface,
  `#f9fafb`→surfaceMuted, `#e5e7eb`→border, `#111827`→text, `#374151`→textSecondary,
  `#6b7280`→textMuted, `#9ca3af`→textFaint, `#2563eb`→accent, `#eff6ff`→accentSoft,
  `#16a34a`→success, `#dc2626`→danger.
- `accents` — secondary tint families with the same base/`*Soft`/`*Border` shape:
  `purple` (variables/expressions/category tints — replaces per-file
  `CATEGORY_PURPLE` constants; `#7c3aed`→purple, `#f5f3ff`→purpleSoft,
  `#ddd6fe`→purpleBorder), `cyan` (vision/conditions/network — `#0891b2`/`#ecfeff`),
  `orange` (strings/axes — `#ea580c` or `#f97316`→orange, `#fff7ed`→orangeSoft).
- `spacing` — xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32. Round odd values to the
  nearest step (13→12, 14→12 or 16 by eye).
- `radii` — sm 9 (inputs, small buttons) · md 12 (tiles, buttons) · lg 14 (cards) ·
  xl 20 (modals) · pill.
- `type` — `pageTitle`, `title`, `sectionLabel` (handles uppercase — pass normal
  casing), `body`, `subtitle`, `caption`, `mono` (coordinates/IPs/serials).
- `shadows` — `soft` (cards), `raised` (modals). Never write shadow* props by hand.

## Components

| Component | Use for | Key props |
|---|---|---|
| `Screen` | Page wrapper: bg + padding + wide gutter | `scroll` (default true), `padded`, `contentStyle` |
| `Card` | White rounded surface, optionally pressable | `onPress?`, `padded` (default true), `style` |
| `SectionHeader` | Uppercase micro-label above a card group | `title`, `right?` |
| `ListRow` | Icon tile + title/subtitle + accessory row | `title`, `subtitle?`, `icon?`, `iconColor?`, `right?`, `chevron?`, `onPress?`, `card` (false = flat row inside a Card) |
| `IconTile` | Rounded square icon holder | `color` (bg, default accentSoft), `size` (36/40/44) |
| `Button` | All buttons; replaces ActionButton | `label`, `variant` (`primary`/`secondary`/`destructive`/`dangerSoft`/`ghost`/`dashed`), `size` (`md`/`sm`), `icon?`, `loading?`, `disabled?` — icon color via `buttonTextColor(variant)`. `dashed` replaces local dashed "add new" CTAs; `dangerSoft` the soft-red actions. Disabled/loading now dims via opacity, so it survives a `style` background override. |
| `StatusPill` | Connected/Offline/Running/count badges | `label`, `tone` (`success`/`danger`/`warning`/`accent`/`neutral`), `color?`+`background?` (custom tint family, e.g. `accents.purple`/`purpleSoft`), `dot?`, `icon?` |
| `EmptyState` | Empty lists, scanning/waiting states | `icon?`, `title`, `subtitle?`, `action?` |
| `Input` | Text inputs (focus ring included) | TextInput props (`style` takes TextStyle, e.g. `type.mono`), `icon?` (leading), `clearable?` (trailing ✕ — search boxes) |
| `FormRow` | Labeled field on config screens | `label`, `hint?`, `inline?` (switch rows) |
| `Divider` | Hairline between flat rows in a Card | `inset?` (aligns past IconTile), `vertical?` (between columns) |
| `SegmentedControl` | Mode/speed/direction switches — replaces local segmented rows | `options` (`{label,value}[]` or `string[]`), `value`, `onChange`, `size?` |
| `Chip` / `ChipGroup` | Compact toggle pickers: speed steps, steps-per-rev presets | `label`, `selected`, `onPress`, `tint?` (`[fg, softBg]` pair, e.g. `[accents.purple, accents.purpleSoft]`) |
| `RadioRow` | Selectable rows: active tool/local, base-point pickers | `title`, `subtitle?`/`subtitleNode?`, `selected`, `onPress`, `right?` — stack in a Card with Dividers |

`ListRow` also takes `titleColor?` (accent-colored action rows) and
`subtitleLines?` (default 1) for two-line descriptions.

Keep using existing shared pieces where a screen already has them:
`ProgramListLayout`, `AppAlert`, `NotConnectedOverlay`,
`AnimatedPressable`, `useWideContent`/`usePaneLayout` from `responsive.ts`.
`Screen` already applies `useWideContent` — don't apply it twice; keep manual
`useWideContent` only in screens that can't adopt `Screen` (FlatList-driven or
two-pane screens).

## Rules

1. **No new hardcoded hex colors.** Map to `colors.*` (table above). A color with
   real meaning that has no token (e.g. a device-type tint) may stay, but note it.
2. **No ad-hoc `shadow*`/`elevation`** — use `shadows.soft`/`shadows.raised`.
3. **No new one-off buttons/badges/empty states** — use the kit ones.
4. Preserve behavior exactly: handlers, navigation, disabled logic, overlays,
   focus/keyboard props. This is a restyle, not a rewrite — keep diffs minimal
   and do not restructure component logic.
5. Keep phone layout working: everything here is responsive-neutral; don't remove
   `usePaneLayout` branches.
6. Don't edit the kit, `NavRail.tsx`, or `app/(tabs)/_layout.tsx`.

## Example migration

Before:
```tsx
<ScrollView style={{ flex: 1, backgroundColor: "#f3f4f6" }} contentContainerStyle={[{ padding: 16 }, wideContent]}>
  <Text style={styles.sectionLabel}>DEVICES</Text>
  <TouchableOpacity style={styles.navCard} onPress={open}>
    <View style={[styles.iconTile, { backgroundColor: "#eff6ff" }]}><Cpu size={20} color="#2563eb" /></View>
    <View style={{ flex: 1 }}>
      <Text style={styles.name}>Nano 1</Text>
      <Text style={styles.sub}>8 inputs</Text>
    </View>
    <View style={styles.badgeOn}><Text style={styles.badgeText}>Connected</Text></View>
  </TouchableOpacity>
</ScrollView>
```

After:
```tsx
<Screen>
  <SectionHeader title="Devices" />
  <ListRow
    title="Nano 1"
    subtitle="8 inputs"
    icon={<Cpu size={20} color={colors.accent} />}
    onPress={open}
    right={<StatusPill label="Connected" tone="success" dot />}
  />
</Screen>
```

## Makeover Playbook (page redesign pass)

The navigator's stock header is now **disabled app-wide** (`headerShown: false`
in `app/(tabs)/_layout.tsx`). Every page owns its chrome via `PageHeader`.

### Per-page checklist

1. **PageHeader first.** Structure every page as:
   ```tsx
   <View style={{ flex: 1, backgroundColor: colors.background }}>
     <PageHeader title="Configure" subtitle="Motion and homing settings"
                 right={<Button label="Save" size="sm" … />} />
     <Screen> …content… </Screen>   // or your own ScrollView/panes
   </View>
   ```
   - Wide: renders a breadcrumb trail (ancestors tappable) + large title.
   - Narrow: safe-area bar; back affordance shows the **parent's name**
     ("‹ Program"), never a bare arrow; connection status appears on the right
     when no `right` actions are passed.
   - Crumbs default from the route path via `routeLabels.ts` — **add labels
     there for new routes**. Pass `crumbs={[…]}` explicitly when the logical
     hierarchy is deeper than the flat route (e.g. Program › Vision › Zone).
   - Every page uses `PageHeader` (SubPageHeader is retired and deleted).
     Guarded exits (unsaved-changes prompts) use `onBack`/`onNavigate`.
   - Exemplar: `app/(tabs)/robot/connected-robot.tsx`.
2. **Explain the page.** Give PageHeader a one-line `subtitle` stating what the
   page is for. Add a `HintBanner (RETIRED — do not add; user prefers InfoTip ⓘ only) id="…"` under the header on pages whose
   workflow is non-obvious (first-use guidance; dismissal lasts the session).
   Attach `InfoTip text="…"` beside individual settings/labels that need a
   sentence of context (`SectionHeader right={<InfoTip …/>}` fits).
3. **Show information.** Prefer showing live data over blank space: StatTile
   rows for dashboard numbers (`<StatTile label value icon tint hint mono/>`),
   StatusPill for states, `type.mono` for technical readouts. Empty lists get
   `EmptyState` with a next-step action, never a bare "none".
4. **Icons for scanning.** `SectionHeader icon={…}` on long pages, IconTile on
   list rows, icons in primary buttons only when they clarify (lucide icons,
   16–20px, tokens for color).
5. **Wide layout.** No single skinny column in a huge window: two-column
   form/detail+aside splits (existing `wideRow`/left-right col patterns),
   StatTile rows, sensible max widths. Keep `useWideContent` alignment so
   headers and content share the gutter (PageHeader applies it itself).
6. **Narrow layout.** No horizontal overflow; touch targets ≥44px; primary
   action reachable at the bottom, not only in the header; verify at ~390px.
7. **Spacing rhythm.** Screen's `gap` handles vertical rhythm between cards —
   remove per-card `marginBottom`. Inside cards: spacing.md between rows,
   spacing.lg card padding. Never reintroduce hex colors or ad-hoc shadows.

### Do not touch
`kit/**` and `NavRail.tsx` are owned by the kit maintainer. Request gaps in
your report instead of editing them.


## Position displays (X/Y/Z/RZ, joints)
Use `PositionReadout` — a CNC DRO-style vertical list (axis tile left,
right-aligned tabular mono value, optional unit) — NEVER a grid of StatTiles.
`size="lg"` for jog/DRO prominence, `card={false}` to embed in an existing Card.
HintBanner is retired app-wide: pages explain themselves with InfoTip (the ⓘ icon) only.
