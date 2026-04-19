# Mobile Controls — Design

Status: approved (2026-04-18)
Scope: make the game fully playable on phones and touch devices, with responsive HUD and gesture-based camera. Desktop behavior stays identical.

## Goals

- Camera pan/zoom/select via touch, with parity to mouse.
- Pinch-to-zoom, double-tap-to-zoom, floating +/- buttons.
- Responsive HUD for small screens and portrait orientation.
- Explicit "touch mode" toggle so touch-capable desktops can opt in.
- Zero regressions for keyboard/mouse flow.

## Non-goals

- Advanced gestures (swipe to navigate panels, pull-to-refresh, two-finger rotate).
- Forced orientation or custom rotation handling.
- Any camera rotation (not supported today).

## Section 1 — Detection & UI mode

**New config** in `src/core/config.ts`:

```ts
ui: {
  ...,
  touchMode: 'auto' | 'on' | 'off'  // default 'auto'
}
```

Exposed in `settings-panel.ts` as a select with the three options.

**Derived runtime state** in new `src/core/ui-mode.ts`:

```
touch       = (config.ui.touchMode === 'on')
              || (config.ui.touchMode === 'auto'
                  && matchMedia('(pointer: coarse)').matches
                  && window.innerWidth <= 1024)
orientation = matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'
size        = innerWidth < 600 ? 'sm'
            : innerWidth < 1024 ? 'md'
            : 'lg'
```

The module keeps `<body>` classes in sync (`touch`, `portrait`/`landscape`, `sm`/`md`/`lg`), listening to `resize`, `orientationchange`, and config changes. It emits a `orbital:ui-mode-changed` custom event for JS consumers and exposes `isTouchMode()`, `getUiMode()` helpers.

Rationale: separating `touch` from `size` lets a touch-enabled tablet in landscape keep the desktop HUD while still using gestures. A phone in landscape at 900px needs the mobile HUD despite being landscape.

## Section 2 — Canvas input (PointerEvents refactor)

Target file: `src/core/player.ts` (replacing the handlers at lines 206–366).

**State** (file-scope, inside `configurarCamera`):

```
activePointers: Map<number, { x, y, startX, startY, startTime, button }>
pinch: { initialDist, initialZoom, anchorSx, anchorSy } | null
lastTap: { time, x, y } | null
```

**Handler: `pointerdown`**
- Call `setPointerCapture(e.pointerId)`.
- Record in `activePointers`.
- If this is the first pointer:
  - Reproduces today's mouse logic exactly: probe for nave/planeta/sol at the world point; if empty and `e.button === 0`, `cameraDragging = true`.
  - Mouse buttons 1/2 still force `cameraDragging`.
- If this is the second pointer:
  - `cameraDragging = false`.
  - `pinch = { initialDist = distance(p1,p2), initialZoom = camera.zoom, anchorSx/Sy = midpoint }`.
- Third+ pointers: ignored.

**Handler: `pointermove`**
- Update pointer position in the map.
- If `pinch`: compute `dist / initialDist`, call `aplicarZoom(initialZoom * ratio, anchorSx, anchorSy)`. No pan during pinch.
- Else if 1 pointer and `cameraDragging`: pan exactly as today (`camera.x -= dx / zoom`, etc.).

**Handler: `pointerup` / `pointercancel`**
- Remove pointer from map.
- If pinch was active and pointers now == 1: end pinch, do NOT resume drag until a fresh gesture.
- If pointers now == 0 and it was NOT a pinch gesture:
  - Compute `movedDist` from start. If `< 5`: run the existing click-arbitration switch (selection, waypoint, command modes) unchanged.
  - Double-tap check: if it was a tap (<5px, <250ms) AND `lastTap` exists with `Δt < 300ms` and `Δdist < 40px`, call `aplicarZoom(zoom * 1.5, sx, sy)` and clear `lastTap`. Else store `lastTap`.
  - `cameraDragging = false`.

**Wheel handler**: unchanged.

**`contextmenu`**: `preventDefault` kept (also suppresses long-press context menu on mobile).

**CSS**: `#canvas { touch-action: none; }` to suppress browser scroll/zoom during gestures.

**Desktop parity**: `e.pointerType === 'mouse'` combined with `e.button` preserves current mouse semantics (left-drag on empty, middle/right forced drag). Keyboard unaffected.

**Floating zoom buttons** — new `src/ui/zoom-controls.ts`:
- Two 44×44 HTML buttons labeled `+` / `−`, fixed in the lower-right area above the minimap.
- Only mounted when `isTouchMode()` is true; re-evaluated on `orbital:ui-mode-changed`.
- Call existing `zoomIn()` / `zoomOut()` from `player.ts`.

