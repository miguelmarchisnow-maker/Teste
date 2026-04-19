import type { Mundo } from '../types';
import { gerarSigilo, gerarSigiloManual } from './empire-builder/sigilos';
import { registerBadge, unregisterBadge } from './hud-layout';

let _container: HTMLDivElement | null = null;
let _nameEl: HTMLDivElement | null = null;
let _levelEl: HTMLDivElement | null = null;
let _crestEl: HTMLDivElement | null = null;
let _crestSigiloKey: string | null = null;
let _styleInjected = false;
let _onClick: (() => void) | null = null;

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .empire-badge {
      top: var(--hud-margin);
      left: var(--hud-margin);
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 1.1);
      padding: calc(var(--hud-unit) * 0.9) calc(var(--hud-unit) * 1.7)
               calc(var(--hud-unit) * 0.9) calc(var(--hud-unit) * 1);
      min-height: calc(var(--hud-unit) * 5.4);
      box-sizing: border-box;
      font-family: var(--hud-font);
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease;
      user-select: none;
    }
    .empire-badge:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 1);
    }
    .empire-badge:active {
      transform: translateY(1px);
    }

    .empire-crest {
      width: calc(var(--hud-unit) * 3.6);
      height: calc(var(--hud-unit) * 3.6);
      flex-shrink: 0;
    }

    .empire-crest svg {
      width: 100%;
      height: 100%;
    }

    .empire-text {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.2);
    }

    .empire-name {
      font-size: var(--hud-text-md);
      font-weight: bold;
      color: var(--hud-text);
      letter-spacing: 2px;
      line-height: 1;
    }

    .empire-level {
      font-size: var(--hud-text-sm);
      color: var(--hud-text-dim);
      letter-spacing: 1.5px;
      line-height: 1;
    }
  `;
  document.head.appendChild(style);
}

function createCrestSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '24');
  circle.setAttribute('cy', '24');
  circle.setAttribute('r', '21');
  circle.setAttribute('stroke', 'rgba(255,255,255,0.7)');
  circle.setAttribute('stroke-width', '1.5');
  svg.appendChild(circle);

  const shield = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shield.setAttribute('d', 'M24 10l10 5v8c0 6-4 10.5-10 12.5-6-2-10-6.5-10-12.5v-8l10-5z');
  shield.setAttribute('stroke', 'rgba(255,255,255,0.8)');
  shield.setAttribute('stroke-width', '1.2');
  shield.setAttribute('fill', 'rgba(255,255,255,0.08)');
  svg.appendChild(shield);

  const deco = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  deco.setAttribute('d', 'M24 16l2 4 4 1-3 3 .5 4-3.5-2-3.5 2 .5-4-3-3 4-1 2-4z');
  deco.setAttribute('fill', 'rgba(255,255,255,0.9)');
  svg.appendChild(deco);

  for (const [cx, cy] of [[24, 30], [20, 28], [28, 28], [22, 32], [26, 32]]) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '1');
    dot.setAttribute('fill', 'rgba(255,255,255,0.7)');
    svg.appendChild(dot);
  }

  return svg;
}

export function criarEmpireBadge(empireName: string, level: number): HTMLDivElement {
  if (_container) return _container;
  injectStyles();

  const badge = document.createElement('div');
  badge.className = 'hud-panel empire-badge';
  badge.setAttribute('role', 'button');
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('aria-label', 'Abrir painel do império');

  const crest = document.createElement('div');
  crest.className = 'empire-crest';
  crest.appendChild(createCrestSvg());
  _crestEl = crest;
  badge.appendChild(crest);

  const text = document.createElement('div');
  text.className = 'empire-text';

  const name = document.createElement('div');
  name.className = 'empire-name';
  name.textContent = empireName.toUpperCase();
  _nameEl = name;
  text.appendChild(name);

  const lvl = document.createElement('div');
  lvl.className = 'empire-level';
  lvl.textContent = `LEVEL ${level}`;
  _levelEl = lvl;
  text.appendChild(lvl);

  badge.appendChild(text);

  badge.addEventListener('click', () => {
    if (_onClick) _onClick();
  });
  badge.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && _onClick) {
      e.preventDefault();
      _onClick();
    }
  });

  _container = badge;
  document.body.appendChild(badge);
  registerBadge(badge);

  return badge;
}

/** Registers the handler invoked when the player clicks the badge. */
export function setEmpireBadgeOnClick(cb: (() => void) | null): void {
  _onClick = cb;
}

/** Syncs the visible badge content with the current mundo state:
 *  - name from the authored empire (falls back to the original placeholder)
 *  - sigil crest rendered from the empire's seed/manual when available
 *  - "LEVEL" = planets controlled by the player (the value that
 *    actually scales with progress, so the label finally means something)
 */
export function atualizarEmpireBadge(mundo: Mundo): void {
  if (!_container) return;
  const imp = mundo.imperioJogador;

  if (_nameEl && imp?.nome) {
    const upper = imp.nome.toUpperCase();
    if (_nameEl.textContent !== upper) _nameEl.textContent = upper;
  }

  if (_levelEl) {
    let planetas = 0;
    for (const p of mundo.planetas) {
      if (p.dados.dono === 'jogador') planetas++;
    }
    const text = `LEVEL ${planetas}`;
    if (_levelEl.textContent !== text) _levelEl.textContent = text;
  }

  if (_crestEl && imp?.logo) {
    // Re-render the crest only when the sigil identity changes — the
    // underlying gerarSigilo call isn't free (full SVG rebuild).
    const key = imp.logo.manual
      ? `m:${JSON.stringify(imp.logo.manual)}`
      : `s:${imp.logo.seed}`;
    if (key !== _crestSigiloKey) {
      _crestSigiloKey = key;
      const svg = imp.logo.manual ? gerarSigiloManual(imp.logo.manual) : gerarSigilo(imp.logo.seed);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      _crestEl.replaceChildren(svg);
    }
  }
}

export function destruirEmpireBadge(): void {
  if (_container) {
    unregisterBadge();
    _container.remove();
    _container = null;
    _nameEl = null;
    _levelEl = null;
    _crestEl = null;
    _crestSigiloKey = null;
    _onClick = null;
  }
}
