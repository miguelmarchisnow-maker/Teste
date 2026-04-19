/**
 * Pointer-based reorder para a fila.
 *
 * Desistimos da HTML5 drag API — depois de várias tentativas ela
 * continuava mostrando cursor de bloqueio em contextos que não pude
 * reproduzir sem browser em mãos. Voltei pra pointer events puros.
 *
 * Princípios:
 *   - SEM setPointerCapture (causa problemas em alguns contextos).
 *   - SEM HTML5 draggable attribute.
 *   - Listeners de move/up em `window`, adicionados sob demanda no
 *     pointerdown e removidos no pointerup. Garante que não vaza.
 *   - State todo em closures do handler de pointerdown (nada global
 *     além das flags de supressão de rebuild).
 *   - Esc cancela.
 */

let _draggingActive = false;
let _stylesInjected = false;
let _pointerDownInsideFila = 0;

function injectFilaStyles(): void {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.setAttribute('data-src', 'fila-dnd');
  s.textContent = `
    .fila-drag-handle {
      width: calc(var(--hud-unit) * 1.2);
      height: calc(var(--hud-unit) * 1.2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--hud-text-dim);
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      font-size: calc(var(--hud-unit) * 0.85);
      line-height: 1;
      letter-spacing: -1px;
      touch-action: none;
    }
    .fila-drag-handle:hover { color: var(--hud-text); }
    .fila-drag-handle:active { cursor: grabbing; }
    .fila-drag-handle.locked {
      opacity: 0.25;
      cursor: not-allowed;
    }
    .fila-remove-btn {
      appearance: none;
      background: transparent;
      border: 1px solid transparent;
      color: var(--hud-text-dim);
      width: calc(var(--hud-unit) * 1.1);
      height: calc(var(--hud-unit) * 1.1);
      border-radius: 50%;
      cursor: pointer;
      font-size: calc(var(--hud-unit) * 0.8);
      line-height: 1;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 120ms, color 120ms, border-color 120ms;
    }
    .fila-remove-btn:hover:not(:disabled) {
      color: #ff9f9f;
      border-color: rgba(255, 120, 120, 0.45);
      background: rgba(255, 120, 120, 0.08);
    }
    .fila-remove-btn:disabled {
      opacity: 0.2;
      cursor: not-allowed;
    }
    .fila-drop-indicator {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: rgba(255, 255, 255, 0.85);
      border-radius: 1px;
      pointer-events: none;
      box-shadow: 0 0 calc(var(--hud-unit) * 0.4) rgba(255, 255, 255, 0.35);
      z-index: 20;
      display: none;
    }
    .fila-dragging-source {
      opacity: 0.45;
      box-shadow: 0 calc(var(--hud-unit) * 0.4) calc(var(--hud-unit) * 1) rgba(0, 0, 0, 0.7);
    }
  `;
  document.head.appendChild(s);
}

export function isFilaDragging(): boolean {
  return _draggingActive;
}

export function isFilaInteracting(): boolean {
  return _pointerDownInsideFila > 0;
}

export interface FilaDragOptions {
  itemSelector: string;
  handleSelector: string;
  getIdx: (itemEl: HTMLElement) => number;
  isLocked: (idx: number) => boolean;
  onReorder: (fromIdx: number, toIdx: number) => void;
}

// Drag threshold — pointer must move this many pixels before a drag
// visually "commits" (so a tap-and-release on the handle doesn't look
// like a botched drag).
const DRAG_THRESHOLD_PX = 4;

export function bindFilaDragDrop(listEl: HTMLElement, options: FilaDragOptions): void {
  injectFilaStyles();

  if (getComputedStyle(listEl).position === 'static') {
    listEl.style.position = 'relative';
  }

  const items = Array.from(listEl.querySelectorAll<HTMLElement>(options.itemSelector));
  const itemMeta = items.map((el) => ({ el, idx: options.getIdx(el) }));

  for (const { el: item, idx } of itemMeta) {
    const locked = options.isLocked(idx);
    const handle = item.querySelector<HTMLElement>(options.handleSelector);
    // Keep the item NOT draggable — we're handling everything manually.
    item.draggable = false;
    if (!handle || locked) continue;

    handle.addEventListener('pointerdown', (pdEvent) => {
      if (pdEvent.button !== undefined && pdEvent.button !== 0 && pdEvent.pointerType === 'mouse') return;
      pdEvent.preventDefault();
      pdEvent.stopPropagation(); // don't trip the drawer's modal handler

      const startX = pdEvent.clientX;
      const startY = pdEvent.clientY;
      const pid = pdEvent.pointerId;

      let committed = false;
      let indicator: HTMLDivElement | null = null;
      let targetInsertIdx = idx;

      const commit = (): void => {
        if (committed) return;
        committed = true;
        _draggingActive = true;
        item.classList.add('fila-dragging-source');
        indicator = document.createElement('div');
        indicator.className = 'fila-drop-indicator';
        listEl.appendChild(indicator);
      };

      const positionIndicator = (clientY: number): void => {
        if (!indicator) return;
        const listRect = listEl.getBoundingClientRect();
        const last = itemMeta[itemMeta.length - 1];
        const lastRect = last.el.getBoundingClientRect();
        let rawTarget = 0;
        let indY = 0;
        if (clientY >= lastRect.bottom) {
          rawTarget = last.idx + 1;
          indY = lastRect.bottom - listRect.top;
        } else {
          for (const m of itemMeta) {
            const r = m.el.getBoundingClientRect();
            const below = clientY > r.top + r.height / 2;
            if (!below) { rawTarget = m.idx; indY = r.top - listRect.top; break; }
            rawTarget = m.idx + 1;
            indY = r.bottom - listRect.top;
          }
        }
        // No drops in front of locked items.
        for (const m of itemMeta) {
          if (options.isLocked(m.idx)) rawTarget = Math.max(rawTarget, m.idx + 1);
        }
        // splice adjust: removing fromIdx shifts later by -1
        targetInsertIdx = rawTarget > idx ? rawTarget - 1 : rawTarget;
        indicator.style.top = `${indY - 1}px`;
        indicator.style.display = 'block';
      };

      const onMove = (e: PointerEvent): void => {
        if (e.pointerId !== pid) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!committed) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
          commit();
        }
        positionIndicator(e.clientY);
      };

      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        if (committed) {
          _draggingActive = false;
          item.classList.remove('fila-dragging-source');
          if (indicator && indicator.parentElement) indicator.parentElement.removeChild(indicator);
          indicator = null;
        }
      };

      const onUp = (e: PointerEvent): void => {
        if (e.pointerId !== pid) return;
        const didCommit = committed;
        const finalTarget = targetInsertIdx;
        cleanup();
        if (didCommit && finalTarget !== idx) {
          options.onReorder(idx, finalTarget);
        }
      };

      const onCancel = (e: PointerEvent): void => {
        if (e.pointerId !== pid) return;
        cleanup();
      };

      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          targetInsertIdx = idx; // no-op reorder
          cleanup();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
    });
  }

  // Track pointer-down inside the list for rebuild suppression
  // (covers the remove button click too).
  listEl.addEventListener('pointerdown', () => {
    _pointerDownInsideFila++;
    const release = (): void => {
      _pointerDownInsideFila = Math.max(0, _pointerDownInsideFila - 1);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  });
}
