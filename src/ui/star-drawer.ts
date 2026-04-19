/**
 * Side drawer for stars. Mirrors the layout of the planet-drawer but
 * tailored to what a star actually has: color, size, and the list of
 * planets orbiting it. Non-blocking side panel — no backdrop, world
 * stays interactive behind it.
 */

import type { Mundo, Sol, Sistema } from '../types';
import { marcarInteracaoUi } from './interacao-ui';
import { nomeTipoPlaneta } from '../world/mundo';
import { getPersonalidades } from '../world/ia-decisao';
import { setCameraFollow } from '../core/player';
import { buildFocusIcon } from './planet-drawer';

let _modal: HTMLDivElement | null = null;
let _bodyEl: HTMLDivElement | null = null;
let _styleInjected = false;
let _closeResolver: (() => void) | null = null;
let _currentSol: Sol | null = null;
let _currentSistema: Sistema | null = null;
let _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let _lastRebuildMs = 0;

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .estrela-drawer {
      position: fixed;
      top: 50%;
      left: auto;
      right: var(--hud-margin);
      bottom: auto;
      width: clamp(280px, 24vw, 360px);
      max-height: calc(100vh - var(--hud-unit) * 16);
      margin: 0;
      box-sizing: border-box;
      background: var(--hud-bg);
      border: 1px solid var(--hud-border);
      border-radius: var(--hud-radius);
      box-shadow: var(--hud-shadow);
      color: var(--hud-text);
      font-family: var(--hud-font-body);
      z-index: 941;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translate(calc(100% + var(--hud-margin) * 2), -50%);
      transition:
        opacity 220ms ease-out,
        transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1),
        visibility 0s linear 320ms;
    }
    .estrela-drawer.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translate(0, -50%);
      transition:
        opacity 220ms ease-out,
        transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1),
        visibility 0s linear 0s;
    }

    .estrela-drawer-head {
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.6);
      padding: calc(var(--hud-unit) * 0.7) calc(var(--hud-unit) * 0.9);
      border-bottom: 1px solid var(--hud-line);
    }
    .estrela-drawer-disc {
      width: calc(var(--hud-unit) * 4.5);
      height: calc(var(--hud-unit) * 4.5);
      border: 1px solid var(--hud-line);
      border-radius: 50%;
      flex-shrink: 0;
    }
    .estrela-drawer-meta {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.2);
      flex: 1;
      min-width: 0;
    }
    .estrela-drawer-name {
      font-family: var(--hud-font-display);
      font-size: calc(var(--hud-unit) * 1.1);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1.1;
      color: var(--hud-text);
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .estrela-drawer-tipo {
      font-family: var(--hud-font);
      font-size: calc(var(--hud-unit) * 0.8);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
    }

    .estrela-drawer-body {
      padding: calc(var(--hud-unit) * 0.6) calc(var(--hud-unit) * 0.8) calc(var(--hud-unit) * 0.7);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.5);
    }

    .estrela-card {
      border: 1px solid var(--hud-line);
      border-radius: calc(var(--hud-radius) * 0.7);
      padding: calc(var(--hud-unit) * 0.5) calc(var(--hud-unit) * 0.6);
      background: rgba(255,255,255,0.02);
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.25);
    }
    .estrela-card-title {
      font-family: var(--hud-font);
      font-size: calc(var(--hud-unit) * 0.8);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
      margin: 0 0 calc(var(--hud-unit) * 0.2);
    }

    .estrela-planet-row {
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.4);
      padding: calc(var(--hud-unit) * 0.3) 0;
      font-size: calc(var(--hud-unit) * 0.9);
      border-bottom: 1px solid var(--hud-line);
    }
    .estrela-planet-row:last-child { border-bottom: none; }
    .estrela-planet-dot {
      width: calc(var(--hud-unit) * 0.55);
      height: calc(var(--hud-unit) * 0.55);
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.3);
      flex-shrink: 0;
    }
    .estrela-planet-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .estrela-planet-tipo {
      color: var(--hud-text-dim);
      font-size: calc(var(--hud-unit) * 0.75);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .estrela-drawer-focus {
      align-self: flex-start;
      width: calc(var(--hud-unit) * 2);
      height: calc(var(--hud-unit) * 2);
      display: grid;
      place-items: center;
      padding: 0;
      margin: 0;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--hud-line);
      border-radius: calc(var(--hud-radius) * 0.5);
      color: var(--hud-text-dim);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
      flex-shrink: 0;
    }
    .estrela-drawer-focus:hover {
      background: rgba(255,255,255,0.10);
      color: var(--hud-text);
      border-color: var(--hud-border);
    }
    .estrela-drawer-focus svg { width: 60%; height: 60%; display: block; }
  `;
  document.head.appendChild(style);
}

function corHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function nomeEstrela(sol: Sol, sistema: Sistema | null): string {
  // sol.id = "sol-N" onde N é o indice do sistema. Usar N+1 pro humano.
  const match = sol.id.match(/(\d+)$/);
  const n = match ? parseInt(match[1], 10) + 1 : 0;
  if (sistema && n > 0) return `Estrela ${n}`;
  return sol.id;
}

function ownerColor(dono: string): string {
  if (dono === 'jogador') return '#44aaff';
  if (dono === 'neutro') return '#777';
  const ia = getPersonalidades().find((x) => x.id === dono);
  if (ia) return corHex(ia.cor);
  return '#aaa';
}

function removeAllChildren(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function buildHeader(sol: Sol, sistema: Sistema | null): HTMLDivElement {
  const head = document.createElement('div');
  head.className = 'estrela-drawer-head';

  const disc = document.createElement('div');
  disc.className = 'estrela-drawer-disc';
  disc.style.background = `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), ${corHex(sol._cor)} 55%, rgba(0,0,0,0.45) 100%)`;
  head.appendChild(disc);

  const meta = document.createElement('div');
  meta.className = 'estrela-drawer-meta';
  const h = document.createElement('h2');
  h.className = 'estrela-drawer-name';
  h.textContent = nomeEstrela(sol, sistema);
  meta.appendChild(h);
  const tipo = document.createElement('div');
  tipo.className = 'estrela-drawer-tipo';
  tipo.textContent = sistema ? `${sistema.planetas.length} planetas` : 'Estrela';
  meta.appendChild(tipo);
  head.appendChild(meta);

  const focusBtn = document.createElement('button');
  focusBtn.type = 'button';
  focusBtn.className = 'estrela-drawer-focus';
  focusBtn.title = 'Centralizar câmera';
  focusBtn.setAttribute('aria-label', 'Centralizar câmera na estrela');
  focusBtn.appendChild(buildFocusIcon());
  focusBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setCameraFollow(sol);
  });
  head.appendChild(focusBtn);

  return head;
}

function buildCardPlanetas(sistema: Sistema | null): HTMLDivElement | null {
  if (!sistema || sistema.planetas.length === 0) return null;
  const card = document.createElement('div');
  card.className = 'estrela-card';
  const title = document.createElement('div');
  title.className = 'estrela-card-title';
  title.textContent = 'Planetas';
  card.appendChild(title);

  for (const p of sistema.planetas) {
    const row = document.createElement('div');
    row.className = 'estrela-planet-row';
    const dot = document.createElement('div');
    dot.className = 'estrela-planet-dot';
    dot.style.background = ownerColor(p.dados.dono);
    row.appendChild(dot);
    const name = document.createElement('span');
    name.className = 'estrela-planet-name';
    name.textContent = p.dados.nome;
    row.appendChild(name);
    const tipo = document.createElement('span');
    tipo.className = 'estrela-planet-tipo';
    tipo.textContent = nomeTipoPlaneta(p.dados.tipoPlaneta);
    row.appendChild(tipo);
    card.appendChild(row);
  }
  return card;
}

function rebuildBody(sistema: Sistema | null): void {
  if (!_bodyEl) return;
  removeAllChildren(_bodyEl);
  const card = buildCardPlanetas(sistema);
  if (card) _bodyEl.appendChild(card);
}

function ensureModal(): void {
  if (_modal) return;
  injectStyles();
  const modal = document.createElement('div');
  modal.className = 'estrela-drawer';
  modal.setAttribute('data-ui', 'true');
  modal.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    marcarInteracaoUi();
  });
  _modal = modal;
  document.body.appendChild(modal);

  _keydownHandler = (e: KeyboardEvent) => {
    if (_closeResolver && e.key === 'Escape') { e.preventDefault(); fecharStarDrawer(); }
  };
  window.addEventListener('keydown', _keydownHandler);
}

function findSistema(mundo: Mundo, sol: Sol): Sistema | null {
  return mundo.sistemas.find((s) => s.sol === sol) ?? null;
}

export function abrirStarDrawer(sol: Sol, mundo: Mundo): Promise<void> {
  ensureModal();
  if (!_modal) return Promise.resolve();
  if (_closeResolver && _currentSol === sol) return Promise.resolve();

  if (_closeResolver && _currentSol !== sol) {
    const prev = _closeResolver;
    _closeResolver = null;
    prev();
  }

  const sistema = findSistema(mundo, sol);
  _currentSol = sol;
  _currentSistema = sistema;
  _lastRebuildMs = performance.now();

  removeAllChildren(_modal);
  _modal.appendChild(buildHeader(sol, sistema));
  const body = document.createElement('div');
  body.className = 'estrela-drawer-body';
  _bodyEl = body;
  _modal.appendChild(body);
  rebuildBody(sistema);

  _modal.classList.add('visible');

  return new Promise<void>((resolve) => { _closeResolver = resolve; });
}

const REBUILD_INTERVALO_MS = 500;

export function atualizarStarDrawer(): void {
  if (!_modal || !_currentSol || !_currentSistema) return;
  const now = performance.now();
  if (now - _lastRebuildMs < REBUILD_INTERVALO_MS) return;
  _lastRebuildMs = now;
  rebuildBody(_currentSistema);
}

export function fecharStarDrawer(): void {
  if (!_modal) return;
  _modal.classList.remove('visible');
  _currentSol = null;
  _currentSistema = null;
  const r = _closeResolver;
  _closeResolver = null;
  if (r) r();
}

export function isStarDrawerAberto(): boolean {
  return !!_closeResolver;
}
