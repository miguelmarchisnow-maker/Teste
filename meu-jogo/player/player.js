import { Sprite, Assets, SCALE_MODES } from 'pixi.js';

const mouse = { x: 0, y: 0, pressionado: false };
const teclas = {};

export function configurarControles(app) {
  app.canvas.addEventListener('mousemove', (e) => {
    const rect = app.canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  app.canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.pressionado = true; });
  app.canvas.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.pressionado = false; });
  window.addEventListener('keydown', (e) => { teclas[e.code] = true; });
  window.addEventListener('keyup', (e) => { teclas[e.code] = false; });
}

export async function criarJogador(mundo) {
  const textura = await Assets.load('../assets/nave.png');
  textura.source.scaleMode = SCALE_MODES.NEAREST;
  const sprite = new Sprite(textura);
  sprite.width = 112;
  sprite.height = 77;
  sprite.anchor.set(0.5);
  sprite.x = mundo.tamanho / 2;
  sprite.y = mundo.tamanho / 2;
  return sprite;
}

export function atualizarJogador(jogador, app, mundo, velocidade) {
  // Rotação: mira no mouse (converte tela -> mundo)
  const centroTelaX = app.screen.width / 2;
  const centroTelaY = app.screen.height / 2;
  const dx = mouse.x - centroTelaX;
  const dy = mouse.y - centroTelaY;
  jogador.rotation = Math.atan2(dy, dx);

  // Movimento: WASD ou mouse esquerdo
  let mx = 0, my = 0;
  if (teclas.KeyW) my -= 1;
  if (teclas.KeyS) my += 1;
  if (teclas.KeyA) mx -= 1;
  if (teclas.KeyD) mx += 1;

  if (mouse.pressionado) {
    const distMouse = Math.hypot(dx, dy);
    if (distMouse > 5) {
      mx += dx / distMouse;
      my += dy / distMouse;
    }
  }

  if (mx !== 0 || my !== 0) {
    const norm = Math.hypot(mx, my);
    jogador.x += (mx / norm) * velocidade;
    jogador.y += (my / norm) * velocidade;
  }

  const m = 40;
  jogador.x = Math.max(m, Math.min(mundo.tamanho - m, jogador.x));
  jogador.y = Math.max(m, Math.min(mundo.tamanho - m, jogador.y));
}
