let _injected = false;

/**
 * Layout-compact rules gate on `body.touch` (and size-md portrait)
 * regardless of touch, so a narrow desktop window also adapts. Only
 * gesture/affordance rules (large tap targets) stay gated on `.touch`.
 */
export function injectMobileStyles(): void {
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* ── HUD base unit: bump back up so derived text (calc * 0.55/0.8/1.1)
       stays legible across ALL panels. Components that ballooned
       (empire-badge) get explicit size overrides below — don't punish
       every other panel for one outlier. */
    body.touch,
    body.touch,
    body.touch {
      --hud-unit: clamp(18px, 2.4vmin, 22px) !important;
      --hud-margin: clamp(10px, 2vmin, 18px) !important;
    }
    /* Mobile-UA hooks (not the planet drawer — that's desktop side-panel
       on every device now). */
    body.touch .mobile-menu-btn { display: flex !important; }
    body.touch .menu-save-delete { opacity: 1 !important; padding: 6px; }
    body:has(.main-menu:not(.hidden)).mobile-ua .mobile-menu-btn {
      display: none !important;
    }

    /* Empire badge is the only top-HUD piece that balloons when
       --hud-unit grows — pin it to a fixed compact size. */
    body.touch .empire-badge {
      min-height: 46px !important;
      padding: 6px 10px !important;
      font-size: 13px !important;
      gap: 8px !important;
    }
    body.touch .empire-badge .empire-crest {
      width: 28px !important;
      height: 28px !important;
    }
    body.touch .empire-badge .empire-name {
      font-size: 13px !important;
    }
    body.touch .empire-badge .empire-level {
      font-size: 13px !important;
    }

    /* ── Global floor: nothing on mobile goes below 13px. Catches any
       rogue .calc(--hud-unit * 0.55) = 9.9px text we missed. */
    body.touch :where(span, div, label, p, button, h1, h2, h3, h4, h5, h6, li, td, th) {
      font-size: max(13px, 1em);
    }
    body.touch input,
    body.touch select,
    body.touch textarea {
      font-size: 16px;
    }

    /* Zoom controls hidden everywhere on touch — pinch + double-tap cover zooming. */
    body.touch .zoom-controls {
      display: none !important;
    }

    /* ── Touch targets — only for the big actionable buttons (modals,
       primary menu actions). Inline icon buttons keep their natural size
       so they don't dwarf nearby labels. */
    body.touch .menu-btn,
    body.touch .pm-btn,
    body.touch .nwm-btn,
    body.touch .confirm-btn,
    body.touch .settings-select-display,
    body.touch .sidebar-btn {
      min-height: 40px;
    }

    /* ── Top HUD: SINGLE row on mobile.
       Layout: [hamburger] [resource-bar (centered/flex)] [credits-bar]
       The empire-badge is hidden in narrow portrait — its info (faction +
       level) is recoverable from the pause menu and steals horizontal
       space the resource-bar needs more. */
    body.touch.portrait .resource-bar,
    body.touch.portrait .credits-bar {
      font-size: 13px !important;
      padding: 4px 8px !important;
      line-height: 1.2 !important;
      top: calc(12px + var(--safe-top, 0px)) !important;
    }
    body.touch.portrait .empire-badge {
      display: none !important;
    }
    body.touch.portrait .credits-clock,
    body.touch.portrait .credits-divider {
      display: none !important;
    }

    /* Credits bar — top-right, beside hamburger. Compact. */
    body.touch.portrait .credits-bar {
      right: calc(12px + var(--safe-right, 0px)) !important;
    }

    /* Resource bar — sits between hamburger (left edge ≈56+safe) and the
       credits-bar slot on the right (~95px reserved). CSS positioning
       overrides hud-layout JS for mobile portrait. */
    body.touch.portrait .resource-bar {
      min-height: 38px !important;
      left: calc(64px + var(--safe-left, 0px)) !important;
      right: calc(95px + var(--safe-right, 0px)) !important;
      width: auto !important;
      max-width: none !important;
      transform: none !important;
      justify-content: center !important;
    }
    body.touch .resource-bar .resource-value { font-size: 13px !important; }
    body.touch .resource-bar .resource-text  { font-size: 12px !important; }
    body.touch .resource-bar .resource-rate  { font-size: 11px !important; }
    body.touch.portrait .resource-bar .resource-icon,
    body.touch.portrait .resource-bar img {
      width: 18px !important;
      height: 18px !important;
    }

    /* Landscape on phones — bring back the badge and use the original
       desktop-ish wider layout. */
    body.touch.landscape .empire-badge {
      display: flex !important;
      top: calc(12px + var(--safe-top, 0px)) !important;
      left: calc(64px + var(--safe-left, 0px)) !important;
    }
    body.touch.landscape .resource-bar {
      top: calc(12px + var(--safe-top, 0px)) !important;
    }

    /* ── Modal cards: card feel, not fullscreen slab. */
    body.touch .settings-overlay,
    body.touch .main-menu,
    body.touch .pause-menu,
    body.touch .new-world-modal,
    body.touch .save-modal-backdrop,
    body.touch .lore-modal-backdrop,
    body.touch .confirm-backdrop {
      max-width: 100vw !important;
      max-height: 100dvh !important;
      overflow-y: auto;
    }
    body.touch .lore-modal,
    body.touch .confirm-dialog,
    body.touch .pm-card,
    body.touch .nwm-card,
    body.touch .colony-modal {
      width: min(94vw, 440px) !important;
      /* Kill desktop min-width that would push the card past 94vw on phones. */
      min-width: 0 !important;
      max-width: 94vw !important;
      max-height: 90dvh !important;
      border-radius: 14px !important;
      overflow-y: auto;
      overscroll-behavior: contain;
      font-size: 15px !important;
      box-sizing: border-box;
    }
    body.touch .settings-overlay > * {
      width: min(96vw, 560px) !important;
      min-width: 0 !important;
      max-height: 94dvh !important;
      font-size: 14px !important;
      padding: 12px !important;
      overscroll-behavior: contain;
    }
    /* Renderer-info modal — viewport-clamped on mobile (its desktop min-width
       overflows narrow phones). */
    body.touch .renderer-info-card,
    body.touch .renderer-info-card {
      min-width: 0 !important;
      width: min(94vw, 440px) !important;
      max-height: 90dvh !important;
    }
    /* Settings rows stay on a single line on mobile — label left, control
       right. Tighter gap + smaller font so both fit. */
    body.touch .settings-row {
      flex-direction: row !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 13px !important;
      min-height: 36px !important;
      padding: 6px 0 !important;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    body.touch .settings-row label {
      font-size: 13px !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
    }
    body.touch .settings-row input[type="range"] {
      flex: 0 1 140px !important;
      max-width: 140px !important;
    }
    body.touch .settings-row .value-display {
      font-size: 12px !important;
      min-width: 36px !important;
      text-align: right !important;
    }
    body.touch .settings-tabs {
      gap: 2px !important;
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }
    body.touch .settings-tab {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      font-size: 11px !important;
      padding: 8px 2px !important;
      letter-spacing: 0.04em !important;
      white-space: nowrap !important;
    }
    /* Inline settings host inside main menu — was fixed at calc(--hud-unit * 32)
       which overflows phone widths. Force responsive width. */
    body.touch .menu-settings-host,
    body.touch .menu-settings-host {
      width: 96vw !important;
      max-width: 96vw !important;
    }
    body.touch .settings-title {
      font-size: 16px !important;
    }
    body.touch .settings-section {
      font-size: 11px !important;
      letter-spacing: 0.08em !important;
      margin: 12px 0 6px !important;
    }
    body.touch .settings-footer {
      flex-direction: column !important;
      gap: 6px !important;
      margin-top: 14px !important;
    }
    body.touch .settings-footer button {
      font-size: 13px !important;
      padding: 10px !important;
    }
    body.touch .pm-title,
    body.touch .nwm-title,
    body.touch .confirm-title,
    body.touch .lore-modal-title {
      font-size: 16px !important;
    }
    body.touch .pm-btn,
    body.touch .nwm-btn,
    body.touch .confirm-btn,
    body.touch .menu-btn {
      min-height: 38px !important;
      font-size: 14px !important;
      padding: 8px 12px !important;
      letter-spacing: 0.04em !important;
    }
    body.touch .pm-card {
      padding: 16px 14px !important;
      gap: 8px !important;
      width: min(92vw, 320px) !important;
      min-width: 0 !important;
    }
    body.touch .pm-title {
      font-size: 16px !important;
      margin-bottom: 10px !important;
    }
    body.touch .pm-confirm-msg {
      font-size: 13px !important;
      line-height: 1.4 !important;
    }

    /* ── Build panel cards + tabs: touch-friendly but not bloated. */
    body.touch .build-card {
      min-height: 60px !important;
      min-width: 60px !important;
    }
    body.touch .build-panel .build-tab {
      min-height: 36px !important;
      padding: 6px 10px !important;
      font-size: 13px !important;
    }

    /* Planet drawer on mobile: a CENTERED CARD MODAL with two tabs
       (Planeta + Construir), not fullscreen. Monochromatic, reuses the
       same HUD tokens as every other panel so it's visually consistent. */
    .planeta-drawer-grabber {
      display: none !important;
    }

    /* Black & white modal — no blue accents. */
    body.touch .planeta-drawer,
    body.touch .planeta-drawer {
      position: fixed !important;
      inset: auto !important;
      top: 50% !important;
      left: 50% !important;
      right: auto !important;
      bottom: auto !important;
      width: min(94vw, 420px) !important;
      max-width: 94vw !important;
      min-width: 0 !important;
      height: auto !important;
      max-height: 82dvh !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 1px solid rgba(255,255,255,0.5) !important;
      border-radius: 14px !important;
      background: #000 !important;
      box-shadow:
        0 8px 32px rgba(0,0,0,0.85),
        0 0 0 1px rgba(0,0,0,0.6) !important;
      display: flex !important;
      flex-direction: column !important;
      z-index: 950 !important;
      overflow: hidden !important;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(0.88) !important;
      transition:
        opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        transform 280ms cubic-bezier(0.2, 0.9, 0.2, 1.05),
        visibility 0s linear 280ms;
    }
    body.touch .planeta-drawer.visible,
    body.touch .planeta-drawer.visible {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      transform: translate(-50%, -50%) scale(1) !important;
      transition:
        opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        transform 280ms cubic-bezier(0.2, 0.9, 0.2, 1.05),
        visibility 0s linear 0s !important;
    }

    /* Close button — black & white, no accent. */
    body.touch .planeta-drawer-close,
    body.touch .planeta-drawer-close {
      display: flex !important;
      position: absolute;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      min-width: 32px;
      min-height: 32px;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.25);
      color: rgba(255,255,255,0.7);
      border-radius: 6px;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      touch-action: manipulation;
      z-index: 3;
      transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
    }
    body.touch .planeta-drawer-close:hover,
    body.touch .planeta-drawer-close:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-color: rgba(255,255,255,0.7);
    }

    /* Tabs row — black & white pill buttons. */
    body.touch .planeta-drawer-tabs,
    body.touch .planeta-drawer-tabs {
      display: grid !important;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 10px 10px 6px 10px;
      background: transparent;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    .planeta-drawer-tab {
      appearance: none;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.02);
      color: rgba(255,255,255,0.55);
      font-family: var(--hud-font);
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      min-height: 36px;
      transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
    }
    .planeta-drawer-tab:hover:not(.active) {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.85);
    }
    .planeta-drawer-tab.active {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-color: #fff;
    }

    body.touch .planeta-drawer-head,
    body.touch .planeta-drawer-head {
      padding: 14px 48px 10px 16px !important;
      gap: 10px !important;
    }
    body.touch .planeta-drawer-body,
    body.touch .planeta-drawer-body {
      flex: 1 1 auto !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      -webkit-overflow-scrolling: touch !important;
      touch-action: pan-y !important;
      padding: 12px 16px 16px !important;
    }
    body.touch .planeta-drawer-build,
    body.touch .planeta-drawer-build {
      flex: 1 1 auto !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      -webkit-overflow-scrolling: touch !important;
      padding: 8px 8px 16px !important;
    }

    /* Tab-switch animation between PLANETA and CONSTRUIR — fade up. */
    @keyframes planeta-drawer-tab-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .planeta-drawer-body.planeta-tab-anim,
    .planeta-drawer-build.planeta-tab-anim {
      animation: planeta-drawer-tab-in 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .planeta-drawer-body.planeta-tab-anim,
      .planeta-drawer-build.planeta-tab-anim {
        animation: none;
      }
    }

    /* Build-panel embedded inside the Construir tab — strip its floating
       panel chrome, it inherits the drawer card now. */
    .build-panel.embedded {
      position: static !important;
      width: 100% !important;
      max-width: 100% !important;
      max-height: none !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      top: auto !important;
      transform: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      border: none !important;
      background: transparent !important;
      animation: none !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }
    /* Hide the standalone build-panel on mobile — completely. The embedded
       copy inside .planeta-drawer-build is force-shown by the rule below. */
    body.touch .build-panel,
    body.touch .build-panel {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
    }
    body.touch .planeta-drawer-build .build-panel,
    body.touch .planeta-drawer-build .build-panel {
      display: flex !important;
      flex-direction: column !important;
      visibility: visible !important;
      pointer-events: auto !important;
      opacity: 1 !important;
      width: 100% !important;
    }

    /* ─────────────────────────────────────────────────────────────────
       Mobile-optimized PLANETA tab content. Compact cards, tighter
       padding, B&W color treatment. Same look across both items so the
       modal feels like one unified surface. */
    body.touch .planeta-drawer-body .planeta-card,
    body.touch .planeta-drawer-body .planeta-card {
      background: rgba(255,255,255,0.03) !important;
      border: 1px solid rgba(255,255,255,0.18) !important;
      border-radius: 8px !important;
      padding: 10px 12px !important;
      margin-bottom: 10px !important;
    }
    body.touch .planeta-drawer-body .planeta-card:last-child,
    body.touch .planeta-drawer-body .planeta-card:last-child {
      margin-bottom: 0 !important;
    }
    body.touch .planeta-drawer-body .planeta-card-title,
    body.touch .planeta-drawer-body .planeta-card-title {
      font-size: 11px !important;
      letter-spacing: 0.12em !important;
      text-transform: uppercase !important;
      color: rgba(255,255,255,0.5) !important;
      margin: 0 0 8px 0 !important;
    }
    /* Resources grid — 3 columns evenly spaced. */
    body.touch .planeta-resources-grid,
    body.touch .planeta-resources-grid {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 8px !important;
    }
    body.touch .planeta-resource,
    body.touch .planeta-resource {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 2px !important;
      padding: 6px 4px !important;
      background: rgba(255,255,255,0.02) !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      border-radius: 6px !important;
    }
    body.touch .planeta-resource-icon,
    body.touch .planeta-resource-icon {
      width: 22px !important;
      height: 22px !important;
      color: rgba(255,255,255,0.7) !important;
    }
    body.touch .planeta-resource-icon svg,
    body.touch .planeta-resource-icon svg {
      width: 100% !important;
      height: 100% !important;
    }
    body.touch .planeta-resource-value,
    body.touch .planeta-resource-value {
      font-family: var(--hud-font);
      font-size: 16px !important;
      color: #fff !important;
      font-variant-numeric: tabular-nums !important;
      line-height: 1.1 !important;
    }
    body.touch .planeta-resource-label,
    body.touch .planeta-resource-label {
      font-size: 10px !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
      color: rgba(255,255,255,0.45) !important;
    }
    /* Infrastructure rows — label/value pairs in tight rows. */
    body.touch .planeta-stats-row,
    body.touch .planeta-stats-row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 6px 0 !important;
      border-bottom: 1px solid rgba(255,255,255,0.06) !important;
      gap: 12px !important;
    }
    body.touch .planeta-stats-row:last-child,
    body.touch .planeta-stats-row:last-child {
      border-bottom: none !important;
    }
    body.touch .planeta-stats-label,
    body.touch .planeta-stats-label {
      font-size: 12px !important;
      color: rgba(255,255,255,0.55) !important;
      letter-spacing: 0.04em !important;
    }
    body.touch .planeta-stats-value,
    body.touch .planeta-stats-value {
      font-family: var(--hud-font);
      font-size: 13px !important;
      color: #fff !important;
      font-variant-numeric: tabular-nums !important;
    }

    /* ─────────────────────────────────────────────────────────────────
       Mobile-optimized CONSTRUIR tab content. Build cards become a
       responsive 4-column grid (3 on very narrow phones), B&W tier/cost,
       no blue accent. */
    body.touch .planeta-drawer-build .build-tabs,
    body.touch .planeta-drawer-build .build-tabs {
      display: flex !important;
      gap: 4px !important;
      padding: 0 0 10px 0 !important;
      border-bottom: 1px solid rgba(255,255,255,0.1) !important;
      margin-bottom: 10px !important;
    }
    body.touch .planeta-drawer-build .build-tab,
    body.touch .planeta-drawer-build .build-tab {
      flex: 1 1 0 !important;
      font-size: 11px !important;
      padding: 8px 6px !important;
      letter-spacing: 0.1em !important;
      min-height: 34px !important;
      background: rgba(255,255,255,0.02) !important;
      border: 1px solid rgba(255,255,255,0.18) !important;
      color: rgba(255,255,255,0.55) !important;
      border-radius: 6px !important;
    }
    body.touch .planeta-drawer-build .build-tab.active,
    body.touch .planeta-drawer-build .build-tab.active {
      background: rgba(255,255,255,0.12) !important;
      color: #fff !important;
      border-color: #fff !important;
    }
    /* Hide empty placeholder cards — they only clutter the grid on
       mobile where space is tight. Real cards expand to fill instead. */
    body.touch .planeta-drawer-build .build-card.empty,
    body.touch .planeta-drawer-build .build-card.empty {
      display: none !important;
    }
    body.touch .planeta-drawer-build .build-grid-wrap,
    body.touch .planeta-drawer-build .build-grid-wrap {
      padding: 0 !important;
      margin: 0 !important;
    }
    body.touch .planeta-drawer-build .build-grid,
    body.touch .planeta-drawer-build .build-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)) !important;
      gap: 8px !important;
      padding: 0 !important;
      justify-content: start !important;
    }
    body.touch .planeta-drawer-build .build-card,
    body.touch .planeta-drawer-build .build-card {
      width: auto !important;
      min-width: 0 !important;
      height: auto !important;
      aspect-ratio: 1 / 1.15;
      padding: 8px 6px !important;
      background: rgba(255,255,255,0.04) !important;
      border: 1px solid rgba(255,255,255,0.22) !important;
      border-radius: 8px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: space-between !important;
      box-sizing: border-box !important;
      transition: background-color 120ms ease, border-color 120ms ease, transform 100ms ease !important;
    }
    body.touch .planeta-drawer-build .build-card:hover:not(.disabled),
    body.touch .planeta-drawer-build .build-card:hover:not(.disabled),
    body.touch .planeta-drawer-build .build-card:active:not(.disabled),
    body.touch .planeta-drawer-build .build-card:active:not(.disabled) {
      background: rgba(255,255,255,0.10) !important;
      border-color: #fff !important;
      transform: translateY(-1px) !important;
    }
    body.touch .planeta-drawer-build .build-card-tier,
    body.touch .planeta-drawer-build .build-card-tier {
      font-size: 9px !important;
      color: rgba(255,255,255,0.55) !important;
      top: 3px !important;
      right: 5px !important;
      letter-spacing: 0.06em !important;
    }
    body.touch .planeta-drawer-build .build-card-icon,
    body.touch .planeta-drawer-build .build-card-icon {
      flex: 1 1 auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      width: 100% !important;
    }
    body.touch .planeta-drawer-build .build-card-sprite,
    body.touch .planeta-drawer-build .build-card-sprite {
      width: 36px !important;
      height: 36px !important;
    }
    body.touch .planeta-drawer-build .build-card-cost,
    body.touch .planeta-drawer-build .build-card-cost {
      font-size: 11px !important;
      color: #fff !important;
      gap: 3px !important;
      margin-top: 4px !important;
    }
    body.touch .planeta-drawer-build .build-card-cost svg,
    body.touch .planeta-drawer-build .build-card-cost svg {
      width: 10px !important;
      height: 10px !important;
      color: rgba(255,255,255,0.6) !important;
    }
    body.touch .planeta-drawer-build .build-card-reason,
    body.touch .planeta-drawer-build .build-card-reason {
      font-size: 9px !important;
      color: rgba(255,255,255,0.5) !important;
      bottom: 2px !important;
    }


    /* ── Build panel cards: readable labels, not just icons. */
    body.touch .build-card {
      font-size: 13px !important;
    }
    body.touch .build-card-name,
    body.touch .build-card-cost {
      font-size: 13px !important;
    }

    /* ── Ship panel action icons — comfortable but not chunky. */
    body.touch .ship-panel-action {
      min-width: 38px !important;
      min-height: 38px !important;
    }
  `;
  document.head.appendChild(style);
}
