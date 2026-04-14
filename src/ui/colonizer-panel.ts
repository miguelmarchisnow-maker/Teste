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
  enviarNaveParaPosicao,
} from '../world/mundo';
import { TEMPO_SURVEY_MS } from '../world/constantes';
import { carregarSpritesheet, getSpritesheetImage } from '../world/spritesheets';
import { iniciarComandoNave, cancelarComandoNave, getComandoNaveTipo } from '../core/player';

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
let _middleEl: HTMLDivElement | null = null;       // swappable middle section
let _infoSubtitleEl: HTMLDivElement | null = null;
let _progressBarEl: HTMLDivElement | null = null;
let _progressLabelEl: HTMLDivElement | null = null;
let _actionsEl: HTMLDivElement | null = null;
let _movePanelEl: HTMLDivElement | null = null;     // movement sub-panel
let _decisionNameInput: HTMLInputElement | null = null;

let _selectedNave: Nave | null = null;
let _mundoRef: Mundo | null = null;
let _movePanelOpen = false;

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
      --cp-accent: #8ce0ff;
      --cp-accent-dim: rgba(140, 224, 255, 0.15);
      --cp-bg: rgba(6, 14, 22, 0.95);
      --cp-bg-deep: rgba(3, 8, 14, 0.98);

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

      /* Subtle outer glow so the panel reads as special vs the generic ship-panel */
      filter: drop-shadow(0 0 calc(var(--hud-unit) * 0.6) rgba(140, 224, 255, 0.12));
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

    /* Tactical-styled panel section: corner brackets instead of a full border,
       darker background, inset highlight on top edge. */
    .cp-section {
      position: relative;
      background: linear-gradient(180deg, var(--cp-bg) 0%, var(--cp-bg-deep) 100%);
      border: 1px solid rgba(140, 224, 255, 0.22);
      border-radius: calc(var(--hud-unit) * 0.2);
      box-shadow:
        0 0 0 1px rgba(140, 224, 255, 0.06),
        0 calc(var(--hud-unit) * 0.6) calc(var(--hud-unit) * 1.2) rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(4px);
      padding: calc(var(--hud-unit) * 0.85) calc(var(--hud-unit) * 1);
      display: flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.8);
    }

    /* Corner brackets: four tiny L-shapes at each corner of every section */
    .cp-section::before,
    .cp-section::after {
      content: '';
      position: absolute;
      width: calc(var(--hud-unit) * 0.55);
      height: calc(var(--hud-unit) * 0.55);
      border: 1px solid var(--cp-accent);
      pointer-events: none;
    }
    .cp-section::before {
      top: -1px;
      left: -1px;
      border-right: none;
      border-bottom: none;
    }
    .cp-section::after {
      bottom: -1px;
      right: -1px;
      border-left: none;
      border-top: none;
    }

    /* ── Left: portrait + stage badge ── */

    .cp-left {
      min-width: calc(var(--hud-unit) * 13);
    }

    .cp-portrait-wrap {
      width: calc(var(--hud-unit) * 4.8);
      height: calc(var(--hud-unit) * 4.8);
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      background:
        radial-gradient(circle at 50% 50%, rgba(140, 224, 255, 0.18) 0%, rgba(140, 224, 255, 0.02) 60%, transparent 100%),
        rgba(6, 14, 22, 0.8);
      border: 1px solid rgba(140, 224, 255, 0.5);
      border-radius: calc(var(--hud-unit) * 0.2);
      box-shadow:
        inset 0 0 calc(var(--hud-unit) * 1) rgba(140, 224, 255, 0.12),
        inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    }

    /* Scanning line overlay on portrait — a single horizontal cyan line
       that sweeps top→bottom */
    .cp-portrait-wrap::after {
      content: '';
      position: absolute;
      left: 6%;
      right: 6%;
      top: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, var(--cp-accent) 50%, transparent 100%);
      opacity: 0.6;
      animation: cp-scan 2.5s linear infinite;
      pointer-events: none;
    }

    @keyframes cp-scan {
      0% { transform: translateY(0); opacity: 0; }
      8% { opacity: 0.8; }
      92% { opacity: 0.8; }
      100% { transform: translateY(calc(var(--hud-unit) * 4.8)); opacity: 0; }
    }

    .cp-portrait {
      width: 82%;
      height: 82%;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .cp-left-text {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.35);
      min-width: 0;
    }

    .cp-name {
      font-family: var(--hud-font-display);
      font-size: var(--hud-text-md);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--hud-text);
      line-height: 1;
      white-space: nowrap;
      text-shadow: 0 0 calc(var(--hud-unit) * 0.3) rgba(140, 224, 255, 0.35);
    }

    .cp-stage-badge {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--hud-unit) * 0.35);
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      padding: calc(var(--hud-unit) * 0.3) calc(var(--hud-unit) * 0.55);
      border: 1px solid currentColor;
      background: rgba(140, 224, 255, 0.05);
      line-height: 1;
      white-space: nowrap;
      align-self: flex-start;
    }

    /* LED dot inside the stage badge — pulses when ship is active */
    .cp-stage-badge::before {
      content: '';
      display: inline-block;
      width: calc(var(--hud-unit) * 0.4);
      height: calc(var(--hud-unit) * 0.4);
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 calc(var(--hud-unit) * 0.35) currentColor;
      animation: cp-pulse 1.6s ease-in-out infinite;
    }

    @keyframes cp-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.85); }
    }

    /* ── Middle: info + progress ── */

    .cp-middle {
      min-width: calc(var(--hud-unit) * 14);
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
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--cp-accent);
      line-height: 1;
      opacity: 0.75;
    }

    .cp-info-value {
      font-family: var(--hud-font-body);
      font-size: calc(var(--hud-text-md) * 1.15);
      color: var(--hud-text);
      line-height: 1.1;
      white-space: nowrap;
      text-shadow: 0 0 calc(var(--hud-unit) * 0.25) rgba(140, 224, 255, 0.25);
    }

    .cp-progress {
      width: 100%;
      height: calc(var(--hud-unit) * 0.5);
      border: 1px solid rgba(140, 224, 255, 0.35);
      background: rgba(6, 14, 22, 0.8);
      position: relative;
      margin-top: calc(var(--hud-unit) * 0.25);
      overflow: hidden;
    }

    .cp-progress-fill {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      background: linear-gradient(90deg, rgba(140, 224, 255, 0.55) 0%, var(--cp-accent) 100%);
      transition: width 140ms linear;
      box-shadow: 0 0 calc(var(--hud-unit) * 0.5) var(--cp-accent);
    }

    .cp-progress-label {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      color: var(--hud-text-dim);
      letter-spacing: 0.05em;
      margin-top: calc(var(--hud-unit) * 0.25);
      font-variant-numeric: tabular-nums;
    }

    /* ── Right: action buttons ── */

    .cp-actions {
      display: grid;
      grid-template-columns: repeat(2, auto);
      gap: calc(var(--hud-unit) * 0.35);
      align-items: center;
    }

    .cp-btn {
      min-width: calc(var(--hud-unit) * 3.4);
      height: calc(var(--hud-unit) * 2.4);
      padding: 0 calc(var(--hud-unit) * 0.5);
      border: 1px solid rgba(140, 224, 255, 0.4);
      background: linear-gradient(180deg, rgba(20, 34, 48, 0.75) 0%, rgba(6, 14, 22, 0.85) 100%);
      color: var(--hud-text);
      cursor: pointer;
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: calc(var(--hud-unit) * 0.2);
      transition:
        background 120ms ease,
        border-color 120ms ease,
        transform 120ms ease,
        box-shadow 140ms ease;
      appearance: none;
      white-space: nowrap;
      position: relative;
    }

    /* Corner cut accent on buttons — creates the "tactical" bevel look */
    .cp-btn::before {
      content: '';
      position: absolute;
      top: -1px;
      right: -1px;
      width: calc(var(--hud-unit) * 0.4);
      height: calc(var(--hud-unit) * 0.4);
      border-right: 1px solid var(--cp-accent);
      border-top: 1px solid var(--cp-accent);
      opacity: 0.7;
    }

    .cp-btn:hover:not(.disabled) {
      border-color: var(--cp-accent);
      background: linear-gradient(180deg, rgba(30, 54, 78, 0.8) 0%, rgba(10, 20, 30, 0.9) 100%);
      transform: translateY(-1px);
      box-shadow: 0 0 calc(var(--hud-unit) * 0.5) rgba(140, 224, 255, 0.25);
    }

    .cp-btn.primary {
      background: linear-gradient(180deg, rgba(140, 224, 255, 0.18) 0%, rgba(140, 224, 255, 0.06) 100%);
      border-color: var(--cp-accent);
      color: var(--cp-accent);
      text-shadow: 0 0 calc(var(--hud-unit) * 0.4) rgba(140, 224, 255, 0.5);
    }

    .cp-btn.primary:hover:not(.disabled) {
      background: linear-gradient(180deg, rgba(140, 224, 255, 0.28) 0%, rgba(140, 224, 255, 0.12) 100%);
    }

    .cp-btn.active {
      background: linear-gradient(180deg, rgba(140, 224, 255, 0.3) 0%, rgba(140, 224, 255, 0.14) 100%);
      border-color: var(--cp-accent);
      color: var(--cp-accent);
      box-shadow:
        0 0 calc(var(--hud-unit) * 0.6) rgba(140, 224, 255, 0.4),
        inset 0 0 calc(var(--hud-unit) * 0.4) rgba(140, 224, 255, 0.25);
    }

    .cp-btn.disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    /* ── Decision prompt (replaces middle section) ── */
    .cp-decision {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.3);
      min-width: calc(var(--hud-unit) * 13);
    }

    .cp-name-input {
      width: 100%;
      padding: calc(var(--hud-unit) * 0.35) calc(var(--hud-unit) * 0.55);
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--hud-line);
      color: var(--hud-text);
      font-family: var(--hud-font-body);
      font-size: var(--hud-text-md);
      letter-spacing: 0.04em;
      outline: none;
      box-sizing: border-box;
      border-radius: calc(var(--hud-unit) * 0.18);
    }

    .cp-name-input:focus {
      border-color: #8ce0ff;
      background: rgba(255,255,255,0.08);
    }

    .cp-bonus {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
      line-height: 1.3;
      margin-top: calc(var(--hud-unit) * 0.25);
    }

    /* ── Cockpit movement console ──
       Floats above the main panel, styled like a ship console: metallic
       gradient background, rivet corners, recessed joystick cavity, D-pad. */

    .cp-cockpit {
      position: fixed;
      z-index: 101;
      bottom: calc(var(--hud-margin) + var(--hud-unit) * 8);
      left: 50%;

      padding: calc(var(--hud-unit) * 0.9) calc(var(--hud-unit) * 1.1);
      background:
        linear-gradient(180deg, rgba(38, 50, 62, 0.95) 0%, rgba(12, 20, 28, 0.98) 100%);
      border: 1px solid rgba(140, 224, 255, 0.4);
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.5),
        0 calc(var(--hud-unit) * 0.6) calc(var(--hud-unit) * 1.6) rgba(0, 0, 0, 0.7),
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5);

      transform: translateX(-50%) translateY(calc(var(--hud-unit) * 0.6));
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition:
        opacity 160ms ease-out,
        transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        visibility 0s linear 220ms;
    }

    .cp-cockpit.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
      transition:
        opacity 160ms ease-out,
        transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        visibility 0s linear 0s;
    }

    /* Rivets at the 4 corners of the cockpit panel */
    .cp-cockpit::before,
    .cp-cockpit::after {
      content: '';
      position: absolute;
      width: calc(var(--hud-unit) * 0.3);
      height: calc(var(--hud-unit) * 0.3);
      background: radial-gradient(circle at 40% 40%, #888 0%, #333 50%, #111 100%);
      border-radius: 50%;
      box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(255,255,255,0.15);
    }
    .cp-cockpit::before { top: calc(var(--hud-unit) * 0.3); left: calc(var(--hud-unit) * 0.3); }
    .cp-cockpit::after { top: calc(var(--hud-unit) * 0.3); right: calc(var(--hud-unit) * 0.3); }

    .cp-cockpit-title {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--cp-accent);
      text-align: center;
      margin-bottom: calc(var(--hud-unit) * 0.5);
      opacity: 0.85;
    }

    .cp-cockpit-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: calc(var(--hud-unit) * 1);
    }

    /* ── Analog joystick ── */

    .cp-joystick {
      position: relative;
      width: calc(var(--hud-unit) * 5);
      height: calc(var(--hud-unit) * 5);
      border-radius: 50%;
      background:
        radial-gradient(circle at 50% 45%, rgba(12, 20, 28, 0.9) 0%, rgba(2, 6, 10, 1) 70%),
        #000;
      border: 2px solid rgba(140, 224, 255, 0.35);
      box-shadow:
        inset 0 0 calc(var(--hud-unit) * 1.2) rgba(0, 0, 0, 0.9),
        inset 0 2px 0 rgba(255, 255, 255, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.6);
      cursor: grab;
      touch-action: none;
    }

    .cp-joystick:active {
      cursor: grabbing;
    }

    /* Crosshair guides inside the joystick cavity */
    .cp-joystick::before,
    .cp-joystick::after {
      content: '';
      position: absolute;
      background: rgba(140, 224, 255, 0.18);
      pointer-events: none;
    }
    .cp-joystick::before {
      top: 50%;
      left: 10%;
      right: 10%;
      height: 1px;
    }
    .cp-joystick::after {
      left: 50%;
      top: 10%;
      bottom: 10%;
      width: 1px;
    }

    .cp-joystick-nub {
      position: absolute;
      top: 50%;
      left: 50%;
      width: calc(var(--hud-unit) * 1.8);
      height: calc(var(--hud-unit) * 1.8);
      border-radius: 50%;
      background:
        radial-gradient(circle at 40% 35%, #a8d8f0 0%, #4a7a95 40%, #1e3a4f 80%, #0a1b28 100%);
      border: 1px solid rgba(140, 224, 255, 0.6);
      transform: translate(-50%, -50%);
      box-shadow:
        0 calc(var(--hud-unit) * 0.2) calc(var(--hud-unit) * 0.4) rgba(0, 0, 0, 0.6),
        inset 0 1px 1px rgba(255, 255, 255, 0.3);
      pointer-events: none;
      transition: background 120ms ease;
    }

    .cp-joystick.active .cp-joystick-nub {
      background:
        radial-gradient(circle at 40% 35%, #ccf0ff 0%, #6aa8c8 40%, #2e5a75 80%, #0a1b28 100%);
    }

    /* ── D-pad ── */

    .cp-dpad {
      display: grid;
      grid-template-columns: repeat(3, calc(var(--hud-unit) * 1.8));
      grid-template-rows: repeat(3, calc(var(--hud-unit) * 1.8));
      gap: calc(var(--hud-unit) * 0.12);
    }

    .cp-dpad-btn {
      appearance: none;
      border: 1px solid rgba(140, 224, 255, 0.35);
      background: linear-gradient(180deg, #2a3a4a 0%, #0c1420 100%);
      color: var(--cp-accent);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: calc(var(--hud-unit) * 0.9);
      font-family: monospace;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.15),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 1px 2px rgba(0, 0, 0, 0.5);
      transition: all 80ms ease;
      user-select: none;
    }

    .cp-dpad-btn:hover {
      border-color: var(--cp-accent);
      background: linear-gradient(180deg, #3a4a5a 0%, #14202c 100%);
    }

    .cp-dpad-btn:active {
      background: linear-gradient(180deg, #0c1420 0%, #2a3a4a 100%);
      box-shadow:
        inset 0 2px 4px rgba(0, 0, 0, 0.7),
        0 0 calc(var(--hud-unit) * 0.5) rgba(140, 224, 255, 0.3);
      transform: translateY(1px);
    }

    .cp-dpad-btn.empty {
      background: transparent;
      border: none;
      box-shadow: none;
      pointer-events: none;
    }

    .cp-dpad-btn.stop {
      color: #ff8888;
      border-color: rgba(255, 136, 136, 0.45);
      font-size: calc(var(--hud-unit) * 0.7);
    }

    .cp-dpad-btn.stop:hover {
      border-color: #ff8888;
    }

    /* ── Click-to-go mode button (below the joystick+dpad) ── */

    .cp-cockpit-footer {
      display: flex;
      gap: calc(var(--hud-unit) * 0.4);
      margin-top: calc(var(--hud-unit) * 0.65);
      justify-content: center;
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
    getComandoNaveTipo() ?? '',
    _movePanelOpen ? '1' : '0',
  ].join('|');
}

function renderPanel(nave: Nave): void {
  if (!_container || !_middleEl) return;
  const stage = stageForNave(nave);
  const color = stageColor(stage);

  // ── Left section ──
  if (_infoTitleEl) _infoTitleEl.textContent = nave.origem?.dados.nome
    ? `de ${nave.origem.dados.nome}`
    : '';
  if (_stageBadgeEl) {
    _stageBadgeEl.textContent = stageLabel(stage);
    _stageBadgeEl.style.color = color;
    _stageBadgeEl.style.borderColor = color;
  }

  // ── Middle section ──
  // The deciding stage swaps the middle content entirely — it becomes an
  // inline decision prompt instead of a progress display.
  if (stage === 'deciding') {
    renderMiddleDecision(nave);
  } else {
    renderMiddleInfo(nave, stage);
  }

  // ── Right section ──
  renderActions(nave, stage);
}

function renderMiddleInfo(nave: Nave, stage: Stage): void {
  if (!_middleEl) return;
  // Rebuild progress-style middle if it was swapped out for a decision prompt.
  if (!_infoSubtitleEl || !_progressBarEl || !_progressLabelEl || !_middleEl.contains(_infoSubtitleEl)) {
    _middleEl.replaceChildren();
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
    _middleEl.appendChild(info);
  }

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
    default:
      break;
  }
}

function renderMiddleDecision(nave: Nave): void {
  if (!_middleEl) return;
  const planeta = nave.alvo && nave.alvo._tipoAlvo === 'planeta' ? nave.alvo as Planeta : null;
  _middleEl.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'cp-decision';

  const title = document.createElement('div');
  title.className = 'cp-info-title';
  title.textContent = 'Survey completo — habitável';
  wrap.appendChild(title);

  const label = document.createElement('div');
  label.className = 'cp-info-title';
  label.textContent = 'Nome da colônia';
  label.style.marginTop = 'calc(var(--hud-unit) * 0.35)';
  wrap.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cp-name-input';
  input.maxLength = 32;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = planeta?.dados.nome ?? '';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmarDecisao(); }
    else if (e.key === 'Escape') { e.preventDefault(); decidirOutpost(); }
  });
  _decisionNameInput = input;
  wrap.appendChild(input);

  const bonus = document.createElement('div');
  bonus.className = 'cp-bonus';
  bonus.textContent = '+1 Fábrica · +20 Comum · +5 Raro · +5 Combustível';
  wrap.appendChild(bonus);

  _middleEl.appendChild(wrap);

  // Refocus the input each time so Enter/Esc shortcuts work.
  setTimeout(() => _decisionNameInput?.focus(), 20);

  // Reset the progress refs so renderMiddleInfo will rebuild on next stage change.
  _infoSubtitleEl = null;
  _progressBarEl = null;
  _progressLabelEl = null;
}

