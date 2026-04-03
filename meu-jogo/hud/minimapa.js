import { Graphics, Container } from 'pixi.js';

const TAMANHO_MAPA = 200;
const MARGEM = 15;
const ALCANCE = 8000; // raio de visão do minimapa em pixels do mundo

export function criarMinimapa(app, mundo) {
  const container = new Container();

  const bg = new Graphics();
  bg.roundRect(0, 0, TAMANHO_MAPA, TAMANHO_MAPA, 8).fill({ color: 0x000000, alpha: 0.65 });
  bg.roundRect(0, 0, TAMANHO_MAPA, TAMANHO_MAPA, 8).stroke({ color: 0x555555, width: 1 });
  container.addChild(bg);

  const dots = new Graphics();
  container.addChild(dots);

  // Jogador sempre no centro
  const jogadorDot = new Graphics();
  jogadorDot.circle(0, 0, 4).fill({ color: 0x00ff00 });
  jogadorDot.x = TAMANHO_MAPA / 2;
  jogadorDot.y = TAMANHO_MAPA / 2;
  container.addChild(jogadorDot);

  container._dots = dots;
  container._mundo = mundo;

  container.x = app.screen.width - TAMANHO_MAPA - MARGEM;
  container.y = app.screen.height - TAMANHO_MAPA - MARGEM;

  return container;
}

export function atualizarMinimapa(minimapa, jogador, app) {
  const dots = minimapa._dots;
  const mundo = minimapa._mundo;
  const escala = TAMANHO_MAPA / (ALCANCE * 2);
  const centro = TAMANHO_MAPA / 2;

  dots.clear();

  for (const p of mundo.planetas) {
    const dx = p.x - jogador.x;
    const dy = p.y - jogador.y;

    if (Math.abs(dx) > ALCANCE || Math.abs(dy) > ALCANCE) continue;

    const mx = centro + dx * escala;
    const my = centro + dy * escala;
    const r = Math.max(2, (p.width * escala) / 2);
    dots.circle(mx, my, Math.min(r, 6)).fill({ color: 0x3388ff });
  }

  // Reposicionar no resize
  minimapa.x = app.screen.width - TAMANHO_MAPA - MARGEM;
  minimapa.y = app.screen.height - TAMANHO_MAPA - MARGEM;
}
