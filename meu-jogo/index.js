import { Application } from 'pixi.js';
import { criarMundo, atualizarMundo } from './world/mundo.js';
import { configurarControles, criarJogador, atualizarJogador } from './player/player.js';
import { criarMinimapa, atualizarMinimapa } from './hud/minimapa.js';

const app = new Application();
await app.init({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x0a0a1a,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
  antialias: true,
});

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.appendChild(app.canvas);

window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
});

const mundo = await criarMundo(app);
app.stage.addChild(mundo.container);

const jogador = await criarJogador(mundo);
mundo.container.addChild(jogador);

configurarControles(app);

const minimapa = criarMinimapa(app, mundo);
app.stage.addChild(minimapa);

const velJogador = 6;

app.ticker.add(() => {
  atualizarJogador(jogador, app, mundo, velJogador);
  atualizarMundo(mundo, jogador, app);
  atualizarMinimapa(minimapa, jogador, app);
});
