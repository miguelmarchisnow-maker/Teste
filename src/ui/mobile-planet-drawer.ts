// Mobile-specific planet drawer. Fully separate module from the desktop
// planet-drawer.ts — lives in its own DOM, owns its own styles, and uses
// mobile-build.ts inside the "Construir" tab. Desktop drawer is left
// untouched; main.ts / player.ts route based on isTouchMode().

import type { Mundo, Planeta } from '../types';
import { marcarInteracaoUi } from './interacao-ui';
import { nomeTipoPlaneta, getTierMax } from '../world/mundo';
import { oreIcon, alloyIcon, fuelIcon } from './resource-bar';
import { renderPlanetaParaCanvas, liberarPortraitPlaneta } from '../world/planeta-procedural';
import { abrirImperioLore } from './lore-modal';
import { getPersonalidades } from '../world/ia-decisao';
import { gerarImperioLore } from '../world/lore/imperio-lore';
import { montarMobileBuild, desmontarMobileBuild, atualizarMobileBuild } from './mobile-build';
import { setCameraFollow } from '../core/player';
import { buildFocusIcon } from './planet-drawer';

type Tab = 'planeta' | 'construir';

let _styleInjected = false;
let _modal: HTMLDivElement | null = null;
let _backdrop: HTMLDivElement | null = null;
let _bodyEl: HTMLDivElement | null = null;
let _buildWrap: HTMLDivElement | null = null;
let _tabPlanetBtn: HTMLButtonElement | null = null;
let _tabBuildBtn: HTMLButtonElement | null = null;
let _portraitCanvas: HTMLCanvasElement | null = null;
let _portraitEl: HTMLDivElement | null = null;
let _closeResolver: (() => void) | null = null;
let _currentPlaneta: Planeta | null = null;
let _currentMundo: Mundo | null = null;
let _activeTab: Tab = 'planeta';
let _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let _lastRebuildMs = 0;
let _lastPortraitRefreshMs = 0;
const REBUILD_INTERVALO_MS = 500;
const PORTRAIT_REFRESH_MS = 500;