interface ActionSpec {
  id: string;
  label: string;
  hint?: string;
  variant?: 'default' | 'primary' | 'active';
  visible: (nave: Nave, stage: Stage) => boolean;
  enabled?: (nave: Nave, stage: Stage) => boolean;
  onClick: (nave: Nave) => void;
}

const ACTIONS: ActionSpec[] = [
  {
    id: 'target',
    label: 'Target',
    hint: 'Clique num planeta pra alvejar',
    variant: 'primary',
    visible: (_n, stage) => stage === 'idle' || stage === 'outpost',
    enabled: () => true,
    onClick: (n) => {
      if (getComandoNaveTipo() === 'target_colonizadora') {
        cancelarComandoNave();
      } else {
        iniciarComandoNave('target_colonizadora', n);
      }
    },
  },
  {
    id: 'move',
    label: 'Mover',
    hint: 'Abrir painel de movimento livre',
    visible: (_n, stage) => stage === 'idle' || stage === 'outpost',
    enabled: () => true,
    onClick: () => { _movePanelOpen = !_movePanelOpen; },
  },
  {
    id: 'recall',
    label: 'Recolher',
    hint: 'Voltar pra planeta de origem',
    visible: (_n, stage) => stage === 'outpost' || stage === 'idle',
    enabled: (n, stage) => stage === 'outpost' || (stage === 'idle' && n.alvo !== n.origem),
    onClick: (n) => {
      if (_mundoRef) recolherColonizadoraParaOrigem(_mundoRef, n);
    },
  },
  {
    id: 'cancel',
    label: 'Cancelar',
    hint: 'Parar movimento em trânsito',
    visible: (_n, stage) => stage === 'traveling',
    enabled: () => true,
    onClick: (n) => cancelarMovimentoNave(n),
  },
  {
    id: 'abort_survey',
    label: 'Abortar',
    hint: 'Cancelar survey em andamento',
    visible: (_n, stage) => stage === 'surveying',
    enabled: () => true,
    onClick: (n) => cancelarMovimentoNave(n),
  },
  {
    id: 'colonize',
    label: 'Colonizar',
    hint: 'Confirmar colonização',
    variant: 'primary',
    visible: (_n, stage) => stage === 'deciding',
    enabled: () => true,
    onClick: (n) => {
      if (!_mundoRef) return;
      const nome = _decisionNameInput?.value.trim() || undefined;
      confirmarColonizacao(_mundoRef, n, nome);
    },
  },
  {
    id: 'outpost',
    label: 'Orbitar',
    hint: 'Manter como posto de observação',
    visible: (_n, stage) => stage === 'deciding',
    enabled: () => true,
    onClick: (n) => manterComoOutpost(n),
  },
  {
    id: 'scrap',
    label: 'Sucatear',
    hint: 'Destruir a nave',
    visible: (_n, stage) => stage === 'idle' || stage === 'outpost',
    enabled: () => true,
    onClick: (n) => {
      if (_mundoRef && confirm('Sucatear esta colonizadora? Essa ação é permanente.')) {
        sucatearNave(_mundoRef, n);
      }
    },
  },
];

