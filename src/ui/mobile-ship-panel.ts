// Mobile-specific ship panel. Centered card modal with portrait, name,
// cargo bar (cargueira), stats and action grid. Same visual language as
// the planet drawer modal (monochromatic, HUD tokens, scale+opacity anim).

import type { Mundo, Nave } from '../types';
import { marcarInteracaoUi } from './interacao-ui';
import { pulseElement } from './animations.css';
import {
  obterNaveSelecionada,
  capacidadeCargaCargueira,
  cancelarMovimentoNave,
  alternarLoopCargueira,
} from '../world/mundo';
import { iniciarComandoNave } from '../core/player';
import { t } from '../core/i18n/t';
import {
  shipLabel,
  estadoLabel,
  alvoLabel,
  nomeTipoNave,
  cargaAtual,
  getCargoFillPercent,
  getCargoLabel,
  loadShipsSheet,
  drawShipSprite,
  spriteCellForShip,
  iconMove,
  iconCancel,
  iconTarget,
  iconOrigin,
  iconLoop,
} from './ship-panel';

interface ActionSpec {
  id: string;
  titleKey: string;
  icon: () => SVGSVGElement;
  enabled: (nave: Nave) => boolean;
  onClick: (nave: Nave, mundo: Mundo) => void;
}

const ACTIONS: ActionSpec[] = [
  {
    id: 'move',
    titleKey: 'ship_panel.action_move',
    icon: iconMove,
    enabled: (n) => n.dono === 'jogador',
    onClick: (n) => iniciarComandoNave('mover', n),
  },
  {
    id: 'cancel',
    titleKey: 'ship_panel.action_cancel',
    icon: iconCancel,
    enabled: (n) => n.dono === 'jogador' && (n.estado === 'viajando' || n.rotaManual.length > 0),
    onClick: (n) => cancelarMovimentoNave(n),
  },
  {
    id: 'origin',
    titleKey: 'ship_panel.action_origin',
    icon: iconOrigin,
    enabled: (n) => n.dono === 'jogador' && n.tipo === 'cargueira',
    onClick: (n) => iniciarComandoNave('origem', n),
  },
  {
    id: 'destination',
    titleKey: 'ship_panel.action_destination',
    icon: iconTarget,
    enabled: (n) => n.dono === 'jogador' && n.tipo === 'cargueira',
    onClick: (n) => iniciarComandoNave('destino', n),
  },
  {
    id: 'loop',
    titleKey: 'ship_panel.action_loop',
    icon: iconLoop,
    enabled: (n) => n.dono === 'jogador' && n.tipo === 'cargueira' && !!n.rotaCargueira?.origem && !!n.rotaCargueira?.destino,
    onClick: (n) => alternarLoopCargueira(n),
  },
];

