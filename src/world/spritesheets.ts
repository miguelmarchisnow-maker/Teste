import { Assets, Texture } from 'pixi.js';

/**
 * Central loader for the HUD/world spritesheets. Everything goes through
 * Pixi's Assets cache so a fetch only ever happens once per sheet, even
 * if the ship world renderer, build panel, and ship panel all load it
 * concurrently.
 *
 * The HUD panels need an `HTMLImageElement` because they draw to a 2D
 * canvas via `drawImage`. The world renderer needs a Pixi `Texture` so it
 * can create sub-textures with custom `frame` rectangles. Both are served
 * from the same Pixi asset so the underlying `HTMLImageElement` lives in
 * memory exactly once.
 */
interface Sheet {
  path: string;
  texture: Texture | null;
  image: HTMLImageElement | null;
  promise: Promise<void> | null;
}

const _sheets: Record<'ships' | 'buildings', Sheet> = {
  ships: { path: 'assets/ships.png', texture: null, image: null, promise: null },
  buildings: { path: 'assets/buildings.png', texture: null, image: null, promise: null },
};

export async function carregarSpritesheet(name: 'ships' | 'buildings'): Promise<void> {
  const sheet = _sheets[name];
  if (sheet.texture && sheet.image) return;
  if (sheet.promise) return sheet.promise;

  sheet.promise = (async () => {
    const tex: Texture = await Assets.load(sheet.path);
    tex.source.scaleMode = 'nearest';
    sheet.texture = tex;
    // In PixiJS v8, Texture sources backed by an image file expose the
    // underlying DOM element via `.resource`. HUD panels consume this
    // HTMLImageElement directly through ctx.drawImage().
    const resource = (tex.source as unknown as { resource: unknown }).resource;
    if (resource instanceof HTMLImageElement) {
      sheet.image = resource;
    } else if (resource instanceof HTMLCanvasElement || resource instanceof ImageBitmap) {
      // Fallback: draw the resource into a fresh canvas-backed Image so HUD
      // code that expects HTMLImageElement still works.
      const canvas = document.createElement('canvas');
      canvas.width = tex.source.width;
      canvas.height = tex.source.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(resource as CanvasImageSource, 0, 0);
      const img = new Image();
      img.src = canvas.toDataURL();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); });
      sheet.image = img;
    } else {
      throw new Error(`spritesheets: unsupported texture source for ${sheet.path}`);
    }
  })();

  return sheet.promise;
}

export function getSpritesheetTexture(name: 'ships' | 'buildings'): Texture | null {
  return _sheets[name].texture;
}

export function getSpritesheetImage(name: 'ships' | 'buildings'): HTMLImageElement | null {
  return _sheets[name].image;
}

export function onSpritesheetReady(name: 'ships' | 'buildings', cb: () => void): void {
  const sheet = _sheets[name];
  if (sheet.image) { cb(); return; }
  if (!sheet.promise) { carregarSpritesheet(name).then(cb); return; }
  sheet.promise.then(cb);
}
