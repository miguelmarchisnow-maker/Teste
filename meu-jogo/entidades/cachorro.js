import { Assets, AnimatedSprite, Spritesheet, SCALE_MODES } from 'pixi.js';

export async function criarCachorro(app, areaJogo) {
  const texture = await Assets.load('../assets/cachorro_branco.png');
  texture.source.scaleMode = SCALE_MODES.NEAREST;

  const frameW = 16;
  const frameH = 14;
  const colunas = 6;
  const linhas = 5;

  const frames = {};
  const animacoes = {};
  const nomeLinhas = ['idle', 'andar_baixo', 'andar_direita', 'andar_cima', 'andar_esquerda'];

  for (let linha = 0; linha < linhas; linha++) {
    const nomeAnim = nomeLinhas[linha];
    animacoes[nomeAnim] = [];
    for (let col = 0; col < colunas; col++) {
      const id = `cachorro_${linha}_${col}`;
      frames[id] = {
        frame: { x: col * frameW, y: linha * frameH, w: frameW, h: frameH },
        sourceSize: { w: frameW, h: frameH },
        spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
      };
      animacoes[nomeAnim].push(id);
    }
  }

  const sheet = new Spritesheet(texture, {
    frames,
    meta: { scale: 1 },
    animations: animacoes,
  });
  await sheet.parse();

  const sprite = new AnimatedSprite(sheet.animations['idle']);
  sprite.animationSpeed = 0.15;
  sprite.play();
  sprite.width = 80;
  sprite.height = 80;
  sprite.anchor.set(0.5);
  sprite.x = app.screen.width / 2 - 120;
  sprite.y = areaJogo.top + areaJogo.height / 2;
  sprite._sheet = sheet;

  return sprite;
}

/**
 * Segue o alvo mantendo uma distância mínima (evita sobreposição).
 */
export function atualizarCachorro(cachorro, alvo, areaJogo, velocidade) {
  const dx = alvo.x - cachorro.x;
  const dy = alvo.y - cachorro.y;
  const dist = Math.hypot(dx, dy);
  const distanciaMinima = 48;

  if (dist > distanciaMinima && dist > 0.001) {
    cachorro.x += (dx / dist) * velocidade;
    cachorro.y += (dy / dist) * velocidade;

    const sheet = cachorro._sheet;
    let anim;
    if (Math.abs(dx) > Math.abs(dy)) {
      anim = dx > 0 ? 'andar_direita' : 'andar_esquerda';
    } else {
      anim = dy > 0 ? 'andar_baixo' : 'andar_cima';
    }
    if (cachorro._animAtual !== anim) {
      cachorro.textures = sheet.animations[anim];
      cachorro.play();
      cachorro._animAtual = anim;
    }
  } else {
    if (cachorro._animAtual !== 'idle') {
      cachorro.textures = cachorro._sheet.animations['idle'];
      cachorro.play();
      cachorro._animAtual = 'idle';
    }
  }

  const m = 20;
  cachorro.x = Math.max(areaJogo.left + m, Math.min(areaJogo.right - m, cachorro.x));
  cachorro.y = Math.max(areaJogo.top + m, Math.min(areaJogo.bottom - m, cachorro.y));
}