function confirmarDecisao(): void {
  if (!_mundoRef || !_selectedNave) return;
  const nome = _decisionNameInput?.value.trim() || undefined;
  confirmarColonizacao(_mundoRef, _selectedNave, nome);
}

function decidirOutpost(): void {
  if (!_selectedNave) return;
  manterComoOutpost(_selectedNave);
}

function renderActions(nave: Nave, stage: Stage): void {
  if (!_actionsEl) return;
  _actionsEl.replaceChildren();

  const visibleActions = ACTIONS.filter((a) => a.visible(nave, stage));
  const targetingActive = getComandoNaveTipo() === 'target_colonizadora';

  for (const spec of visibleActions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-btn';
    if (spec.variant === 'primary') btn.classList.add('primary');
    if (spec.id === 'target' && targetingActive) btn.classList.add('active');
    if (spec.id === 'move' && _movePanelOpen) btn.classList.add('active');
    const isEnabled = spec.enabled ? spec.enabled(nave, stage) : true;
    if (!isEnabled) btn.classList.add('disabled');
    btn.textContent = spec.label;
    if (spec.hint) btn.title = spec.hint;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      marcarInteracaoUi();
      if (!isEnabled || !_selectedNave) return;
      spec.onClick(_selectedNave);
      _renderKey = ''; // force refresh on next frame
    });
    _actionsEl.appendChild(btn);
  }

  // Movement sub-panel: shown as a floating panel anchored above the main
  // panel, containing free-move click + directional nudges.
  renderMovePanel(nave);
}