function tipoPlanetaCor(tipo: string): string {
  if (tipo === 'marte') return '#c96a3a';
  if (tipo === 'gasoso') return '#9a7fc2';
  return '#4a9e6a';
}

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const orphan = document.head.querySelector('style[data-mobile-planet-drawer]');
  if (orphan) orphan.remove();
  const style = document.createElement('style');
  style.setAttribute('data-mobile-planet-drawer', '1');
  style.textContent = `
    .mpd-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
      z-index: 944;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1), visibility 0s linear 220ms;
    }
    .mpd-backdrop.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition: opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1), visibility 0s linear 0s;
    }
    .mpd-modal {
      position: fixed;
      inset: auto;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      width: min(92vw, 420px);
      max-width: 92vw;
      max-height: 82dvh;
      margin: 0;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.4);
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
    .mpd-modal.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translate(-50%, -50%) scale(1);
      transition:
        opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        transform 280ms cubic-bezier(0.2, 0.9, 0.2, 1.05),
        visibility 0s linear 0s;
    }
    .mpd-close {
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
    .mpd-close:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-color: rgba(255,255,255,0.7);
    }
    .mpd-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 48px 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .mpd-portrait {
      width: 56px;
      height: 56px;
      flex: 0 0 auto;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 50%;
      overflow: hidden;
      display: grid;
      place-items: center;
    }
    .mpd-portrait canvas {
      width: 100%;
      height: 100%;
      display: block;
      border-radius: 50%;
    }
    .mpd-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .mpd-name {
      font-family: var(--hud-font-display);
      font-size: 16px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #fff;
      line-height: 1.1;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mpd-tipo {
      font-size: 11px;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .mpd-focus {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      padding: 0;
      margin: 0;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 8px;
      color: rgba(255,255,255,0.75);
      cursor: pointer;
    }
    .mpd-focus:active { background: rgba(255,255,255,0.14); color: #fff; }
    .mpd-focus svg { width: 60%; height: 60%; display: block; }
    .mpd-owner {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: rgba(255,255,255,0.85);
      cursor: pointer;
      width: fit-content;
      margin-top: 2px;
    }
    .mpd-owner.clickable:hover .mpd-owner-name { text-decoration: underline; }
    .mpd-owner-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.35);
    }
    .mpd-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 10px 10px 6px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    .mpd-tab {
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
    .mpd-tab:hover:not(.active) {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.85);
    }
    .mpd-tab.active {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-color: #fff;
    }
    .mpd-body {
      flex: 1 1 auto;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      padding: 12px 14px 16px;
    }
    .mpd-build {
      flex: 1 1 auto;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
    }
    .mpd-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 10px;
    }
    .mpd-card:last-child { margin-bottom: 0; }
    .mpd-card-title {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin: 0 0 8px 0;
    }
    .mpd-resources {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .mpd-resource {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 4px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
    }
    .mpd-resource-icon {
      width: 22px;
      height: 22px;
      color: rgba(255,255,255,0.7);
    }
    .mpd-resource-icon svg { width: 100%; height: 100%; }
    .mpd-resource-value {
      font-family: var(--hud-font);
      font-size: 16px;
      color: #fff;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .mpd-resource-label {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
    }
    .mpd-stats-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      gap: 12px;
    }
    .mpd-stats-row:last-child { border-bottom: none; }
    .mpd-stats-label {
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.04em;
    }
    .mpd-stats-value {
      font-family: var(--hud-font);
      font-size: 13px;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
    /* Tab-switch animation. */
    @keyframes mpd-tab-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .mpd-body.tab-anim,
    .mpd-build.tab-anim {
      animation: mpd-tab-in 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .mpd-modal, .mpd-modal.visible, .mpd-backdrop { transition: opacity 120ms ease, visibility 0s linear 0s; transform: translate(-50%, -50%) scale(1); }
      .mpd-body.tab-anim, .mpd-build.tab-anim { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function buildCardRecursos(p: Planeta): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'mpd-card';
  const title = document.createElement('div');
  title.className = 'mpd-card-title';
  title.textContent = 'Recursos';
  card.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'mpd-resources';
  const tipos: Array<[string, () => SVGSVGElement, number]> = [
    ['Comum', oreIcon, p.dados.recursos.comum],
    ['Raro', alloyIcon, p.dados.recursos.raro],
    ['Fuel', fuelIcon, p.dados.recursos.combustivel],
  ];
  for (const [label, iconFn, val] of tipos) {
    const r = document.createElement('div');
    r.className = 'mpd-resource';
    const i = document.createElement('div');
    i.className = 'mpd-resource-icon';
    i.appendChild(iconFn());
    const v = document.createElement('div');
    v.className = 'mpd-resource-value';
    v.textContent = Math.floor(val).toString();
    const l = document.createElement('div');
    l.className = 'mpd-resource-label';
    l.textContent = label;
    r.append(i, v, l);
    grid.appendChild(r);
  }
  card.appendChild(grid);
  return card;
}

function buildCardInfra(p: Planeta): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'mpd-card';
  const title = document.createElement('div');
  title.className = 'mpd-card-title';
  title.textContent = 'Infraestrutura';
  card.appendChild(title);

  const rows: Array<[string, string]> = [
    ['Fábricas', `${p.dados.fabricas} / ${getTierMax()}`],
    ['Infraestrutura', `${p.dados.infraestrutura} / ${getTierMax()}`],
    ['Naves em órbita', String(p.dados.naves)],
    ['Tipo de mundo', nomeTipoPlaneta(p.dados.tipoPlaneta)],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'mpd-stats-row';
    const l = document.createElement('span'); l.className = 'mpd-stats-label'; l.textContent = label;
    const v = document.createElement('span'); v.className = 'mpd-stats-value'; v.textContent = value;
    row.append(l, v);
    card.appendChild(row);
  }
  return card;
}

function refreshPortrait(p: Planeta): void {
  if (!_portraitEl) return;
  const canvas = renderPlanetaParaCanvas(p, 120);
  if (!canvas) return;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.borderRadius = '50%';
  if (_portraitCanvas && _portraitCanvas.parentElement === _portraitEl) {
    _portraitEl.replaceChild(canvas, _portraitCanvas);
  } else {
    while (_portraitEl.firstChild) _portraitEl.removeChild(_portraitEl.firstChild);
    _portraitEl.appendChild(canvas);
  }
  _portraitCanvas = canvas;
  _lastPortraitRefreshMs = performance.now();
}

function tickPortrait(): void {
  if (!_currentPlaneta) return;
  const now = performance.now();
  if (now - _lastPortraitRefreshMs < PORTRAIT_REFRESH_MS) return;
  refreshPortrait(_currentPlaneta);
}

function rebuildBody(p: Planeta): void {
  if (!_bodyEl) return;
  while (_bodyEl.firstChild) _bodyEl.removeChild(_bodyEl.firstChild);
  _bodyEl.appendChild(buildCardRecursos(p));
  _bodyEl.appendChild(buildCardInfra(p));
}

function setTab(which: Tab): void {
  _activeTab = which;
  _tabPlanetBtn?.classList.toggle('active', which === 'planeta');
  _tabBuildBtn?.classList.toggle('active', which === 'construir');
  if (_bodyEl) _bodyEl.style.display = which === 'planeta' ? '' : 'none';
  if (_buildWrap) _buildWrap.style.display = which === 'construir' ? '' : 'none';

  if (which === 'construir' && _buildWrap) {
    montarMobileBuild(_buildWrap);
    if (_currentMundo) atualizarMobileBuild(_currentMundo);
  } else {
    desmontarMobileBuild();
  }

  // Tab-switch animation on whichever section is now visible.
  const showing = which === 'planeta' ? _bodyEl : _buildWrap;
  if (showing) {
    showing.classList.remove('tab-anim');
    void showing.offsetWidth;
    showing.classList.add('tab-anim');
  }
}

function ensureModal(): void {
  if (_modal) return;
  injectStyles();

  const backdrop = document.createElement('div');
  backdrop.className = 'mpd-backdrop';
  backdrop.addEventListener('click', () => close());
  document.body.appendChild(backdrop);
  _backdrop = backdrop;

  const modal = document.createElement('div');
  modal.className = 'mpd-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'mpd-title');
  modal.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    marcarInteracaoUi();
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mpd-close';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    marcarInteracaoUi();
    close();
  });
  modal.appendChild(closeBtn);

  // Head (portrait + meta). Content populated in abrirMobilePlanetaDrawer.
  const head = document.createElement('div');
  head.className = 'mpd-head';
  modal.appendChild(head);

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'mpd-tabs';
  const tP = document.createElement('button');
  tP.type = 'button';
  tP.className = 'mpd-tab active';
  tP.textContent = 'Planeta';
  const tB = document.createElement('button');
  tB.type = 'button';
  tB.className = 'mpd-tab';
  tB.textContent = 'Construir';
  tabs.append(tP, tB);
  _tabPlanetBtn = tP;
  _tabBuildBtn = tB;
  tP.addEventListener('click', (e) => { e.stopPropagation(); marcarInteracaoUi(); setTab('planeta'); });
  tB.addEventListener('click', (e) => { e.stopPropagation(); marcarInteracaoUi(); setTab('construir'); });
  modal.appendChild(tabs);

  // Body (Planeta tab content)
  const body = document.createElement('div');
  body.className = 'mpd-body';
  _bodyEl = body;
  modal.appendChild(body);

  // Build wrap (Construir tab content host for mobile-build)
  const buildWrap = document.createElement('div');
  buildWrap.className = 'mpd-build';
  buildWrap.style.display = 'none';
  _buildWrap = buildWrap;
  modal.appendChild(buildWrap);

  document.body.appendChild(modal);
  _modal = modal;

  _keydownHandler = (e: KeyboardEvent) => {
    if (!_closeResolver) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener('keydown', _keydownHandler);
}

function populateHead(p: Planeta, mundo: Mundo): void {
  if (!_modal) return;
  const head = _modal.querySelector<HTMLDivElement>('.mpd-head');
  if (!head) return;
  while (head.firstChild) head.removeChild(head.firstChild);

  // Portrait
  const portrait = document.createElement('div');
  portrait.className = 'mpd-portrait';
  portrait.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), ${tipoPlanetaCor(p.dados.tipoPlaneta)} 70%)`;
  _portraitEl = portrait;
  head.appendChild(portrait);
  _lastPortraitRefreshMs = 0;
  refreshPortrait(p);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'mpd-meta';
  const h = document.createElement('h2');
  h.className = 'mpd-name';
  h.id = 'mpd-title';
  h.textContent = p.dados.nome;
  meta.appendChild(h);

  const tipo = document.createElement('div');
  tipo.className = 'mpd-tipo';
  tipo.textContent = nomeTipoPlaneta(p.dados.tipoPlaneta);
  meta.appendChild(tipo);

  const owner = document.createElement('div');
  owner.className = 'mpd-owner';
  const dot = document.createElement('div');
  dot.className = 'mpd-owner-dot';
  const name = document.createElement('span');
  name.className = 'mpd-owner-name';
  const dono = p.dados.dono;
  const ia = getPersonalidades().find((x) => x.id === dono);
  if (dono === 'jogador') {
    dot.style.background = '#44aaff';
    name.textContent = 'Seu Império';
  } else if (dono === 'neutro') {
    dot.style.background = '#777';
    name.textContent = 'Neutro';
  } else if (ia) {
    dot.style.background = `#${ia.cor.toString(16).padStart(6, '0')}`;
    name.textContent = ia.nome;
    owner.classList.add('clickable');
    owner.addEventListener('click', (e) => {
      e.stopPropagation();
      marcarInteracaoUi();
      const loreIA = gerarImperioLore({
        empireId: ia.id,
        galaxySeed: mundo.galaxySeed,
        personalidade: ia,
        nomeImperio: ia.nome,
      });
      void abrirImperioLore(loreIA);
    });
  } else {
    dot.style.background = '#aaa';
    name.textContent = dono;
  }
  owner.append(dot, name);
  meta.appendChild(owner);

  head.appendChild(meta);

  const focusBtn = document.createElement('button');
  focusBtn.type = 'button';
  focusBtn.className = 'mpd-focus';
  focusBtn.title = 'Centralizar câmera';
  focusBtn.setAttribute('aria-label', 'Centralizar câmera no planeta');
  focusBtn.appendChild(buildFocusIcon());
  focusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    marcarInteracaoUi();
    setCameraFollow(p);
  });
  head.appendChild(focusBtn);
}

