/**
 * weydra-renderer TypeScript bridge.
 *
 * Wraps the WASM-exported Renderer with an idiomatic TypeScript API.
 * For M1, just forwards init + render + resize.
 */

import init, { Renderer as WasmRenderer } from 'weydra-renderer-wasm';

let _initPromise: Promise<void> | null = null;

/**
 * Load the WASM module. Must be awaited before creating any Renderer.
 * Safe to call multiple times — concurrent calls share the same in-flight
 * promise, so the module is only initialized once.
 */
export function initWeydra(): Promise<void> {
  if (_initPromise) return _initPromise;
  const p = init().then(() => {});
  _initPromise = p;
  return p;
}

/**
 * The weydra-renderer instance. Bound to a specific HTMLCanvasElement.
 */
export class Renderer {
  private readonly inner: WasmRenderer;

  private constructor(inner: WasmRenderer) {
    this.inner = inner;
  }

  /**
   * Create a new Renderer on the given canvas.
   * Must call `initWeydra()` first.
   */
  static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
    if (!_initPromise) {
      throw new Error('initWeydra() must be called before Renderer.create()');
    }
    await _initPromise;
    const inner = await WasmRenderer.create(canvas);
    return new Renderer(inner);
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`weydra resize: invalid dimensions ${width}x${height}`);
    }
    try {
      this.inner.resize(width, height);
    } catch (e) {
      throw new Error(`weydra resize failed: ${String(e)}`);
    }
  }

  render(): void {
    try {
      this.inner.render();
    } catch (e) {
      throw new Error(`weydra render failed: ${String(e)}`);
    }
  }
}

export type { };
