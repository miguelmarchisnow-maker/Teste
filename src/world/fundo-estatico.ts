import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';

/**
 * Static starfield for software / WARP renderers.
 *
 * Generates a single canvas of white dots ONCE at construction and
 * tiles it across the viewport via a TilingSprite. Zero per-frame
 * shader, zero per-frame canvas update — the sprite just moves with
 * the camera. This is essentially the old pre-shader starfield but
 * reduced to the absolute minimum: one canvas, one sprite, no
 * animation. On WARP this drops ~20 ms/frame vs. the procedural
 * fragment shader path.
 *
 * Trade-off: stars are static (no drift, no twinkle) and the tile
 * visibly repeats if you pan far. Acceptable when the alternative
 * is 10 FPS.
 */

const TILE_SIZE = 512;

interface FundoEstaticoContainer extends Container {
  _tiling: TilingSprite;
}

function gerarTileEstrelas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  // Black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Simple LCG so the dot pattern is identical each boot — helps
  // keep the visible seams across the tile edge from being too
  // obvious if they happen to align on patterns.
  let seed = 0x13579bdf;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // Two passes of dots: tiny 1-px and occasional 2×2 brighter ones.
  const tinyCount = 360;
  for (let i = 0; i < tinyCount; i++) {
    const x = Math.floor(rand() * TILE_SIZE);
    const y = Math.floor(rand() * TILE_SIZE);
    const brightness = 90 + Math.floor(rand() * 120);
    ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const brightCount = 30;
  for (let i = 0; i < brightCount; i++) {
    const x = Math.floor(rand() * (TILE_SIZE - 2));
    const y = Math.floor(rand() * (TILE_SIZE - 2));
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, 2, 2);
  }
  return canvas;
}

export function getStarfieldEstaticoMemoryBytes(_fundo: Container): number {
  return TILE_SIZE * TILE_SIZE * 4;
}

export function criarFundoEstatico(_tamanhoMundo: number): FundoEstaticoContainer {
  const container = new Container() as FundoEstaticoContainer;
  const canvas = gerarTileEstrelas();
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  // TilingSprite repeats the tile across the viewport without
  // allocating multiple sprites — one draw call total.
  const tiling = new TilingSprite({
    texture,
    width: TILE_SIZE * 8,
    height: TILE_SIZE * 8,
  });
  tiling.eventMode = 'none';
  container.addChild(tiling as unknown as Sprite);
  container._tiling = tiling;
  return container;
}

export function atualizarFundoEstatico(
  fundo: FundoEstaticoContainer,
  jogadorX: number,
  jogadorY: number,
  telaW: number,
  telaH: number,
): void {
  const tiling = fundo._tiling;
  // Pan the tile offset with parallax 0.5 so it moves slower than
  // the camera — cheap depth illusion.
  tiling.tilePosition.x = -jogadorX * 0.5;
  tiling.tilePosition.y = -jogadorY * 0.5;
  // Keep the sprite itself anchored to the viewport.
  tiling.x = jogadorX - telaW / 2;
  tiling.y = jogadorY - telaH / 2;
  tiling.width = telaW;
  tiling.height = telaH;
}
