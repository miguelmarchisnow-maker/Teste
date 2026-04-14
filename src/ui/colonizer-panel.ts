import type { Mundo, Nave, Planeta } from '../types';
import { marcarInteracaoUi } from './interacao-ui';
import {
  obterNaveSelecionada,
  cancelarMovimentoNave,
  confirmarColonizacao,
  manterComoOutpost,
  recolherColonizadoraParaOrigem,
  sucatearNave,
  ehColonizadoraOutpost,
} from '../world/mundo';
import { TEMPO_SURVEY_MS } from '../world/constantes';
import { carregarSpritesheet, getSpritesheetImage } from '../world/spritesheets';

// ─── Constants ──────────────────────────────────────────────────────────────

const SPRITE_CELL = 96;
const SHIP_ROW_COLONIZADORA = 0;
const SHIP_COL_COLONIZADORA = 0;

// Panel "stages" — these are the visual modes the panel morphs between.
type Stage =
  | 'idle'          // orbiting origem, no mission in progress
  | 'outpost'       // orbiting a non-origin target (post-survey outpost)
  | 'traveling'     // in transit to a target
  | 'surveying'    // fazendo_survey
  | 'deciding';    // aguardando_decisao

function stageForNave(nave: Nave): Stage {
  if (nave.estado === 'fazendo_survey') return 'surveying';
  if (nave.estado === 'aguardando_decisao') return 'deciding';
  if (nave.estado === 'viajando') return 'traveling';
  if (nave.estado === 'orbitando' && ehColonizadoraOutpost(nave)) return 'outpost';
  return 'idle';
}

// ─── Module state ───────────────────────────────────────────────────────────

let _container: HTMLDivElement | null = null;
let _styleInjected = false;

let _portraitCanvas: HTMLCanvasElement | null = null;
let _stageBadgeEl: HTMLDivElement | null = null;
let _infoTitleEl: HTMLDivElement | null = null;
let _infoSubtitleEl: HTMLDivElement | null = null;
let _progressBarEl: HTMLDivElement | null = null;
let _progressLabelEl: HTMLDivElement | null = null;
let _actionsEl: HTMLDivElement | null = null;

let _selectedNave: Nave | null = null;
let _mundoRef: Mundo | null = null;

// Stable key we compare each frame to decide whether to re-render the DOM.
let _renderKey = '';

// ─── Sprite drawing (reuse the shared loader) ──────────────────────────────

