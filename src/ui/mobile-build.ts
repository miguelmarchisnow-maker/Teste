// Mobile-specific construction UI. Renders into the planet drawer's
// "Construir" tab with a layout designed for narrow viewports — no
// floating panel chrome, no fixed-width grid, no spritesheet sized for
// desktop. Reuses the data layer (cardsForTab, resolveAcao, etc) from
// build-panel.ts so the catalog stays in sync.

import type { Mundo, Planeta } from '../types';
import { construirNoPlaneta } from '../world/construcao';
import { marcarInteracaoUi } from './interacao-ui';
import { pulseElement } from './animations.css';
import { t } from '../core/i18n/t';
import { toast } from './toast';
import {
  type AbaId,
  type CardSpec,
  type CardState,
  type SpriteCell,
  cardsForTab,
  resolveAcao,
  getSelectedPlayerPlanet,
  loadSheet,
  drawSprite,
  iconCredit,
  roman,
  fmtCost,
} from './build-panel';

// Local label table — duplicated here so mobile-build is self-contained
// and doesn't depend on build-panel re-exporting private dict.
const REASON_LABEL_EXPORT: Record<NonNullable<CardState['hiddenReason']>, string> = {
  maxTier: 'Tier máximo',
  noFactory: 'Sem fábrica',
  noResearch: 'Sem pesquisa',
  queueFull: 'Fila cheia',
  lowResources: 'Recursos insuficientes',
};

let _styleInjected = false;
let _host: HTMLDivElement | null = null;
let _tabsEl: HTMLDivElement | null = null;
let _gridEl: HTMLDivElement | null = null;
let _activeTab: AbaId = 'edificios';
let _selectedPlanet: Planeta | null = null;
let _mundoRef: Mundo | null = null;
let _renderKey = '';

const _sprites: { canvas: HTMLCanvasElement; cell: SpriteCell }[] = [];

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const orphan = document.head.querySelector('style[data-mobile-build]');
  if (orphan) orphan.remove();
  const style = document.createElement('style');
  style.setAttribute('data-mobile-build', '1');
  style.textContent = `
    .mb-build {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px 16px;
      width: 100%;
      box-sizing: border-box;
    }
    .mb-build-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    .mb-build-tab {
      appearance: none;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.18);
      color: rgba(255,255,255,0.55);
      font-family: var(--hud-font);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 8px 4px;
      border-radius: 6px;
      cursor: pointer;
      min-height: 34px;
      transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
    }
    .mb-build-tab:hover:not(.active) {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.85);
    }
    .mb-build-tab.active {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-color: #fff;
    }
    .mb-build-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    @keyframes mb-build-tab-in {
      0%   { opacity: 0; transform: translateY(8px); }
      60%  { opacity: 1; }
      100% { opacity: 1; transform: translateY(0); }
    }
    .mb-build-list.is-switching {
      animation: mb-build-tab-in 220ms cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    /* Per-item stagger — each row fades in slightly after the previous,
       gives the impression of the list "filling" rather than popping. */
    @keyframes mb-build-item-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .mb-build-list.is-switching .mb-build-item {
      animation: mb-build-item-in 240ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    .mb-build-list.is-switching .mb-build-item:nth-child(1) { animation-delay: 0ms; }
    .mb-build-list.is-switching .mb-build-item:nth-child(2) { animation-delay: 30ms; }
    .mb-build-list.is-switching .mb-build-item:nth-child(3) { animation-delay: 60ms; }
    .mb-build-list.is-switching .mb-build-item:nth-child(4) { animation-delay: 90ms; }
    .mb-build-list.is-switching .mb-build-item:nth-child(5) { animation-delay: 120ms; }
    .mb-build-list.is-switching .mb-build-item:nth-child(6) { animation-delay: 150ms; }
    .mb-build-list.is-switching .mb-build-item:nth-child(n+7) { animation-delay: 180ms; }
    @media (prefers-reduced-motion: reduce) {
      .mb-build-list.is-switching,
      .mb-build-list.is-switching .mb-build-item {
        animation: none;
      }
    }
    .mb-build-item {
      appearance: none;
      display: grid;
      grid-template-columns: 44px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 8px;
      color: #fff;
      font-family: var(--hud-font);
      cursor: pointer;
      text-align: left;
      width: 100%;
      box-sizing: border-box;
      transition: background-color 120ms ease, border-color 120ms ease, transform 100ms ease;
    }
    .mb-build-item:hover:not(.disabled),
    .mb-build-item:active:not(.disabled) {
      background: rgba(255,255,255,0.10);
      border-color: #fff;
      transform: translateY(-1px);
    }
    .mb-build-item.disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .mb-build-item-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
    }
    .mb-build-item-sprite {
      width: 40px;
      height: 40px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
    .mb-build-item-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .mb-build-item-name {
      font-size: 13px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mb-build-item-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 10px;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.04em;
    }
    .mb-build-item-tier {
      font-family: var(--hud-font);
      color: rgba(255,255,255,0.7);
    }
    .mb-build-item-reason {
      color: rgba(255,255,255,0.45);
    }
    .mb-build-item-cost {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
    .mb-build-item-cost svg {
      width: 12px;
      height: 12px;
      color: rgba(255,255,255,0.6);
    }
    .mb-build-item-cost.no-cost {
      color: rgba(255,255,255,0.4);
    }
    .mb-build-empty {
      padding: 24px 12px;
      text-align: center;
      font-size: 12px;
      color: rgba(255,255,255,0.45);
      letter-spacing: 0.06em;
    }
  `;
  document.head.appendChild(style);
}

