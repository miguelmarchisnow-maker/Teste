/**
 * Rich in-game side drawer for a star. Mirrors planet-drawer in
 * structure, lifecycle and update cadence: header (live shader portrait
 * + meta + focus button), scrollable body with grouped cards, ESC /
 * click-outside close, Promise resolved on close, throttled re-render.
 *
 * Non-blocking — sits above the world canvas without a backdrop.
 */

import type { Mundo, Sistema, Sol, Planeta } from '../types';
import { marcarInteracaoUi } from './interacao-ui';
import { nomeTipoPlaneta } from '../world/mundo';
import { getPersonalidades } from '../world/ia-decisao';
import { gerarImperioLore } from '../world/lore/imperio-lore';
import { abrirImperioLore } from './lore-modal';
import { renderPlanetaParaCanvas, liberarPortraitPlaneta } from '../world/planeta-procedural';
import { setCameraFollow, setCameraPos } from '../core/player';
import { selecionarPlaneta } from '../world/mundo';
import { abrirPlanetaDrawer, fecharPlanetaDrawer, buildFocusIcon } from './planet-drawer';
import { abrirMobilePlanetaDrawer, fecharMobilePlanetaDrawer } from './mobile-planet-drawer';
import { isTouchMode } from '../core/ui-mode';

let _modal: HTMLDivElement | null = null;
let _bodyEl: HTMLDivElement | null = null;
let _styleInjected = false;
let _closeResolver: (() => void) | null = null;
let _currentSol: Sol | null = null;
let _currentSistema: Sistema | null = null;
let _currentMundo: Mundo | null = null;
let _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let _lastRebuildMs = 0;
let _portraitCanvas: HTMLCanvasElement | null = null;
let _lastPortraitRefreshMs = 0;

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
    .estrela-drawer-portrait {
      width: calc(var(--hud-unit) * 4.5);
      height: calc(var(--hud-unit) * 4.5);
      border: 1px solid var(--hud-line);
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.08), rgba(0,0,0,0.4));
      display: grid;
      place-items: center;
      flex-shrink: 0;
      overflow: hidden;
      position: relative;
    }
    .estrela-drawer-portrait canvas {
      width: 100%;
      height: 100%;
      display: block;
      border-radius: 50%;
      /* The star shader paints a disc occupying only ~1/2.9 of the
         quad (the rest is reserved for the world-space glow halo).
         Compensate by scaling the canvas so the visible disc fills
         the portrait circle. Portrait has overflow:hidden so the
         scaled-off glow is safely clipped. */
      transform: scale(2.4);
      transform-origin: center;
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
    .estrela-drawer-classe {
      font-family: var(--hud-font);
      font-size: calc(var(--hud-unit) * 0.8);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
    }
    .estrela-drawer-sub {
      font-size: calc(var(--hud-unit) * 0.8);
      color: var(--hud-text-dim);
      margin-top: calc(var(--hud-unit) * 0.1);
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

    .estrela-stats-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: calc(var(--hud-unit) * 0.4);
      font-size: calc(var(--hud-unit) * 0.9);
    }
    .estrela-stats-label { color: var(--hud-text-dim); }
    .estrela-stats-value { color: var(--hud-text); font-variant-numeric: tabular-nums; }

    .estrela-owner-row {
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.4);
      padding: calc(var(--hud-unit) * 0.25) 0;
      font-size: calc(var(--hud-unit) * 0.9);
      cursor: default;
    }
    .estrela-owner-row.clickable { cursor: pointer; }
    .estrela-owner-row.clickable:hover .estrela-owner-name { text-decoration: underline; }
    .estrela-owner-dot {
      width: calc(var(--hud-unit) * 0.65);
      height: calc(var(--hud-unit) * 0.65);
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.3);
      flex-shrink: 0;
    }
    .estrela-owner-name { flex: 1; color: var(--hud-text); }
    .estrela-owner-count {
      color: var(--hud-text-dim);
      font-variant-numeric: tabular-nums;
    }

    .estrela-planet-row {
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.4);
      padding: calc(var(--hud-unit) * 0.35) calc(var(--hud-unit) * 0.2);
      margin: 0 calc(var(--hud-unit) * -0.2);
      font-size: calc(var(--hud-unit) * 0.9);
      border-radius: calc(var(--hud-radius) * 0.4);
      cursor: pointer;
      transition: background 120ms ease;
      border-bottom: 1px solid var(--hud-line);
    }
    .estrela-planet-row:last-child { border-bottom: none; }
    .estrela-planet-row:hover { background: rgba(255,255,255,0.05); }
    .estrela-planet-dot {
      width: calc(var(--hud-unit) * 0.6);
      height: calc(var(--hud-unit) * 0.6);
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.3);
      flex-shrink: 0;
    }
    .estrela-planet-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .estrela-planet-name {
      color: var(--hud-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .estrela-planet-tipo {
      color: var(--hud-text-dim);
      font-size: calc(var(--hud-unit) * 0.72);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .estrela-planet-arrow {
      color: var(--hud-text-dim);
      font-size: calc(var(--hud-unit) * 0.9);
      flex-shrink: 0;
    }

    .estrela-empty {
      color: var(--hud-text-dim);
      font-style: italic;
      font-size: calc(var(--hud-unit) * 0.9);
    }
  `;
  document.head.appendChild(style);
}

function corHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0').toUpperCase();
}

function ownerLabel(dono: string): string {
  if (dono === 'jogador') return 'Seu Império';
  if (dono === 'neutro') return 'Neutro';
  const ia = getPersonalidades().find((x) => x.id === dono);
  return ia?.nome ?? 'Desconhecido';
}

function ownerColor(dono: string): string {
  if (dono === 'jogador') return '#44aaff';
  if (dono === 'neutro') return '#888888';
  const ia = getPersonalidades().find((x) => x.id === dono);
  if (ia) return corHex(ia.cor);
  return '#888888';
}

/**
 * Rough visual-temperature classification from the sun's primary color.
 * The palette in criarEstrelaProcedural picks from Sol-like (yellow),
 * red dwarf and blue giant templates — fold `_cor` (a hex tint) into
 * one of those classes so the drawer shows a readable star class.
 */
function classeEstrela(cor: number): { nome: string; descricao: string } {
  const r = (cor >> 16) & 0xff;
  const g = (cor >> 8) & 0xff;
  const b = cor & 0xff;
  if (b > r && b > g * 0.95) {
    return { nome: 'Estrela tipo B', descricao: 'Gigante azul' };
  }
  if (r > 180 && g < 140 && b < 120) {
    return { nome: 'Estrela tipo M', descricao: 'Anã vermelha' };
  }
  if (r > 220 && g > 180 && b < 150) {
    return { nome: 'Estrela tipo G', descricao: 'Anã amarela' };
  }
  return { nome: 'Estrela tipo F', descricao: 'Sequência principal' };
}

function nomeEstrela(sol: Sol): string {
  const match = sol.id.match(/(\d+)$/);
  const n = match ? parseInt(match[1], 10) + 1 : 0;
  if (n > 0) return `Estrela ${String(n).padStart(3, '0')}`;
  return sol.id;
}

function removeAllChildren(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ─── Cards ──────────────────────────────────────────────────────────

function cardVisaoGeral(sol: Sol, sistema: Sistema | null): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'estrela-card';
  const t = document.createElement('h3');
  t.className = 'estrela-card-title';
  t.textContent = 'Visão Geral';
  card.appendChild(t);

  const cls = classeEstrela(sol._cor);
  const raio = Math.round(sol._raio);
  const descobertos = sistema ? sistema.planetas.filter((p) => p._descobertoAoJogador).length : 0;
  const rows: Array<[string, string]> = [
    ['Classe', cls.nome],
    ['Descrição', cls.descricao],
    ['Raio estelar', `${raio} u`],
    ['Planetas descobertos', sistema ? String(descobertos) : '—'],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'estrela-stats-row';
    const l = document.createElement('span');
    l.className = 'estrela-stats-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'estrela-stats-value';
    v.textContent = value;
    row.append(l, v);
    card.appendChild(row);
  }
  return card;
}

/**
 * Aggregates ownership across the system's planets and renders one row
 * per empire with its holdings count. Empires are clickable — opens the
 * imperio-lore modal, matching the pattern used in planet-drawer's
 * owner row.
 */
function cardControle(sistema: Sistema | null, mundo: Mundo | null): HTMLDivElement | null {
  if (!sistema) return null;
  const descobertos = sistema.planetas.filter((p) => p._descobertoAoJogador);
  if (descobertos.length === 0) return null;
  const card = document.createElement('div');
  const t = document.createElement('h3');
  card.className = 'estrela-card';
  t.className = 'estrela-card-title';
  t.textContent = 'Controle do Sistema';
  card.appendChild(t);

  const counts = new Map<string, number>();
  for (const p of descobertos) {
    const dono = p.dados.dono;
    counts.set(dono, (counts.get(dono) ?? 0) + 1);
  }
  // Order: jogador, then IAs by count desc, neutro last.
  const ordered = Array.from(counts.entries()).sort((a, b) => {
    if (a[0] === 'jogador') return -1;
    if (b[0] === 'jogador') return 1;
    if (a[0] === 'neutro') return 1;
    if (b[0] === 'neutro') return -1;
    return b[1] - a[1];
  });

  for (const [dono, n] of ordered) {
    const row = document.createElement('div');
    row.className = 'estrela-owner-row';
    const dot = document.createElement('div');
    dot.className = 'estrela-owner-dot';
    dot.style.background = ownerColor(dono);
    const name = document.createElement('span');
    name.className = 'estrela-owner-name';
    name.textContent = ownerLabel(dono);
    const count = document.createElement('span');
    count.className = 'estrela-owner-count';
    count.textContent = `${n} planeta${n === 1 ? '' : 's'}`;
    row.append(dot, name, count);

    const ia = getPersonalidades().find((x) => x.id === dono);
    if (ia && mundo) {
      row.classList.add('clickable');
      row.title = 'Ver arquivo imperial';
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const loreIA = gerarImperioLore({
          empireId: ia.id,
          galaxySeed: mundo.galaxySeed,
          personalidade: ia,
          nomeImperio: ia.nome,
        });
        void abrirImperioLore(loreIA);
      });
    }
    card.appendChild(row);
  }
  return card;
}

function openPlaneta(p: Planeta, mundo: Mundo): void {
  selecionarPlaneta(mundo, p);
  setCameraPos(p.x, p.y);
  if (isTouchMode()) {
    void abrirMobilePlanetaDrawer(p, mundo);
  } else {
    void abrirPlanetaDrawer(p, mundo);
  }
  // Close the star drawer so the planet drawer takes its slot.
  close();
}

function cardPlanetas(sistema: Sistema | null, mundo: Mundo | null): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'estrela-card';
  const t = document.createElement('h3');
  t.className = 'estrela-card-title';
  t.textContent = 'Planetas';
  card.appendChild(t);

  const descobertos = sistema ? sistema.planetas.filter((p) => p._descobertoAoJogador) : [];
  if (descobertos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'estrela-empty';
    empty.textContent = 'Nenhum planeta descoberto neste sistema.';
    card.appendChild(empty);
    return card;
  }

  for (const p of descobertos) {
    const row = document.createElement('div');
    row.className = 'estrela-planet-row';

    const dot = document.createElement('div');
    dot.className = 'estrela-planet-dot';
    dot.style.background = ownerColor(p.dados.dono);
    row.appendChild(dot);

    const info = document.createElement('div');
    info.className = 'estrela-planet-info';
    const name = document.createElement('span');
    name.className = 'estrela-planet-name';
    name.textContent = p.dados.nome;
    info.appendChild(name);
    const tipo = document.createElement('span');
    tipo.className = 'estrela-planet-tipo';
    tipo.textContent = `${nomeTipoPlaneta(p.dados.tipoPlaneta)} · ${ownerLabel(p.dados.dono)}`;
    info.appendChild(tipo);
    row.appendChild(info);

    const arrow = document.createElement('span');
    arrow.className = 'estrela-planet-arrow';
    arrow.textContent = '›';
    row.appendChild(arrow);
    row.title = `Abrir ${p.dados.nome}`;
    row.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!mundo) return;
      openPlaneta(p, mundo);
    });
    card.appendChild(row);
  }
  return card;
}

// ─── Portrait (live shader) ─────────────────────────────────────────

const PORTRAIT_REFRESH_MS = 500;

function refreshPortrait(sol: Sol, portraitEl: HTMLElement): void {
  // Suns are built by criarEstrelaProcedural and carry _planetShader —
  // renderPlanetaParaCanvas works on any such mesh (it doesn't care
  // whether the shader paints a planet or a sun).
  const canvas = renderPlanetaParaCanvas(sol as unknown as Planeta, 160);
  if (!canvas) return;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.borderRadius = '50%';
  if (_portraitCanvas && _portraitCanvas.parentElement === portraitEl) {
    portraitEl.replaceChild(canvas, _portraitCanvas);
  } else {
    removeAllChildren(portraitEl);
    portraitEl.appendChild(canvas);
  }
  _portraitCanvas = canvas;
  _lastPortraitRefreshMs = performance.now();
}

function tickPortraitIfDue(): void {
  if (!_modal || !_currentSol) return;
  const portraitEl = _modal.querySelector<HTMLElement>('.estrela-drawer-portrait');
  if (!portraitEl) return;
  const now = performance.now();
  if (now - _lastPortraitRefreshMs < PORTRAIT_REFRESH_MS) return;
  refreshPortrait(_currentSol, portraitEl);
}

// ─── Header + body ──────────────────────────────────────────────────

function buildHeader(sol: Sol, sistema: Sistema | null): HTMLDivElement {
  const head = document.createElement('div');
  head.className = 'estrela-drawer-head';

  const portrait = document.createElement('div');
  portrait.className = 'estrela-drawer-portrait';
  portrait.style.background = `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), ${corHex(sol._cor)} 55%, rgba(0,0,0,0.45) 100%)`;
  head.appendChild(portrait);
  refreshPortrait(sol, portrait);

  const meta = document.createElement('div');
  meta.className = 'estrela-drawer-meta';
  const h = document.createElement('h2');
  h.className = 'estrela-drawer-name';
  h.textContent = nomeEstrela(sol);
  meta.appendChild(h);
  const classe = document.createElement('div');
  classe.className = 'estrela-drawer-classe';
  classe.textContent = classeEstrela(sol._cor).nome;
  meta.appendChild(classe);
  const descobertos = sistema
    ? sistema.planetas.filter((p) => p._descobertoAoJogador).length
    : 0;
  const sub = document.createElement('div');
  sub.className = 'estrela-drawer-sub';
  sub.textContent = sistema
    ? `${descobertos} planeta${descobertos === 1 ? '' : 's'} descoberto${descobertos === 1 ? '' : 's'}`
    : 'Sistema isolado';
  meta.appendChild(sub);
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

function rebuildBody(sistema: Sistema | null, mundo: Mundo | null, sol: Sol): void {
  if (!_bodyEl) return;
  removeAllChildren(_bodyEl);
  _bodyEl.appendChild(cardVisaoGeral(sol, sistema));
  const controle = cardControle(sistema, mundo);
  if (controle) _bodyEl.appendChild(controle);
  _bodyEl.appendChild(cardPlanetas(sistema, mundo));
}

// ─── Public API ─────────────────────────────────────────────────────

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
    if (_closeResolver && e.key === 'Escape') { e.preventDefault(); close(); }
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

  // When opening the star drawer, any planet drawer must yield — they
  // share the same right-edge slot.
  if (isTouchMode()) fecharMobilePlanetaDrawer();
  else fecharPlanetaDrawer();

  const sistema = findSistema(mundo, sol);
  _currentSol = sol;
  _currentSistema = sistema;
  _currentMundo = mundo;
  _lastRebuildMs = performance.now();

  removeAllChildren(_modal);
  _modal.appendChild(buildHeader(sol, sistema));
  const body = document.createElement('div');
  body.className = 'estrela-drawer-body';
  _bodyEl = body;
  _modal.appendChild(body);
  rebuildBody(sistema, mundo, sol);

  _modal.classList.add('visible');

  return new Promise<void>((resolve) => { _closeResolver = resolve; });
}

const REBUILD_INTERVALO_MS = 500;

export function atualizarStarDrawer(): void {
  if (!_closeResolver || !_currentSol || !_bodyEl) return;
  tickPortraitIfDue();
  const now = performance.now();
  if (now - _lastRebuildMs < REBUILD_INTERVALO_MS) return;
  _lastRebuildMs = now;
  rebuildBody(_currentSistema, _currentMundo, _currentSol);
}

export function isStarDrawerAberto(): boolean {
  return _closeResolver !== null;
}

function close(): void {
  _modal?.classList.remove('visible');
  _currentSol = null;
  _currentSistema = null;
  _currentMundo = null;
  _portraitCanvas = null;
  _lastPortraitRefreshMs = 0;
  liberarPortraitPlaneta();
  const r = _closeResolver;
  _closeResolver = null;
  if (r) r();
}

export function fecharStarDrawer(): void {
  if (_closeResolver) close();
}

export function destruirStarDrawer(): void {
  if (_keydownHandler) {
    window.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  _modal?.remove();
  _modal = null;
  _bodyEl = null;
  _styleInjected = false;
  _lastRebuildMs = 0;
  _portraitCanvas = null;
  _lastPortraitRefreshMs = 0;
  if (_closeResolver) {
    const r = _closeResolver;
    _closeResolver = null;
    r();
  }
}
