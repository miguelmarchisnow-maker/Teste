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
  /** RGBA8 pixel bytes of the sheet, populated lazily on the first
   *  `getSpritesheetBytes` call so Pixi-only sessions never pay the
   *  getImageData cost. Cached once per session. */
  bytes: Uint8Array | null;
  width: number;
  height: number;
  /** Weydra texture handle (bigint) once the bytes have been uploaded.
   *  Stored as `unknown` so this file doesn't depend on @weydra/renderer
   *  types — callers cast when they receive it. */
  weydraTexture: unknown;
}

const _sheets: Record<'ships' | 'buildings', Sheet> = {
  ships: {
    path: 'assets/ships.png', texture: null, image: null, promise: null,
    bytes: null, width: 0, height: 0, weydraTexture: null,
  },
  buildings: {
    path: 'assets/buildings.png', texture: null, image: null, promise: null,
    bytes: null, width: 0, height: 0, weydraTexture: null,
  },
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

/**
 * RGBA8 bytes + dimensions of the loaded spritesheet image, rasterized via
 * OffscreenCanvas.getImageData on first access. Returns `null` if the sheet
 * isn't loaded yet (caller should await `onSpritesheetReady` first).
 *
 * Used by the weydra-renderer upload path — weydra needs raw pixel bytes,
 * not a Pixi Texture. Cached per session; call is ~10-50 ms on first hit
 * (sheet decode + bitmap paint), free afterwards.
 */
export function getSpritesheetBytes(
  name: 'ships' | 'buildings',
): { bytes: Uint8Array; width: number; height: number } | null {
  const sheet = _sheets[name];
  if (sheet.bytes) {
    return { bytes: sheet.bytes, width: sheet.width, height: sheet.height };
  }
  const img = sheet.image;
  if (!img) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  sheet.bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  sheet.width = w;
  sheet.height = h;
  return { bytes: sheet.bytes, width: w, height: h };
}

/** Cached weydra texture handle (bigint). Set by whoever uploads first. */
export function getSpritesheetWeydraTexture(name: 'ships' | 'buildings'): unknown {
  return _sheets[name].weydraTexture;
}

export function setSpritesheetWeydraTexture(name: 'ships' | 'buildings', h: unknown): void {
  _sheets[name].weydraTexture = h;
}

export function onSpritesheetReady(name: 'ships' | 'buildings', cb: () => void): void {
  const sheet = _sheets[name];
  if (sheet.image) { cb(); return; }
  if (!sheet.promise) { carregarSpritesheet(name).then(cb); return; }
  sheet.promise.then(cb);
}

/**
 * Approximate bytes held by loaded spritesheet textures + decoded
 * HTMLImageElement originals. RAM readout uses this.
 */
export function getSpritesheetMemoryBytes(): number {
  let total = 0;
  for (const key of ['ships', 'buildings'] as const) {
    const sheet = _sheets[key];
    const img = sheet.image;
    if (!img) continue;
    // Decoded image pixels + the GPU upload — count both sides.
    const pixels = img.naturalWidth * img.naturalHeight * 4;
    total += pixels * 2;
  }
  return total;
}
