import { Container } from 'pixi.js';
import { criarFundo, atualizarFundo } from './fundo.js';
import { criarPlaneta, criarPlanetaSprite } from './planeta.js';

export async function criarMundo(app) {
  const tamanho = Math.max(window.innerWidth, window.innerHeight) * 50;
  const container = new Container();

  const fundo = criarFundo(tamanho);
  container.addChild(fundo);

  const planetaSheet = await criarPlaneta(app);
  const planetas = [];
  const grid = 20;
  const celula = tamanho / grid;

  const DIST_MIN = 800;

  function muitoPerto(x, y) {
    for (const p of planetas) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < DIST_MIN * DIST_MIN) return true;
    }
    return false;
  }

  for (let gx = 0; gx < grid; gx++) {
    for (let gy = 0; gy < grid; gy++) {
      const qtd = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < qtd; i++) {
        let x, y, tentativas = 0;
        do {
          x = gx * celula + Math.random() * celula;
          y = gy * celula + Math.random() * celula;
          tentativas++;
        } while (muitoPerto(x, y) && tentativas < 10);

        if (tentativas >= 10) continue;

        const tam = 150 + Math.random() * 400;
        const p = criarPlanetaSprite(planetaSheet, x, y, tam);
        p.visible = false;
        container.addChild(p);
        planetas.push(p);
      }
    }
  }

  return { container, tamanho, planetas, fundo };
}

export function atualizarMundo(mundo, jogador, app) {
  // Câmera
  mundo.container.x = app.screen.width / 2 - jogador.x;
  mundo.container.y = app.screen.height / 2 - jogador.y;

  // Fundo chunking
  atualizarFundo(mundo.fundo, jogador.x, jogador.y, app.screen.width, app.screen.height);

  // Culling planetas
  const margem = 500;
  const esq = jogador.x - app.screen.width / 2 - margem;
  const dir = jogador.x + app.screen.width / 2 + margem;
  const cima = jogador.y - app.screen.height / 2 - margem;
  const baixo = jogador.y + app.screen.height / 2 + margem;

  for (const p of mundo.planetas) {
    const vis = p.x > esq && p.x < dir && p.y > cima && p.y < baixo;
    if (vis && !p.visible) p.play();
    else if (!vis && p.visible) p.stop();
    p.visible = vis;
  }
}