// Movement command helpers. The D-pad and joystick both boil down to
// sending the ship to a world-space point at nave.x+dx, nave.y+dy.
const DPAD_NUDGE_DIST = 700;
const JOYSTICK_MAX_DIST = 1200;

function moveInDirection(nave: Nave, dx: number, dy: number): void {
  if (!_mundoRef) return;
  if (dx === 0 && dy === 0) return;
  enviarNaveParaPosicao(_mundoRef, nave, nave.x + dx, nave.y + dy);
}

function renderMovePanel(nave: Nave): void {
  if (!_movePanelEl) return;
  _movePanelEl.classList.toggle('visible', _movePanelOpen);
  if (!_movePanelOpen) return;

  // The cockpit DOM is built once per open — only re-rebuild if empty.
  if (_movePanelEl.childElementCount !== 0) return;

  const title = document.createElement('div');
  title.className = 'cp-cockpit-title';
  title.textContent = '// Console de Navegação //';
  _movePanelEl.appendChild(title);

  const row = document.createElement('div');
  row.className = 'cp-cockpit-row';
  _movePanelEl.appendChild(row);

  // ── Analog joystick ──
  const stick = document.createElement('div');
  stick.className = 'cp-joystick';
  const nub = document.createElement('div');
  nub.className = 'cp-joystick-nub';
  stick.appendChild(nub);
  row.appendChild(stick);

  const joystickState = { active: false, pointerId: -1 };
  const resetNub = () => {
    nub.style.transform = 'translate(-50%, -50%)';
    stick.classList.remove('active');
  };

  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    marcarInteracaoUi();
    joystickState.active = true;
    joystickState.pointerId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    stick.classList.add('active');
  });
  stick.addEventListener('pointermove', (e) => {
    if (!joystickState.active || e.pointerId !== joystickState.pointerId) return;
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const maxR = rect.width * 0.35;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  stick.addEventListener('pointerup', (e) => {
    if (!joystickState.active || e.pointerId !== joystickState.pointerId) return;
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > 5 && _selectedNave) {
      // Magnitude scales with how far the stick was pushed (0 → 1).
      const maxR = rect.width * 0.35;
      const mag = Math.min(1, dist / maxR);
      const worldDist = JOYSTICK_MAX_DIST * mag;
      const ux = dx / dist;
      const uy = dy / dist;
      moveInDirection(_selectedNave, ux * worldDist, uy * worldDist);
    }
    joystickState.active = false;
    stick.releasePointerCapture(e.pointerId);
    resetNub();
  });
  stick.addEventListener('pointercancel', () => {
    joystickState.active = false;
    resetNub();
  });

  // ── D-pad ──
  const dpad = document.createElement('div');
  dpad.className = 'cp-dpad';

  const makeDpadBtn = (label: string, cls: string, dx: number, dy: number, onClick?: () => void) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cp-dpad-btn ${cls}`;
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      marcarInteracaoUi();
      if (onClick) { onClick(); return; }
      if (_selectedNave) moveInDirection(_selectedNave, dx, dy);
    });
    return btn;
  };
  const empty = () => {
    const d = document.createElement('div');
    d.className = 'cp-dpad-btn empty';
    return d;
  };

  // 3×3 grid; only cardinal cells are active buttons, corners are empty.
  dpad.appendChild(empty());
  dpad.appendChild(makeDpadBtn('▲', 'up', 0, -DPAD_NUDGE_DIST));
  dpad.appendChild(empty());
  dpad.appendChild(makeDpadBtn('◀', 'left', -DPAD_NUDGE_DIST, 0));
  dpad.appendChild(makeDpadBtn('■', 'stop', 0, 0, () => {
    if (_selectedNave) cancelarMovimentoNave(_selectedNave);
  }));
  dpad.appendChild(makeDpadBtn('▶', 'right', DPAD_NUDGE_DIST, 0));
  dpad.appendChild(empty());
  dpad.appendChild(makeDpadBtn('▼', 'down', 0, DPAD_NUDGE_DIST));
  dpad.appendChild(empty());
  row.appendChild(dpad);

  // ── Footer buttons: click-to-go mode + close ──
  const footer = document.createElement('div');
  footer.className = 'cp-cockpit-footer';
  _movePanelEl.appendChild(footer);

  const moveActive = getComandoNaveTipo() === 'move_colonizadora';
  const freeBtn = document.createElement('button');
  freeBtn.type = 'button';
  freeBtn.className = 'cp-btn primary';
  if (moveActive) freeBtn.classList.add('active');
  freeBtn.textContent = moveActive ? 'Aguardando clique...' : 'Click-to-go';
  freeBtn.title = 'Arma modo voo livre (próximo clique no mapa vira destino)';
  freeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    marcarInteracaoUi();
    if (getComandoNaveTipo() === 'move_colonizadora') {
      cancelarComandoNave();
    } else if (_selectedNave) {
      iniciarComandoNave('move_colonizadora', _selectedNave);
    }
    _renderKey = '';
  });
  footer.appendChild(freeBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cp-btn';
  closeBtn.textContent = 'Fechar';
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    marcarInteracaoUi();
    _movePanelOpen = false;
    if (getComandoNaveTipo() === 'move_colonizadora') cancelarComandoNave();
    if (_movePanelEl) {
      _movePanelEl.replaceChildren();
      _movePanelEl.classList.remove('visible');
    }
    _renderKey = '';
  });
  footer.appendChild(closeBtn);
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

  // Middle section — content is built dynamically in renderMiddleInfo /
  // renderMiddleDecision depending on the current stage.
  const middle = document.createElement('div');
  middle.className = 'cp-section cp-middle';
  _middleEl = middle;

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

  // Movement sub-panel (separate top-level element so its position is
  // independent of the main panel's layout and its own transition works).
  const movePanel = document.createElement('div');
  movePanel.className = 'cp-cockpit';
  movePanel.addEventListener('pointerdown', () => marcarInteracaoUi());
  _movePanelEl = movePanel;
  document.body.appendChild(movePanel);

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
    if (_movePanelEl) {
      _movePanelEl.classList.remove('visible');
      _movePanelEl.replaceChildren();
    }
    _movePanelOpen = false;
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
