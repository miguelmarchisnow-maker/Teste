let _injected = false;

/**
 * Layout-compact rules gate on `body.size-sm` (and size-md portrait)
 * regardless of touch, so a narrow desktop window also adapts. Only
 * gesture/affordance rules (large tap targets) stay gated on `.touch`.
 */
export function injectMobileStyles(): void {
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* ── HUD base unit: bump minimum on narrow screens so derived text
       (text-sm = 0.55× unit) isn't microscopic. ───────────────────── */
    body.size-sm,
    body.portrait.size-md {
      --hud-unit: clamp(16px, 2.6vmin, 22px) !important;
      --hud-margin: clamp(12px, 2vmin, 22px) !important;
    }

    /* ── Touch-only: interactive controls get 44px min hit area. ──── */
    body.touch .sidebar-btn,
    body.touch .sidebar-hamburger,
    body.touch .zoom-controls button,
    body.touch .menu-btn,
    body.touch .pm-btn,
    body.touch .nwm-btn,
    body.touch .confirm-btn,
    body.touch .settings-select-display {
      min-height: 44px;
    }

    /* ── Top HUD on narrow+portrait: readable, not microscopic. ───── */
    body.size-sm.portrait .resource-bar,
    body.size-sm.portrait .credits-bar,
    body.size-sm.portrait .empire-badge {
      font-size: 13px !important;
      padding: 6px 10px !important;
      line-height: 1.2 !important;
      max-width: calc(100vw - 24px) !important;
    }
    body.size-sm.portrait .empire-badge {
      /* Shrink the crest + text so it fits left of the resource bar */
      padding: 5px 8px !important;
    }
    body.size-sm.portrait .credits-clock,
    body.size-sm.portrait .credits-divider {
      display: none !important;
    }

    /* ── Reserve top-left real estate for the hamburger drawer trigger
       by nudging the resource-bar down on narrow screens. ────────── */
    body.size-sm .resource-bar {
      top: 60px !important;
    }
    body.size-sm .empire-badge {
      /* Badge starts below the hamburger row. */
      top: 60px !important;
    }

    /* ── Minimap: stay legible. ──────────────────────────────────── */
    body.size-sm .minimap {
      transform: scale(0.82);
      transform-origin: bottom left;
    }

    /* ── Modal cards: constrain but keep card feel, not full-screen slab. */
    body.size-sm .settings-overlay,
    body.size-sm .main-menu,
    body.size-sm .pause-menu,
    body.size-sm .new-world-modal,
    body.size-sm .save-modal-backdrop,
    body.size-sm .lore-modal-backdrop,
    body.size-sm .confirm-backdrop {
      max-width: 100vw !important;
      max-height: 100vh !important;
      overflow-y: auto;
    }
    body.size-sm .lore-modal,
    body.size-sm .confirm-dialog,
    body.size-sm .pm-card,
    body.size-sm .nwm-card,
    body.size-sm .colony-modal {
      width: min(94vw, 420px) !important;
      max-height: 90vh !important;
      border-radius: 12px !important;
      overflow-y: auto;
    }
    body.size-sm .settings-overlay > * {
      width: min(96vw, 520px) !important;
      max-height: 94vh !important;
    }

    /* ── Zoom controls: shift up so they don't collide with bottom sheets. */
    body.size-sm.portrait .zoom-controls {
      bottom: calc(var(--hud-margin) + 90vh * 0 + 90px) !important;
      right: 10px !important;
    }
    body.size-sm .zoom-controls button {
      width: 44px !important;
      height: 44px !important;
      font-size: 20px !important;
    }

    /* ── Build panel cards: more finger-friendly. ────────────────── */
    body.size-sm .build-card {
      min-height: 56px !important;
    }
    body.size-sm .build-panel .build-tab {
      min-height: 40px !important;
      padding: 8px 12px !important;
      font-size: 13px !important;
    }

    /* ── Planet drawer resources pills: bump touch area. ─────────── */
    body.size-sm .planeta-drawer button,
    body.size-sm .planeta-drawer .drawer-pill {
      min-height: 40px !important;
    }
  `;
  document.head.appendChild(style);
}
