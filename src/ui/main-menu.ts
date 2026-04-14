/**
 * Main menu overlay — first thing the player sees. Full-screen starfield
 * background, stylised title, and three buttons: Novo Jogo / Mundos
 * Salvos / Configurações. Calls back to main.ts to start the game on
 * user action.
 */

import { marcarInteracaoUi } from './interacao-ui';

interface MainMenuOptions {
  onNewGame: () => void;
  onLoadGame: (saveId: string) => void;
}

let _container: HTMLDivElement | null = null;
let _mainScreen: HTMLDivElement | null = null;
let _savesScreen: HTMLDivElement | null = null;
let _settingsScreen: HTMLDivElement | null = null;
let _styleInjected = false;
let _options: MainMenuOptions | null = null;

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .main-menu {
      position: fixed;
      inset: 0;
      z-index: 500;
      background: radial-gradient(ellipse at 50% 35%, #0b1830 0%, #040810 60%, #000000 100%);
      color: var(--hud-text);
      font-family: var(--hud-font);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 400ms ease-out, visibility 0s linear 0s;
    }

    .main-menu.hidden {
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition: opacity 400ms ease-out, visibility 0s linear 400ms;
    }

    /* ── Animated starfield ── */
    .menu-stars {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .menu-star {
      position: absolute;
      width: 2px;
      height: 2px;
      background: #fff;
      border-radius: 50%;
      opacity: 0;
      animation: menu-twinkle linear infinite;
    }

    @keyframes menu-twinkle {
      0%, 100% { opacity: 0; transform: scale(0.6); }
      50% { opacity: var(--star-alpha, 0.8); transform: scale(1); }
    }

    /* A single slow-drifting nebula glow behind the title */
    .menu-nebula {
      position: absolute;
      top: 20%;
      left: 50%;
      width: clamp(400px, 50vmin, 700px);
      height: clamp(400px, 50vmin, 700px);
      transform: translate(-50%, -50%);
      background:
        radial-gradient(circle at 40% 40%, rgba(140, 180, 255, 0.15) 0%, rgba(140, 180, 255, 0.04) 30%, transparent 60%),
        radial-gradient(circle at 60% 60%, rgba(180, 100, 200, 0.1) 0%, rgba(180, 100, 200, 0.03) 40%, transparent 70%);
      filter: blur(40px);
      pointer-events: none;
      animation: menu-nebula-drift 24s ease-in-out infinite;
    }

    @keyframes menu-nebula-drift {
      0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
      50% { transform: translate(-48%, -52%) rotate(3deg); }
    }

    /* Vignette at the edges for extra depth */
    .menu-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.8) 100%);
      pointer-events: none;
    }

    /* ── Title + menu container ── */
    .menu-screen {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: clamp(320px, 40vw, 520px);
      padding: 0 var(--hud-margin);
      box-sizing: border-box;
    }

    .menu-screen.hidden {
      display: none;
    }

    .menu-title {
      font-family: var(--hud-font-display);
      font-size: clamp(36px, 7vmin, 68px);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #fff;
      text-align: center;
      margin: 0 0 calc(var(--hud-unit) * 0.5);
      text-shadow:
        0 0 calc(var(--hud-unit) * 0.8) rgba(140, 200, 255, 0.4),
        0 0 calc(var(--hud-unit) * 2) rgba(140, 200, 255, 0.15);
    }

    .menu-subtitle {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.4em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
      text-align: center;
      margin: 0 0 calc(var(--hud-unit) * 2.5);
    }

    .menu-buttons {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.55);
      width: 100%;
      min-width: calc(var(--hud-unit) * 14);
    }

    .menu-btn {
      appearance: none;
      width: 100%;
      padding: calc(var(--hud-unit) * 0.85) calc(var(--hud-unit) * 1.2);
      background: rgba(10, 20, 36, 0.7);
      border: 1px solid var(--hud-border);
      color: var(--hud-text);
      cursor: pointer;
      font-family: var(--hud-font);
      font-size: var(--hud-text-md);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      text-align: center;
      backdrop-filter: blur(3px);
      transition:
        background 140ms ease,
        border-color 140ms ease,
        transform 140ms ease,
        letter-spacing 220ms ease;
    }

    .menu-btn:hover {
      background: rgba(30, 50, 80, 0.8);
      border-color: #fff;
      letter-spacing: 0.18em;
    }

    .menu-btn:active {
      transform: translateY(1px);
    }

    .menu-btn.primary {
      background: rgba(60, 100, 160, 0.25);
      border-color: #9cc8ff;
      color: #fff;
    }

    .menu-btn.primary:hover {
      background: rgba(80, 130, 200, 0.4);
    }

    .menu-btn.ghost {
      background: transparent;
      border-color: var(--hud-line);
      color: var(--hud-text-dim);
    }

    /* ── Back button + section titles for sub-screens ── */
    .menu-back {
      position: absolute;
      top: var(--hud-margin);
      left: var(--hud-margin);
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--hud-text-dim);
      background: transparent;
      border: 1px solid transparent;
      padding: calc(var(--hud-unit) * 0.4) calc(var(--hud-unit) * 0.8);
      cursor: pointer;
      transition: color 120ms ease, border-color 120ms ease;
    }

    .menu-back:hover {
      color: var(--hud-text);
      border-color: var(--hud-border);
    }

    .menu-section-title {
      font-family: var(--hud-font-display);
      font-size: var(--hud-text-lg);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--hud-text);
      text-align: center;
      margin: 0 0 calc(var(--hud-unit) * 1.5);
    }

    /* ── Saved worlds list ── */
    .menu-saves-list {
      display: flex;
      flex-direction: column;
      gap: calc(var(--hud-unit) * 0.5);
      width: 100%;
      max-width: calc(var(--hud-unit) * 22);
    }

    .menu-saves-empty {
      text-align: center;
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.08em;
      color: var(--hud-text-dim);
      padding: calc(var(--hud-unit) * 2) 0;
      border: 1px dashed var(--hud-line);
      border-radius: calc(var(--hud-unit) * 0.2);
    }

    .menu-save-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: calc(var(--hud-unit) * 0.7) calc(var(--hud-unit) * 0.9);
      background: rgba(10, 20, 36, 0.7);
      border: 1px solid var(--hud-border);
      cursor: pointer;
      transition: background 120ms ease;
    }

    .menu-save-card:hover {
      background: rgba(30, 50, 80, 0.8);
    }

    .menu-save-name {
      font-family: var(--hud-font);
      font-size: var(--hud-text-md);
      color: var(--hud-text);
      letter-spacing: 0.06em;
    }

    .menu-save-meta {
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      color: var(--hud-text-dim);
      letter-spacing: 0.04em;
    }

    /* ── Footer ── */
    .menu-footer {
      position: absolute;
      bottom: var(--hud-margin);
      left: 0;
      right: 0;
      text-align: center;
      font-family: var(--hud-font);
      font-size: var(--hud-text-sm);
      letter-spacing: 0.1em;
      color: var(--hud-text-faint);
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

function createStars(container: HTMLDivElement, count: number): void {
  // Procedurally place N twinkling stars with random positions, sizes,
  // alphas and animation delays.
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'menu-star';
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const size = Math.random() < 0.85 ? 1 : Math.random() < 0.97 ? 2 : 3;
    const alpha = 0.3 + Math.random() * 0.7;
    const duration = 2 + Math.random() * 6;
    const delay = Math.random() * 6;
    star.style.left = `${x}%`;
    star.style.top = `${y}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.setProperty('--star-alpha', alpha.toFixed(2));
    star.style.animationDuration = `${duration.toFixed(1)}s`;
    star.style.animationDelay = `${delay.toFixed(1)}s`;
    container.appendChild(star);
  }
}

function buildMainScreen(): HTMLDivElement {
  const screen = document.createElement('div');
  screen.className = 'menu-screen';

  const title = document.createElement('h1');
  title.className = 'menu-title';
  title.textContent = 'Orbital';
  screen.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'menu-subtitle';
  subtitle.textContent = 'Expedição Estelar';
  screen.appendChild(subtitle);

  const buttons = document.createElement('div');
  buttons.className = 'menu-buttons';

  const newGame = document.createElement('button');
  newGame.type = 'button';
  newGame.className = 'menu-btn primary';
  newGame.textContent = 'Novo Jogo';
  newGame.addEventListener('click', (e) => {
    e.preventDefault();
    marcarInteracaoUi();
    _options?.onNewGame();
  });
  buttons.appendChild(newGame);

  const loadGame = document.createElement('button');
  loadGame.type = 'button';
  loadGame.className = 'menu-btn';
  loadGame.textContent = 'Mundos Salvos';
  loadGame.addEventListener('click', (e) => {
    e.preventDefault();
    marcarInteracaoUi();
    showSavesScreen();
  });
  buttons.appendChild(loadGame);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'menu-btn ghost';
  settings.textContent = 'Configurações';
  settings.addEventListener('click', (e) => {
    e.preventDefault();
    marcarInteracaoUi();
    showSettingsScreen();
  });
  buttons.appendChild(settings);

  screen.appendChild(buttons);
  return screen;
}

function buildSavesScreen(): HTMLDivElement {
  const screen = document.createElement('div');
  screen.className = 'menu-screen hidden';

  const title = document.createElement('h2');
  title.className = 'menu-section-title';
  title.textContent = 'Mundos Salvos';
  screen.appendChild(title);

  const list = document.createElement('div');
  list.className = 'menu-saves-list';
  refreshSavesList(list);
  screen.appendChild(list);

  return screen;
}

function refreshSavesList(list: HTMLDivElement): void {
  list.replaceChildren();
  const saves = listSavedWorlds();
  if (saves.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'menu-saves-empty';
    empty.textContent = 'Nenhum mundo salvo ainda';
    list.appendChild(empty);
    return;
  }
  for (const save of saves) {
    const card = document.createElement('div');
    card.className = 'menu-save-card';
    const name = document.createElement('div');
    name.className = 'menu-save-name';
    name.textContent = save.name;
    const meta = document.createElement('div');
    meta.className = 'menu-save-meta';
    meta.textContent = save.meta;
    card.append(name, meta);
    card.addEventListener('click', (e) => {
      e.preventDefault();
      marcarInteracaoUi();
      _options?.onLoadGame(save.id);
    });
    list.appendChild(card);
  }
}

/** Phase 2: actual save serialization goes here. For now returns empty. */
function listSavedWorlds(): Array<{ id: string; name: string; meta: string }> {
  try {
    const raw = localStorage.getItem('orbital_saves');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string; meta: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSettingsScreen(): HTMLDivElement {
  const screen = document.createElement('div');
  screen.className = 'menu-screen hidden';

  const title = document.createElement('h2');
  title.className = 'menu-section-title';
  title.textContent = 'Configurações';
  screen.appendChild(title);

  const placeholder = document.createElement('div');
  placeholder.className = 'menu-saves-empty';
  placeholder.textContent = 'Em breve';
  screen.appendChild(placeholder);

  return screen;
}

function showMainScreen(): void {
  _mainScreen?.classList.remove('hidden');
  _savesScreen?.classList.add('hidden');
  _settingsScreen?.classList.add('hidden');
  updateBackButton(false);
}

function showSavesScreen(): void {
  _mainScreen?.classList.add('hidden');
  _savesScreen?.classList.remove('hidden');
  _settingsScreen?.classList.add('hidden');
  updateBackButton(true);
}

function showSettingsScreen(): void {
  _mainScreen?.classList.add('hidden');
  _savesScreen?.classList.add('hidden');
  _settingsScreen?.classList.remove('hidden');
  updateBackButton(true);
}

let _backBtn: HTMLButtonElement | null = null;
function updateBackButton(visible: boolean): void {
  if (!_backBtn) return;
  _backBtn.style.display = visible ? '' : 'none';
}

export function criarMainMenu(options: MainMenuOptions): HTMLDivElement {
  if (_container) return _container;
  injectStyles();
  _options = options;

  const container = document.createElement('div');
  container.className = 'main-menu';

  // Background layers
  const nebula = document.createElement('div');
  nebula.className = 'menu-nebula';
  container.appendChild(nebula);

  const stars = document.createElement('div');
  stars.className = 'menu-stars';
  createStars(stars, 160);
  container.appendChild(stars);

  const vignette = document.createElement('div');
  vignette.className = 'menu-vignette';
  container.appendChild(vignette);

  // Back button (hidden on main screen)
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'menu-back';
  back.textContent = '◀ Voltar';
  back.style.display = 'none';
  back.addEventListener('click', (e) => {
    e.preventDefault();
    marcarInteracaoUi();
    showMainScreen();
  });
  _backBtn = back;
  container.appendChild(back);

  // Screens
  _mainScreen = buildMainScreen();
  _savesScreen = buildSavesScreen();
  _settingsScreen = buildSettingsScreen();
  container.append(_mainScreen, _savesScreen, _settingsScreen);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'menu-footer';
  footer.textContent = 'v0.1  ·  protótipo';
  container.appendChild(footer);

  // Esc on sub-screens goes back to main
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!_container || _container.classList.contains('hidden')) return;
    if (_mainScreen?.classList.contains('hidden')) {
      e.preventDefault();
      showMainScreen();
    }
  });

  document.body.appendChild(container);
  _container = container;
  return container;
}

export function esconderMainMenu(): void {
  _container?.classList.add('hidden');
}

export function mostrarMainMenu(): void {
  _container?.classList.remove('hidden');
  showMainScreen();
}

export function destruirMainMenu(): void {
  _container?.remove();
  _container = null;
  _mainScreen = null;
  _savesScreen = null;
  _settingsScreen = null;
  _backBtn = null;
  _options = null;
  _styleInjected = false;
}