function close(): void {
  if (!_modal || !_backdrop) return;
  _modal.classList.remove('visible');
  _backdrop.classList.remove('visible');
  desmontarMobileBuild();
  _currentPlaneta = null;
  _currentMundo = null;
  _portraitCanvas = null;
  _portraitEl = null;
  _lastPortraitRefreshMs = 0;
  liberarPortraitPlaneta();
  const r = _closeResolver;
  _closeResolver = null;
  if (r) r();
}

export function abrirMobilePlanetaDrawer(planeta: Planeta, mundo: Mundo): Promise<void> {
  ensureModal();
  if (!_modal || !_backdrop) return Promise.resolve();
  if (_closeResolver && _currentPlaneta === planeta) return Promise.resolve();

  const wasOpen = _closeResolver !== null;

  // Switching planet while open — resolve old promise first.
  if (wasOpen && _currentPlaneta !== planeta) {
    const prev = _closeResolver!;
    _closeResolver = null;
    prev();
  }

  _currentPlaneta = planeta;
  _currentMundo = mundo;
  _lastRebuildMs = performance.now();

  populateHead(planeta, mundo);
  rebuildBody(planeta);

  // Always land on Planeta tab on a fresh open.
  if (!wasOpen) setTab('planeta');
  else if (_activeTab === 'construir' && _currentMundo) atualizarMobileBuild(_currentMundo);

  // Force reflow so the CSS transitions fire reliably on first show.
  void _modal.offsetHeight;
  _backdrop.classList.add('visible');
  _modal.classList.add('visible');

  // Switching planets re-runs the scale-in animation.
  if (wasOpen) {
    const el = _modal;
    el.classList.remove('visible');
    void el.offsetHeight;
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  return new Promise<void>((resolve) => { _closeResolver = resolve; });
}

export function atualizarMobilePlanetaDrawer(): void {
  if (!_closeResolver || !_currentPlaneta || !_currentMundo) return;
  if (_activeTab === 'construir') {
    atualizarMobileBuild(_currentMundo);
  }
  tickPortrait();
  const now = performance.now();
  if (now - _lastRebuildMs < REBUILD_INTERVALO_MS) return;
  _lastRebuildMs = now;
  if (_activeTab === 'planeta') rebuildBody(_currentPlaneta);
}

export function isMobilePlanetaDrawerAberto(): boolean {
  return _closeResolver !== null;
}

export function fecharMobilePlanetaDrawer(): void {
  if (_closeResolver) close();
}

export function destruirMobilePlanetaDrawer(): void {
  if (_keydownHandler) {
    window.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  _modal?.remove();
  _backdrop?.remove();
  _modal = null;
  _backdrop = null;
  _bodyEl = null;
  _buildWrap = null;
  _tabPlanetBtn = null;
  _tabBuildBtn = null;
  _portraitCanvas = null;
  _portraitEl = null;
  _currentPlaneta = null;
  _currentMundo = null;
  _activeTab = 'planeta';
  _lastRebuildMs = 0;
  _lastPortraitRefreshMs = 0;
  _styleInjected = false;
  if (_closeResolver) {
    const r = _closeResolver;
    _closeResolver = null;
    r();
  }
}