let _styleInjected = false;
let _modal: HTMLDivElement | null = null;
let _portraitCanvas: HTMLCanvasElement | null = null;
let _nameEl: HTMLDivElement | null = null;
let _subtitleEl: HTMLDivElement | null = null;
let _barEl: HTMLDivElement | null = null;
let _barFillEl: HTMLDivElement | null = null;
let _barLabelEl: HTMLDivElement | null = null;
let _statsEl: HTMLDivElement | null = null;
let _actionsEl: HTMLDivElement | null = null;
let _selectedShip: Nave | null = null;
let _mundoRef: Mundo | null = null;
let _metaKey = '';
let _statsKey = '';
let _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const orphan = document.head.querySelector('style[data-mobile-ship]');
  if (orphan) orphan.remove();
  const style = document.createElement('style');
  style.setAttribute('data-mobile-ship', '1');
  style.textContent = `
    .mship-modal {
      position: fixed;
      inset: auto;
      top: 50%;
      left: 50%;
      right: auto;
      bottom: auto;
      transform: translate(-50%, -50%) scale(0.88);
      width: min(94vw, 400px);
      max-width: 94vw;
      max-height: 82dvh;
      margin: 0;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.5);
      border-radius: 14px;
      background: #000;
      color: #fff;
      font-family: var(--hud-font-body);
      z-index: 945;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      box-shadow:
        0 8px 32px rgba(0,0,0,0.85),
        0 0 0 1px rgba(0,0,0,0.6);
      transition:
        opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        transform 280ms cubic-bezier(0.2, 0.9, 0.2, 1.05),
        visibility 0s linear 280ms;
    }
    .mship-modal.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translate(-50%, -50%) scale(1);
      transition:
        opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        transform 280ms cubic-bezier(0.2, 0.9, 0.2, 1.05),
        visibility 0s linear 0s;
    }
    .mship-close {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      display: flex;
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
    .mship-close:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-color: rgba(255,255,255,0.7);
    }
    .mship-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 48px 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .mship-portrait {
      width: 56px;
      height: 56px;
      flex: 0 0 auto;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .mship-portrait canvas {
      width: 44px;
      height: 44px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
    .mship-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .mship-name {
      font-family: var(--hud-font-display);
      font-size: 15px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #fff;
      line-height: 1.1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mship-subtitle {
      font-size: 11px;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.04em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mship-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 14px 14px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .mship-bar {
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
    }
    .mship-bar-fill {
      height: 100%;
      background: #fff;
      transition: width 200ms ease;
    }
    .mship-bar-label {
      font-size: 11px;
      color: rgba(255,255,255,0.55);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .mship-stats {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      padding: 8px 0;
      border-top: 1px solid rgba(255,255,255,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .mship-stat-label {
      font-size: 11px;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .mship-stat-value {
      font-size: 13px;
      color: #fff;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mship-actions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
      gap: 6px;
    }
    .mship-action {
      appearance: none;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      border-radius: 8px;
      padding: 10px 6px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease, transform 100ms ease;
    }
    .mship-action:hover:not(.disabled),
    .mship-action:active:not(.disabled) {
      background: rgba(255,255,255,0.12);
      border-color: #fff;
      transform: translateY(-1px);
    }
    .mship-action.disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .mship-action.active {
      background: rgba(255,255,255,0.18);
      border-color: #fff;
    }
    .mship-action svg {
      width: 20px;
      height: 20px;
      color: currentColor;
      display: block;
    }
    @media (prefers-reduced-motion: reduce) {
      .mship-modal,
      .mship-modal.visible {
        transition: opacity 120ms ease, visibility 0s linear 0s;
        transform: translate(-50%, -50%) scale(1);
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureModal(): void {
  if (_modal) return;
  injectStyles();
  loadShipsSheet();

  const modal = document.createElement('div');
  modal.className = 'mship-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'mship-title');
  modal.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    marcarInteracaoUi();
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mship-close';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    marcarInteracaoUi();
    if (_selectedShip) _selectedShip.selecionado = false;
  });
  modal.appendChild(closeBtn);

  const head = document.createElement('div');
  head.className = 'mship-head';

  const portraitWrap = document.createElement('div');
  portraitWrap.className = 'mship-portrait';
  const portrait = document.createElement('canvas');
  _portraitCanvas = portrait;
  portraitWrap.appendChild(portrait);
  head.appendChild(portraitWrap);

  const text = document.createElement('div');
  text.className = 'mship-text';
  const name = document.createElement('div');
  name.className = 'mship-name';
  name.id = 'mship-title';
  _nameEl = name;
  const subtitle = document.createElement('div');
  subtitle.className = 'mship-subtitle';
  _subtitleEl = subtitle;
  text.append(name, subtitle);
  head.appendChild(text);
  modal.appendChild(head);

  const body = document.createElement('div');
  body.className = 'mship-body';

  const bar = document.createElement('div');
  bar.className = 'mship-bar';
  const barFill = document.createElement('div');
  barFill.className = 'mship-bar-fill';
  bar.appendChild(barFill);
  _barEl = bar;
  _barFillEl = barFill;

  const barLabel = document.createElement('div');
  barLabel.className = 'mship-bar-label';
  _barLabelEl = barLabel;

  body.append(bar, barLabel);

  const stats = document.createElement('div');
  stats.className = 'mship-stats';
  _statsEl = stats;
  body.appendChild(stats);

  const actions = document.createElement('div');
  actions.className = 'mship-actions';
  _actionsEl = actions;
  body.appendChild(actions);

  modal.appendChild(body);
  document.body.appendChild(modal);
  _modal = modal;

  // Trap focus + Esc
  _keydownHandler = (e: KeyboardEvent) => {
    if (!_selectedShip || !_modal?.classList.contains('visible')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      _selectedShip.selecionado = false;
    }
  };
  window.addEventListener('keydown', _keydownHandler);
}

function renderHead(nave: Nave): void {
  if (_portraitCanvas) {
    const cell = spriteCellForShip(nave);
    drawShipSprite(_portraitCanvas, cell.row, cell.col);
  }
  if (_nameEl) _nameEl.textContent = shipLabel(nave);
  if (_subtitleEl) {
    _subtitleEl.textContent = nave.origem?.dados.nome
      ? t('ship_panel.subtitulo_origem', { nome: nave.origem.dados.nome })
      : t('ship_panel.subtitulo_sem_origem');
  }
}

function renderBar(nave: Nave): void {
  if (!_barEl || !_barFillEl || !_barLabelEl) return;
  if (nave.tipo === 'cargueira') {
    _barEl.style.display = '';
    _barLabelEl.style.display = '';
    _barFillEl.style.width = `${getCargoFillPercent(nave)}%`;
    _barLabelEl.textContent = getCargoLabel(nave);
  } else {
    _barEl.style.display = 'none';
    _barLabelEl.style.display = 'none';
  }
}

function renderStats(nave: Nave): void {
  if (!_statsEl) return;
  _statsEl.replaceChildren();
  const rows: [string, string][] = [
    [t('ship_panel.estado'), estadoLabel(nave.estado)],
    [t('ship_panel.origem'), nave.origem?.dados.nome ?? '—'],
    [t('ship_panel.alvo'), alvoLabel(nave)],
  ];
  if (nave.tipo === 'cargueira') {
    rows.push([t('ship_panel.capacidade'), String(capacidadeCargaCargueira(nave.tier))]);
  } else {
    rows.push([t('ship_panel.tipo'), nomeTipoNave(nave.tipo)]);
  }
  for (const [label, value] of rows) {
    const l = document.createElement('div');
    l.className = 'mship-stat-label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'mship-stat-value';
    v.textContent = value;
    _statsEl.append(l, v);
  }
}

function renderActions(nave: Nave): void {
  if (!_actionsEl) return;
  _actionsEl.replaceChildren();
  for (const action of ACTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mship-action';
    btn.title = t(action.titleKey);
    btn.setAttribute('aria-label', t(action.titleKey));
    btn.appendChild(action.icon());
    const isEnabled = action.enabled(nave);
    if (!isEnabled) btn.classList.add('disabled');
    if (action.id === 'loop' && nave.rotaCargueira?.loop) btn.classList.add('active');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      marcarInteracaoUi();
      if (!isEnabled || !_mundoRef) return;
      action.onClick(nave, _mundoRef);
      pulseElement(btn);
    });
    _actionsEl.appendChild(btn);
  }
}

function getMetaKey(nave: Nave): string {
  return [nave.id, nave.tipo, nave.tier].join('|');
}

function getStatsKey(nave: Nave): string {
  return [
    nave.estado,
    nave.origem?.id ?? '',
    nave.alvo?._tipoAlvo ?? '',
    (nave.alvo as { dados?: { nome?: string } })?.dados?.nome ?? '',
    Math.floor(cargaAtual(nave)),
    nave.rotaCargueira?.loop ? '1' : '0',
    nave.rotaManual.length,
  ].join('|');
}

export function criarMobileShipPanel(): void {
  ensureModal();
}

export function atualizarMobileShipPanel(mundo: Mundo): void {
  ensureModal();
  if (!_modal) return;
  _mundoRef = mundo;

  const nave = obterNaveSelecionada(mundo);
  // Colonizadoras use the dedicated colonizer-panel; skip.
  if (!nave || nave.tipo === 'colonizadora') {
    if (_modal.classList.contains('visible')) {
      _modal.classList.remove('visible');
    }
    _selectedShip = null;
    _metaKey = '';
    _statsKey = '';
    return;
  }

  const metaKey = getMetaKey(nave);
  const firstOpen = nave !== _selectedShip;
  if (firstOpen || metaKey !== _metaKey) {
    _selectedShip = nave;
    _metaKey = metaKey;
    _statsKey = '';
    renderHead(nave);
    renderActions(nave);
  }

  const statsKey = getStatsKey(nave);
  if (statsKey !== _statsKey) {
    _statsKey = statsKey;
    renderStats(nave);
    renderBar(nave);
  }

  if (!_modal.classList.contains('visible')) {
    // Force reflow so first-open animation runs from initial state.
    void _modal.offsetHeight;
    _modal.classList.add('visible');
  }
}

export function destruirMobileShipPanel(): void {
  if (_keydownHandler) {
    window.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  _modal?.remove();
  _modal = null;
  _portraitCanvas = null;
  _nameEl = null;
  _subtitleEl = null;
  _barEl = null;
  _barFillEl = null;
  _barLabelEl = null;
  _statsEl = null;
  _actionsEl = null;
  _selectedShip = null;
  _mundoRef = null;
  _metaKey = '';
  _statsKey = '';
  _styleInjected = false;
}