## Section 3 — Responsive HUD

Active layout: when `body.touch.sm` OR (`body.touch.md.portrait`). Desktop + touch-on in `lg` keeps normal HUD.

**Sidebar** (`src/ui/sidebar.ts`):
- In mobile layout: off-canvas drawer on the left, closed by default.
- New hamburger button (44×44 SVG), upper-left, fixed.
- Opens with `transform: translateX` animation, semitransparent backdrop; closes on backdrop tap or item select.
- Desktop: unchanged.

**Bottom sheets** — new helper `src/ui/bottom-sheet.ts`:
- Applies class-based layout to `planet-drawer`, `ship-panel`, `build-panel`, `colonizer-panel` containers when `body.touch.sm` is set.
- CSS: `position: fixed; left/right: 0; bottom: 0; max-height: 85vh;` with slide-up `translateY(100%) → 0` animation.
- Closes via existing X button (no drag-handle in this phase).
- Landscape mobile (`touch.sm.landscape`): panels remain side-docked as today (they already handle it). Only portrait switches to bottom sheet.

**Top HUD** (`hud-layout.ts`, `resource-bar.ts`, `credits-bar.ts`, `empire-badge.ts`):
- CSS-only tweaks under `body.touch.sm[.portrait]`: reduced padding, smaller font, stacked/hidden less-critical info (credits-bar collapses to bare number).

**Minimapa** (`src/ui/minimapa.ts`): size reduced to ~120px in `sm`.

**Touch targets**: CSS rule under `body.touch` ensuring every button is at least 44×44 (padding top-up on smaller ones).

**Modals / menus** (`main-menu`, `new-world-modal`, `save-modal`, `settings-panel`, `pause-menu`, `lore-modal`, `confirm-dialog`, `colony-modal`): responsive CSS pass — `100vw`/`100vh` with internal scroll in `sm`; min button height 44px.

## Section 4 — Testing & rollout

**Unit tests (vitest)**:
- `src/core/__tests__/ui-mode.test.ts` — covers all combinations of `touchMode` × `pointer: coarse` × `innerWidth` × `orientation`.
- `src/core/input/__tests__/pointer-gestures.test.ts` — pure helpers extracted from the handlers for pinch ratio, double-tap window, tap-vs-drag threshold.

**Manual test matrix**:
1. Desktop mouse: pan (empty drag), wheel zoom, click select, right/middle drag, waypoint mode — unchanged from current.
2. Chrome DevTools device toolbar: iPhone 14, Pixel 7, iPad portrait + landscape. Hamburger, bottom sheet, pinch (Ctrl+drag emulation), +/- buttons, double-tap.
3. Physical device (if available): latency and real pinch.

**Performance**: PointerEvents shares the same hot path; no new per-frame allocations. No expected perf impact.

**Rollout order**:
1. Section 1 (detection + body classes + settings field) — invisible by itself.
2. Section 2 (PointerEvents refactor + `touch-action: none` + zoom-controls) — test desktop parity thoroughly.
3. Section 3 (HUD CSS + hamburger + bottom-sheet helper).
4. Commit + push after each section per the project's auto-commit convention.

## Files touched

New:
- `src/core/ui-mode.ts`
- `src/ui/zoom-controls.ts`
- `src/ui/bottom-sheet.ts`
- `src/core/__tests__/ui-mode.test.ts`
- `src/core/input/__tests__/pointer-gestures.test.ts`

Modified:
- `src/core/config.ts` — `ui.touchMode` field.
- `src/core/player.ts` — replace mouse listeners with pointer handlers; extract pinch/tap helpers.
- `src/ui/settings-panel.ts` — touchMode select.
- `src/ui/sidebar.ts` — hamburger + drawer behavior.
- `src/ui/hud-layout.ts`, `resource-bar.ts`, `credits-bar.ts`, `empire-badge.ts`, `minimapa.ts` — responsive CSS.
- `src/ui/planet-drawer.ts`, `ship-panel.ts`, `build-panel.ts`, `colonizer-panel.ts` — opt into bottom-sheet classes.
- `src/ui/main-menu.ts`, `new-world-modal.ts`, `save-modal.ts`, `pause-menu.ts`, `lore-modal.ts`, `confirm-dialog.ts`, `colony-modal.ts` — responsive modal CSS.
- Global stylesheet — `touch-action: none` on canvas, 44px touch targets.