function buildTabs(): HTMLDivElement {
  const tabs = document.createElement('div');
  tabs.className = 'mb-build-tabs';
  const labels: Array<[AbaId, string]> = [
    ['edificios', 'Edifícios'],
    ['naves',     'Naves'],
    ['pesquisa',  'Pesquisa'],
  ];
  for (const [id, label] of labels) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mb-build-tab';
    btn.dataset.tab = id;
    btn.textContent = label;
    if (id === _activeTab) btn.classList.add('active');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      marcarInteracaoUi();
      if (_activeTab === id) return;
      _activeTab = id;
      _renderKey = '';
      updateTabStyles();
      renderActiveTab();
      playSwitchAnimation();
    });
    tabs.appendChild(btn);
  }
  return tabs;
}

function updateTabStyles(): void {
  if (!_tabsEl) return;
  for (const child of Array.from(_tabsEl.children)) {
    const btn = child as HTMLButtonElement;
    btn.classList.toggle('active', btn.dataset.tab === _activeTab);
  }
}

function playSwitchAnimation(): void {
  if (!_gridEl) return;
  _gridEl.classList.remove('is-switching');
  // Force reflow so removing + re-adding the class restarts the animation.
  void _gridEl.offsetWidth;
  _gridEl.classList.add('is-switching');
}

