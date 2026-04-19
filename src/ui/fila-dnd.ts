/**
 * HTML5 drag & drop reorder para a fila de produção.
 *
 * Tentativa 3: drag-by-handle via "sempre draggable + cancela no
 * dragstart se não veio do handle". As tentativas anteriores
 * (pointerdown.draggable=true) falharam porque alguns browsers
 * avaliam o atributo draggable ANTES do pointerdown listener rodar,
 * então flipar a prop em resposta ao pointerdown chega tarde demais.
 *
 * Mantém:
 *   - Item locked (posição 0 em produção) não arrasta nem deslocam.
 *   - Rebuild loop pula enquanto há drag ou pointer down no fila.
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
      /* Handle needs its own z context so dragstart captures it cleanly. */
      position: relative;
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

export function bindFilaDragDrop(listEl: HTMLElement, options: FilaDragOptions): void {
  injectFilaStyles();

  if (getComputedStyle(listEl).position === 'static') {
    listEl.style.position = 'relative';
  }

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

  const items = Array.from(listEl.querySelectorAll<HTMLElement>(options.itemSelector));
  for (const item of items) {
    const idx = options.getIdx(item);
    const locked = options.isLocked(idx);
    const handle = item.querySelector<HTMLElement>(options.handleSelector);

    // KEY FIX: draggable must be static. Flipping it in a pointerdown
    // handler is too late — some browsers (Firefox, Safari) read the
    // attribute at pointerdown time, so by the time our listener runs,
    // the decision to not-start-drag has already been made.
    item.draggable = !locked;

    if (locked) continue;

    item.addEventListener('dragstart', (e) => {
      // Drag-by-handle: only proceed if the mousedown that kicked this
      // off happened inside the handle element. e.target on dragstart
      // is the deepest descendant under the cursor at the moment drag
      // started.
      const target = e.target as HTMLElement | null;
      if (!handle || !target || !handle.contains(target)) {
        e.preventDefault();
        return;
      }
      dragSourceIdx = idx;
      _draggingActive = true;
      item.classList.add('fila-dragging-source');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox requires data to be set on dataTransfer or the drag is aborted.
        e.dataTransfer.setData('text/plain', String(idx));
      }
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('fila-dragging-source');
      dragSourceIdx = -1;
      _draggingActive = false;
      if (indicator) indicator.style.display = 'none';
    });

    item.addEventListener('dragover', (e) => {
      if (dragSourceIdx < 0) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const ind = ensureIndicator();
      const rect = item.getBoundingClientRect();
      const listRect = listEl.getBoundingClientRect();
      const below = (e.clientY - rect.top) > rect.height / 2;
      const indY = (below ? rect.bottom : rect.top) - listRect.top - 1;
      ind.style.top = `${indY}px`;
      ind.style.display = 'block';

      const fromIdx = dragSourceIdx;
      let rawTarget = below ? idx + 1 : idx;
      for (const other of items) {
        const oIdx = options.getIdx(other);
        if (options.isLocked(oIdx)) rawTarget = Math.max(rawTarget, oIdx + 1);
      }
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

  // Drop target for the bottom gap (below all items).
  listEl.addEventListener('dragover', (e) => {
    if (dragSourceIdx < 0) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
  });

  // Track pointer-down-in-list for rebuild suppression (covers the ×
  // button click that would otherwise race the rebuild tick).
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
