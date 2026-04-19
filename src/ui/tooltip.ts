let _tip: HTMLDivElement | null = null;
let _styleInjected = false;
let _touchDismissWired = false;
let _touchDismissTimer: number | null = null;

function isTouchDevice(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ui-tooltip {
      position: fixed;
      max-width: min(320px, 88vw);
      background: rgba(0, 0, 0, 0.92);
      border: 1px solid var(--hud-border);
      color: var(--hud-text);
      font-family: var(--hud-font);
      font-size: max(13px, calc(var(--hud-unit) * 0.75));
      line-height: 1.45;
      padding: calc(var(--hud-unit) * 0.6) calc(var(--hud-unit) * 0.8);
      pointer-events: none;
      z-index: 1100;
      opacity: 0;
      white-space: pre-line;
      transition: opacity 140ms ease;
    }
    .ui-tooltip.show { opacity: 1; }
    .ui-help-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: calc(var(--hud-unit) * 1);
      height: calc(var(--hud-unit) * 1);
      text-align: center;
      border: 1px solid var(--hud-text-dim);
      border-radius: 50%;
      font-size: calc(var(--hud-unit) * 0.7);
      color: var(--hud-text-dim);
      cursor: help;
      margin-left: calc(var(--hud-unit) * 0.3);
      vertical-align: middle;
      appearance: none;
      background: transparent;
      padding: 0;
    }
    body.touch .ui-help-icon {
      min-width: 24px;
      min-height: 24px;
    }
    .ui-help-icon:hover,
    .ui-help-icon:focus-visible {
      color: var(--hud-text);
      border-color: var(--hud-text);
      outline: none;
    }
  `;
  document.head.appendChild(s);
}

function ensureTip(): HTMLDivElement {
  if (_tip) return _tip;
  injectStyles();
  const t = document.createElement('div');
  t.className = 'ui-tooltip';
  document.body.appendChild(t);
  _tip = t;
  return t;
}

function clampToViewport(tip: HTMLDivElement, anchorRect: DOMRect): void {
  // Place to the right+top of the anchor, then shift left/up if it overflows.
  tip.style.left = `${anchorRect.right + 8}px`;
  tip.style.top = `${anchorRect.top}px`;
  requestAnimationFrame(() => {
    const tr = tip.getBoundingClientRect();
    if (tr.right > window.innerWidth - 4) {
      tip.style.left = `${Math.max(4, anchorRect.left - tr.width - 8)}px`;
    }
    if (tr.bottom > window.innerHeight - 4) {
      tip.style.top = `${Math.max(4, window.innerHeight - tr.height - 4)}px`;
    }
    if (tr.top < 4) tip.style.top = '4px';
  });
}

function showTip(text: string, anchor: HTMLElement, durationMs = 3000): void {
  const tip = ensureTip();
  tip.textContent = text;
  tip.classList.add('show');
  clampToViewport(tip, anchor.getBoundingClientRect());
  if (_touchDismissTimer) {
    clearTimeout(_touchDismissTimer);
    _touchDismissTimer = null;
  }
  _touchDismissTimer = window.setTimeout(hideTip, durationMs);
  wireTouchDismiss();
}

function hideTip(): void {
  _tip?.classList.remove('show');
}

function wireTouchDismiss(): void {
  if (_touchDismissWired) return;
  _touchDismissWired = true;
  document.addEventListener('pointerdown', (e) => {
    if (!_tip?.classList.contains('show')) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.classList.contains('ui-help-icon') || target.closest('.ui-help-icon'))) return;
    hideTip();
  }, { passive: true });
}

/**
 * Attach a hover tooltip to any element. On touch, tap-to-show / tap-away-to-hide
 * is used instead of hover since mouseenter doesn't fire reliably on touch.
 */
export function comTooltipHover(target: HTMLElement, getText: () => string): void {
  injectStyles();
  if (isTouchDevice()) {
    target.addEventListener('pointerup', (e) => {
      const text = getText();
      if (!text) return;
      e.stopPropagation();
      showTip(text, target);
    });
    return;
  }
  target.addEventListener('mouseenter', () => {
    const text = getText();
    if (!text) return;
    const tip = ensureTip();
    tip.textContent = text;
    tip.classList.add('show');
    clampToViewport(tip, target.getBoundingClientRect());
  });
  target.addEventListener('mouseleave', hideTip);
  target.addEventListener('mousemove', (e: MouseEvent) => {
    if (!_tip?.classList.contains('show')) return;
    _tip.style.left = `${e.clientX + 12}px`;
    _tip.style.top = `${e.clientY + 12}px`;
  });
}

export function comHelp(label: HTMLElement, text: string): void {
  injectStyles();
  // Use <button> so it's keyboard-focusable and screen-reader operable.
  const icon = document.createElement('button');
  icon.type = 'button';
  icon.className = 'ui-help-icon';
  icon.textContent = '?';
  icon.setAttribute('aria-label', text);
  if (isTouchDevice()) {
    icon.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      showTip(text, icon);
    });
  } else {
    icon.addEventListener('mouseenter', () => {
      const tip = ensureTip();
      tip.textContent = text;
      tip.classList.add('show');
      clampToViewport(tip, icon.getBoundingClientRect());
    });
    icon.addEventListener('mouseleave', hideTip);
  }
  // Keyboard: space/enter toggles like a button.
  icon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showTip(text, icon);
    } else if (e.key === 'Escape') {
      hideTip();
    }
  });
  label.appendChild(icon);
}