function buildItem(spec: CardSpec, state: CardState): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'mb-build-item';
  if (!state.enabled) {
    item.classList.add('disabled');
    item.setAttribute('aria-disabled', 'true');
  }

  const iconWrap = document.createElement('div');
  iconWrap.className = 'mb-build-item-icon';
  const canvas = document.createElement('canvas');
  canvas.className = 'mb-build-item-sprite';
  const cell = spec.sprite(state);
  _sprites.push({ canvas, cell });
  iconWrap.appendChild(canvas);
  requestAnimationFrame(() => drawSprite(canvas, cell));
  item.appendChild(iconWrap);

  const text = document.createElement('div');
  text.className = 'mb-build-item-text';
  const name = document.createElement('span');
  name.className = 'mb-build-item-name';
  name.textContent = t(spec.nomeKey);
  text.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'mb-build-item-meta';
  if (state.tier) {
    const tier = document.createElement('span');
    tier.className = 'mb-build-item-tier';
    tier.textContent = `T${roman(state.tier)}`;
    meta.appendChild(tier);
  }
  if (!state.enabled && state.hiddenReason) {
    const reason = document.createElement('span');
    reason.className = 'mb-build-item-reason';
    reason.textContent = REASON_LABEL_EXPORT[state.hiddenReason];
    meta.appendChild(reason);
  }
  text.appendChild(meta);
  item.appendChild(text);

  const cost = document.createElement('div');
  cost.className = 'mb-build-item-cost';
  if (state.cost != null) {
    cost.appendChild(iconCredit());
    const value = document.createElement('span');
    value.textContent = fmtCost(state.cost);
    cost.appendChild(value);
  } else {
    cost.classList.add('no-cost');
    cost.textContent = '—';
  }
  item.appendChild(cost);

  item.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    marcarInteracaoUi();
    if (!state.enabled || !_selectedPlanet || !_mundoRef) {
      if (state.hiddenReason) {
        toast(`${t(spec.nomeKey)}: ${REASON_LABEL_EXPORT[state.hiddenReason]}`, 'err');
      }
      return;
    }
    construirNoPlaneta(_mundoRef, _selectedPlanet, resolveAcao(spec, state));
    pulseElement(item, 'orbital-toggle-flash');
    _renderKey = '';
  });

  return item;
}

function getRenderKey(planeta: Planeta): string {
  const r = planeta.dados.recursos;
  return [
    _activeTab,
    planeta.id,
    planeta.dados.fabricas,
    planeta.dados.infraestrutura,
    Math.floor(r.comum / 5),
    planeta.dados.filaProducao.length,
  ].join('|');
}

function renderActiveTab(): void {
  if (!_gridEl || !_selectedPlanet) return;
  _gridEl.replaceChildren();
  _sprites.length = 0;
  const specs = cardsForTab(_activeTab);
  if (specs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mb-build-empty';
    empty.textContent = 'Nada disponível';
    _gridEl.appendChild(empty);
    return;
  }
  // Eager-load both spritesheets we might need for this tab.
  const sheets = new Set(specs.map((s: CardSpec) => s.sprite({ enabled: false, tier: 1, cost: 0 }).sheet));
  for (const sheet of sheets) loadSheet(sheet);
  for (const spec of specs) {
    const state = spec.resolve(_selectedPlanet);
    _gridEl.appendChild(buildItem(spec, state));
  }
}

export function montarMobileBuild(host: HTMLDivElement): void {
  injectStyles();
  if (_host && _host.parentElement === host) return;
  // Tear down any previous mount so we don't double-attach.
  desmontarMobileBuild();

  const root = document.createElement('div');
  root.className = 'mb-build';

  _tabsEl = buildTabs();
  root.appendChild(_tabsEl);

  const list = document.createElement('div');
  list.className = 'mb-build-list';
  _gridEl = list;
  root.appendChild(list);

  host.appendChild(root);
  _host = root;
  _renderKey = '';
}

export function desmontarMobileBuild(): void {
  _host?.remove();
  _host = null;
  _tabsEl = null;
  _gridEl = null;
  _selectedPlanet = null;
  _renderKey = '';
  _sprites.length = 0;
}

export function atualizarMobileBuild(mundo: Mundo): void {
  if (!_host) return;
  _mundoRef = mundo;
  const planeta = getSelectedPlayerPlanet(mundo);
  if (!planeta) {
    if (_selectedPlanet) {
      _selectedPlanet = null;
      _gridEl?.replaceChildren();
      _renderKey = '';
    }
    return;
  }
  if (_selectedPlanet !== planeta) {
    _selectedPlanet = planeta;
    _renderKey = '';
  }
  const key = getRenderKey(planeta);
  if (key !== _renderKey) {
    renderActiveTab();
    _renderKey = key;
  }
}
