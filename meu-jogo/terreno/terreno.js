import { Graphics, Sprite, Assets, Container } from 'pixi.js';

/** Fração da altura da tela ocupada pelo céu (restante = gramado). */
export const FRACAO_ALTURA_CEU = 0.7;

const CEU_ASSET = '/assets/ceu-nuvens.png';

/**
 * Céu com textura de nuvens + gramado verde (terreno jogável na parte inferior).
 */
export async function criarTerreno(app) {
  const container = new Container();
  const w = app.screen.width;
  const h = app.screen.height;
  const alturaCeus = h * FRACAO_ALTURA_CEU;

  const texture = await Assets.load(CEU_ASSET);
  const ceu = new Sprite(texture);
  ceu.width = w;
  ceu.height = alturaCeus;
  ceu.x = 0;
  ceu.y = 0;
  container.addChild(ceu);

  const grama = new Graphics();
  grama.rect(0, alturaCeus, w, h - alturaCeus).fill({ color: 0x3d8c40 });
  container.addChild(grama);

  return container;
}
