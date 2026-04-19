let _injected = false;

export function injectMobileStyles(): void {
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* ── HUD unit override on small touch screens ─────────────────────
       Base clamp is 12px-22px which makes derived text-sm = 6.6px on a
       phone. Bump the minimum so readability is sane. */
    body.touch.size-sm,
    body.touch.portrait.size-md {
      --hud-unit: clamp(16px, 2.6vmin, 22px) !important;
      --hud-margin: clamp(12px, 2vmin, 22px) !important;
    }

    /* ── Touch targets: scoped to INTERACTIVE controls only.
       Avoid hitting every tiny internal button (dropdown option,
       inline + / − in stepper). */
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

    /* ── Top HUD readability on small portrait. Readable, not microscopic. */
    body.touch.size-sm.portrait .resource-bar,
    body.touch.size-sm.portrait .credits-bar,
    body.touch.size-sm.portrait .empire-badge {
      font-size: 14px !important;
      padding: 6px 10px !important;
      line-height: 1.2 !important;
    }
    body.touch.size-sm.portrait .credits-clock,
    body.touch.size-sm.portrait .credits-divider {
      display: none !important;
    }

    /* ── Minimap: shrink but stay legible */
    body.touch.size-sm .minimap {
      transform: scale(0.78);
      transform-origin: bottom left;
    }

    /* ── Modals: constrain to viewport without forcing fullscreen.
       Allow the natural card sizing, just clamp so it never overflows. */
    body.touch.size-sm .settings-overlay,
    body.touch.size-sm .main-menu,
    body.touch.size-sm .pause-menu,
    body.touch.size-sm .new-world-modal,
    body.touch.size-sm .save-modal-backdrop,
    body.touch.size-sm .lore-modal-backdrop,
    body.touch.size-sm .confirm-backdrop {
      max-width: 100vw !important;
      max-height: 100vh !important;
      overflow-y: auto;
    }

    /* Inner cards: let the card size to content, but never overflow the screen. */
    body.touch.size-sm .lore-modal,
    body.touch.size-sm .confirm-dialog,
    body.touch.size-sm .pm-card,
    body.touch.size-sm .nwm-card,
    body.touch.size-sm .colony-modal {
      width: min(94vw, 420px) !important;
      max-height: 90vh !important;
      border-radius: 12px !important;
      overflow-y: auto;
    }

    /* Settings panel inner card: allow full available height */
    body.touch.size-sm .settings-overlay > * {
      width: min(96vw, 520px) !important;
      max-height: 94vh !important;
    }
  `;
  document.head.appendChild(style);
}