function drawPortrait(canvas: HTMLCanvasElement): void {
  const img = getSpritesheetImage('ships');
  if (!img) return;
  const cssSize = canvas.clientWidth || 64;
  if (cssSize === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    img,
    SHIP_COL_COLONIZADORA * SPRITE_CELL,
    SHIP_ROW_COLONIZADORA * SPRITE_CELL,
    SPRITE_CELL, SPRITE_CELL,
    0, 0, canvas.width, canvas.height,
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stageLabel(stage: Stage): string {
  switch (stage) {
    case 'idle': return 'Em prontidão';
    case 'outpost': return 'Posto de observação';
    case 'traveling': return 'Em trânsito';
    case 'surveying': return 'Fazendo survey';
    case 'deciding': return 'Aguardando decisão';
  }
}

function stageColor(stage: Stage): string {
  switch (stage) {
    case 'idle': return 'var(--hud-text-dim)';
    case 'outpost': return '#60ccff';
    case 'traveling': return '#ffcc66';
    case 'surveying': return '#8ce0ff';
    case 'deciding': return '#ffd97a';
  }
}

function targetName(nave: Nave): string {
  const a = nave.alvo;
  if (!a) return '—';
  if (a._tipoAlvo === 'planeta') return a.dados.nome ?? 'Planeta';
  if (a._tipoAlvo === 'sol') return 'Estrela';
  return `(${Math.round(a.x)}, ${Math.round(a.y)})`;
}

function distanceToTarget(nave: Nave): number | null {
  const a = nave.alvo;
  if (!a) return null;
  const dx = a.x - nave.x;
  const dy = a.y - nave.y;
  return Math.hypot(dx, dy);
}

function etaLabel(nave: Nave): string {
  const dist = distanceToTarget(nave);
  if (dist == null || dist <= 0) return '—';
  // VELOCIDADE_NAVE = 0.045 px/ms; we don't import it to keep the file lean,
  // but we mirror its value as a constant here. If you bump it, update too.
  const speed = 0.045;
  const ms = dist / speed;
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function surveyProgress(nave: Nave): number {
  const total = nave.surveyTempoTotalMs ?? TEMPO_SURVEY_MS;
  const remaining = nave.surveyTempoRestanteMs ?? 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

function surveyCountdownLabel(nave: Nave): string {
  const remaining = Math.max(0, Math.ceil((nave.surveyTempoRestanteMs ?? 0) / 1000));
  return `${remaining}s`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .colonizer-panel {
      position: fixed;
      z-index: 100;
      bottom: var(--hud-margin);
      left: 50%;
      width: max-content;
      max-width: calc(100vw - var(--hud-margin) * 2);
      box-sizing: border-box;
      color: var(--hud-text);
      font-family: var(--hud-font);
      display: flex;

      transform: translate(-50%, calc(var(--hud-unit) * 1.4));
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition:
        opacity 180ms ease-out,
        transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1),
        visibility 0s linear 240ms;
    }

    .colonizer-panel.visible {
      transform: translate(-50%, 0);
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition:
        opacity 180ms ease-out,
        transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1),
        visibility 0s linear 0s;
    }

    @media (prefers-reduced-motion: reduce) {
      .colonizer-panel,
      .colonizer-panel.visible {
        transition: none;
      }
    }

    .cp-row {
      display: flex;
      align-items: stretch;
      gap: calc(var(--hud-unit) * 0.5);
    }

    .cp-section {
      background: var(--hud-bg);
      border: 1px solid var(--hud-border);
      border-radius: var(--hud-radius);
      box-shadow: var(--hud-shadow);
      backdrop-filter: blur(3px);
      padding: calc(var(--hud-unit) * 0.8) calc(var(--hud-unit) * 1);
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.8);
    }

    /* ── Left: portrait + stage badge ── */

    .cp-left {
      min-width: calc(var(--hud-unit) * 12);
    }

    .cp-portrait-wrap {
      width: calc(var(--hud-unit) * 4);
      height: calc(var(--hud-unit) * 4);
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--hud-line);
      background: rgba(255,255,255,0.02);
      border-radius: calc(var(--hud-unit) * 0.25);
    }

    .cp-portrait {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .cp-left-text {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.25);
      min-width: 0;
    }

    .cp-name {
      font-family: var(--hud-font-display);
      font-size: var(--hud-text-md);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--hud-text);
      line-height: 1;
      white-space: nowrap;
    }

    .cp-stage-badge {
      display: inline-block;
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      padding: calc(var(--hud-unit) * 0.25) calc(var(--hud-unit) * 0.5);
      border: 1px solid currentColor;
      border-radius: calc(var(--hud-unit) * 0.18);
      line-height: 1;
      white-space: nowrap;
      align-self: flex-start;
    }

    /* ── Middle: info + progress ── */

    .cp-middle {
      min-width: calc(var(--hud-unit) * 13);
      flex: 1 1 auto;
    }

    .cp-info {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.35);
      width: 100%;
    }

    .cp-info-title {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
      line-height: 1;
    }

    .cp-info-value {
      font-family: var(--hud-font-body);
      font-size: var(--hud-text-md);
      color: var(--hud-text);
      line-height: 1.1;
      white-space: nowrap;
    }

    .cp-progress {
      width: 100%;
      height: calc(var(--hud-unit) * 0.45);
      border: 1px solid var(--hud-line);
      background: rgba(255,255,255,0.04);
      position: relative;
      margin-top: calc(var(--hud-unit) * 0.2);
    }

    .cp-progress-fill {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      background: #8ce0ff;
      transition: width 140ms linear;
    }

    .cp-progress-label {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      color: var(--hud-text-dim);
      letter-spacing: 0.05em;
      margin-top: calc(var(--hud-unit) * 0.2);
      font-variant-numeric: tabular-nums;
    }

    /* ── Right: action buttons ── */

    .cp-actions {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: calc(var(--hud-unit) * 0.3);
      align-items: center;
    }

    .cp-btn {
      min-width: calc(var(--hud-unit) * 2.6);
      height: calc(var(--hud-unit) * 2.6);
      padding: 0 calc(var(--hud-unit) * 0.35);
      border: 1px solid rgba(255,255,255,0.5);
      border-radius: calc(var(--hud-unit) * 0.2);
      background: rgba(255,255,255,0.02);
      color: var(--hud-text);
      cursor: pointer;
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: calc(var(--hud-unit) * 0.2);
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
      appearance: none;
      white-space: nowrap;
    }

    .cp-btn:hover:not(.disabled):not(.primary) {
      background: rgba(255,255,255,0.08);
      border-color: #fff;
      transform: translateY(-1px);
    }

    .cp-btn.primary {
      background: rgba(140, 224, 255, 0.12);
      border-color: #8ce0ff;
      color: #8ce0ff;
    }

    .cp-btn.primary:hover:not(.disabled) {
      background: rgba(140, 224, 255, 0.22);
    }

    .cp-btn.active {
      background: rgba(140, 224, 255, 0.22);
      border-color: #8ce0ff;
      color: #8ce0ff;
    }

    .cp-btn.disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function computeRenderKey(nave: Nave): string {
  const stage = stageForNave(nave);
  const dist = distanceToTarget(nave);
  return [
    nave.id,
    stage,
    (nave.alvo as { dados?: { nome?: string } })?.dados?.nome ?? '',
    nave.alvo?._tipoAlvo ?? '',
    dist == null ? '' : Math.floor(dist / 50),
    Math.floor((nave.surveyTempoRestanteMs ?? 0) / 250),
    nave.origem?.dados.nome ?? '',
  ].join('|');
}

