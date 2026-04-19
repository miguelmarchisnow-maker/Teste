/**
 * HTML5 drag & drop reorder para a fila de produção.
 *
 * Substituiu a implementação pointer-based anterior que em alguns
 * contextos não disparava pointermove após o pointerdown (o handle
 * recebia o evento mas não via as movimentações). A API nativa
 * `draggable` + dragstart/dragover/drop é mais simples e battle-tested
 * em todos os browsers.
 *
 * Mantém as mesmas garantias anteriores:
 *   - Item locked (posição 0 em produção) não arrasta nem é deslocado.
 *   - Rebuild loop pula enquanto há drag ativo ou pointer pressionado.
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
    .fila-drag-handle.locked {
      opacity: 0.25;
      cursor: not-allowed;
    }
    .fila-drag-handle:active {
      cursor: grabbing;
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
      opacity: 0.4;
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

/**
 * Wires HTML5 drag & drop on the given list.
 * - Sets `draggable=true` on each item whose handle isn't locked.
 * - Starts drag only when the pointer is on the handle (drag-by-handle).
 * - Shows a drop indicator line between items as the user hovers.
 */
export function bindFilaDragDrop(listEl: HTMLElement, options: FilaDragOptions): void {
  injectFilaStyles();

  if (getComputedStyle(listEl).position === 'static') {
    listEl.style.position = 'relative';
  }

  // Indicator reused per bind call (rebuilt each time the list is
  // rerendered — cheap, only one per list).
  let indicator: HTMLDivElement | null = null;
  const ensureIndicator = (): HTMLDivElement => {
    if (!indicator || !indicator.isConnected) {
      indicator = document.createElement('div');
      indicator.className = 'fila-drop-indicator';
      listEl.appendChild(indicator);
    }
    return indicator;
  };

  let dragSourceIdx = -1;
  let pointerOnHandle = false;

  const items = Array.from(listEl.querySelectorAll<HTMLElement>(options.itemSelector));
  for (const item of items) {
    const idx = options.getIdx(item);
    const locked = options.isLocked(idx);
    const handle = item.querySelector<HTMLElement>(options.handleSelector);
    if (locked) {
      item.draggable = false;
      continue;
    }

    // HTML5 drag only starts from draggable=true elements; but we want
    // drag-by-handle (not drag-by-anywhere-on-row). Trick: flip
    // draggable on/off based on whether the pointer is on the handle.
    item.draggable = false;
    if (handle) {
      handle.addEventListener('pointerdown', () => { item.draggable = true; pointerOnHandle = true; });
      handle.addEventListener('pointerup',   () => { pointerOnHandle = false; });
      handle.addEventListener('pointerleave', () => { pointerOnHandle = false; });
      handle.addEventListener('mouseenter', () => { /* ensures hover styles */ });
    }

    item.addEventListener('dragstart', (e) => {
      if (!pointerOnHandle) {
        e.preventDefault();
        return;
      }
      dragSourceIdx = idx;
      _draggingActive = true;
      item.classList.add('fila-dragging-source');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        // Required by Firefox for drag to start at all.
        e.dataTransfer.setData('text/plain', String(idx));
      }
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('fila-dragging-source');
      item.draggable = false;
      pointerOnHandle = false;
      dragSourceIdx = -1;
      _draggingActive = false;
      if (indicator) indicator.style.display = 'none';
    });

    item.addEventListener('dragover', (e) => {
      if (dragSourceIdx < 0) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      // Position the drop indicator line: above or below this item
      // depending on which half the cursor is in.
      const ind = ensureIndicator();
      const rect = item.getBoundingClientRect();
      const listRect = listEl.getBoundingClientRect();
      const below = (e.clientY - rect.top) > rect.height / 2;
      const indY = (below ? rect.bottom : rect.top) - listRect.top - 1;
      ind.style.top = `${indY}px`;
      ind.style.display = 'block';
      // Cache target idx on the indicator so drop can read it.
      const fromIdx = dragSourceIdx;
      let rawTarget = below ? idx + 1 : idx;
      // Can't drop in front of any locked item.
      for (const other of items) {
        const oIdx = options.getIdx(other);
        if (options.isLocked(oIdx)) rawTarget = Math.max(rawTarget, oIdx + 1);
      }
      // splice adjust: removing from fromIdx shifts later entries by -1.
      const adjusted = rawTarget > fromIdx ? rawTarget - 1 : rawTarget;
      ind.dataset.targetIdx = String(adjusted);
    });

    item.addEventListener('drop', (e) => {
      if (dragSourceIdx < 0) return;
      e.preventDefault();
      const ind = indicator;
      if (!ind) return;
      const toIdx = Number(ind.dataset.targetIdx ?? -1);
      const fromIdx = dragSourceIdx;
      ind.style.display = 'none';
      if (toIdx >= 0 && toIdx !== fromIdx) {
        options.onReorder(fromIdx, toIdx);
      }
    });
  }

  // Bottom-of-list drop target so the user can drop AFTER the last
  // item even when no item is under the cursor.
  listEl.addEventListener('dragover', (e) => {
    if (dragSourceIdx < 0) return;
    // Only activate if no child item has already consumed the event.
    // (child dragovers called preventDefault; this one catches the gap.)
    if (e.defaultPrevented) return;
    e.preventDefault();
  });

  // Track pointer-down-in-list for rebuild suppression.
  const onListPointerDown = (): void => {
    _pointerDownInsideFila++;
    const release = (): void => {
      _pointerDownInsideFila = Math.max(0, _pointerDownInsideFila - 1);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
    };
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  };
  listEl.addEventListener('pointerdown', onListPointerDown);

  // Esc cancels the drag (abort via releasing the drag).
  const onKey = (e: KeyboardEvent): void => {
    if (dragSourceIdx < 0) return;
    if (e.key === 'Escape') {
      dragSourceIdx = -1;
      _draggingActive = false;
      if (indicator) indicator.style.display = 'none';
    }
  };
  document.addEventListener('keydown', onKey);
}