function renderPanel(nave: Nave): void {
  if (!_container) return;
  const stage = stageForNave(nave);
  const color = stageColor(stage);

  // ── Left section ──
  if (_infoTitleEl) _infoTitleEl.textContent = nave.origem?.dados.nome ?? '';
  if (_stageBadgeEl) {
    _stageBadgeEl.textContent = stageLabel(stage);
    _stageBadgeEl.style.color = color;
  }

  // ── Middle section ──
  if (_infoSubtitleEl && _progressBarEl && _progressLabelEl) {
    switch (stage) {
      case 'idle':
        _infoSubtitleEl.textContent = 'Aguardando ordens';
        _progressBarEl.style.width = '0%';
        _progressLabelEl.textContent = '';
        break;
      case 'outpost':
        _infoSubtitleEl.textContent = `Em órbita de ${targetName(nave)}`;
        _progressBarEl.style.width = '100%';
        _progressLabelEl.textContent = 'Posto ativo';
        break;
      case 'traveling':
        _infoSubtitleEl.textContent = `Rumo a ${targetName(nave)}`;
        _progressBarEl.style.width = '0%';
        _progressLabelEl.textContent = `ETA ${etaLabel(nave)}`;
        break;
      case 'surveying': {
        const pct = Math.round(surveyProgress(nave) * 100);
        _infoSubtitleEl.textContent = `Escaneando ${targetName(nave)}`;
        _progressBarEl.style.width = `${pct}%`;
        _progressLabelEl.textContent = `${surveyCountdownLabel(nave)} restante`;
        break;
      }
      case 'deciding':
        _infoSubtitleEl.textContent = `Survey completo: ${targetName(nave)}`;
        _progressBarEl.style.width = '100%';
        _progressLabelEl.textContent = 'Aguardando sua decisão';
        break;
    }
  }

  // ── Right section (placeholder for Commit G) ──
  if (_actionsEl) {
    _actionsEl.replaceChildren();
    const placeholder = document.createElement('div');
    placeholder.className = 'cp-btn disabled';
    placeholder.textContent = '...';
    placeholder.title = 'Ações vêm no próximo commit';
    _actionsEl.appendChild(placeholder);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function criarColonizerPanel(): HTMLDivElement {
  if (_container) return _container;
  injectStyles();
  loadShipsSheet();

  const panel = document.createElement('div');
  panel.className = 'colonizer-panel';
  panel.addEventListener('pointerdown', () => marcarInteracaoUi());

  const row = document.createElement('div');
  row.className = 'cp-row';

  // Left section
  const left = document.createElement('div');
  left.className = 'cp-section cp-left';

  const portraitWrap = document.createElement('div');
  portraitWrap.className = 'cp-portrait-wrap';
  const portrait = document.createElement('canvas');
  portrait.className = 'cp-portrait';
  _portraitCanvas = portrait;
  portraitWrap.appendChild(portrait);

  const leftText = document.createElement('div');
  leftText.className = 'cp-left-text';

  const name = document.createElement('div');
  name.className = 'cp-name';
  name.textContent = 'Colonizadora';

  const stageBadge = document.createElement('div');
  stageBadge.className = 'cp-stage-badge';
  _stageBadgeEl = stageBadge;

  const originTitle = document.createElement('div');
  originTitle.className = 'cp-info-title';
  originTitle.textContent = '—';
  _infoTitleEl = originTitle;

  leftText.append(name, stageBadge, originTitle);
  left.append(portraitWrap, leftText);

  // Middle section
  const middle = document.createElement('div');
  middle.className = 'cp-section cp-middle';

  const info = document.createElement('div');
  info.className = 'cp-info';

  const infoTitle = document.createElement('div');
  infoTitle.className = 'cp-info-title';
  infoTitle.textContent = 'Missão';

  const infoValue = document.createElement('div');
  infoValue.className = 'cp-info-value';
  _infoSubtitleEl = infoValue;

  const progress = document.createElement('div');
  progress.className = 'cp-progress';
  const progressFill = document.createElement('div');
  progressFill.className = 'cp-progress-fill';
  _progressBarEl = progressFill;
  progress.appendChild(progressFill);

  const progressLabel = document.createElement('div');
  progressLabel.className = 'cp-progress-label';
  _progressLabelEl = progressLabel;

  info.append(infoTitle, infoValue, progress, progressLabel);
  middle.appendChild(info);

  // Right section
  const right = document.createElement('div');
  right.className = 'cp-section';
  const actions = document.createElement('div');
  actions.className = 'cp-actions';
  _actionsEl = actions;
  right.appendChild(actions);

  row.append(left, middle, right);
  panel.appendChild(row);
  document.body.appendChild(panel);

  _container = panel;
  return panel;
}

function loadShipsSheet(): void {
  if (getSpritesheetImage('ships')) return;
  carregarSpritesheet('ships').then(() => {
    if (_portraitCanvas) drawPortrait(_portraitCanvas);
  });
}

export function atualizarColonizerPanel(mundo: Mundo): void {
  if (!_container) return;
  _mundoRef = mundo;

  const nave = obterNaveSelecionada(mundo);
  if (!nave || nave.tipo !== 'colonizadora') {
    _container.classList.remove('visible');
    _selectedNave = null;
    _renderKey = '';
    return;
  }

  if (_selectedNave !== nave) {
    _selectedNave = nave;
    _renderKey = '';
    if (_portraitCanvas) {
      requestAnimationFrame(() => { if (_portraitCanvas) drawPortrait(_portraitCanvas); });
    }
  }

  _container.classList.add('visible');

  const key = computeRenderKey(nave);
  if (key !== _renderKey) {
    renderPanel(nave);
    _renderKey = key;
  }
}

/**
 * Tells the ship-panel whether it should hide itself because a colonizadora
 * is selected (and therefore owned by the colonizer-panel instead).
 */
export function colonizerPanelShouldHandleSelection(mundo: Mundo): boolean {
  const nave = obterNaveSelecionada(mundo);
  return !!nave && nave.tipo === 'colonizadora';
}

export function destruirColonizerPanel(): void {
  _container?.remove();
  _container = null;
  _styleInjected = false;
  _portraitCanvas = null;
  _stageBadgeEl = null;
  _infoTitleEl = null;
  _infoSubtitleEl = null;
  _progressBarEl = null;
  _progressLabelEl = null;
  _actionsEl = null;
  _selectedNave = null;
  _mundoRef = null;
  _renderKey = '';
}
