/**
 * weydra-renderer TypeScript bridge.
 *
 * Wraps the WASM-exported Renderer with an idiomatic TypeScript API.
 * For M1, just forwards init + render + resize.
 */

import init, { Renderer as WasmRenderer } from 'weydra-renderer-wasm';

let _initialized = false;

/**
 * Load the WASM module. Must be awaited before creating any Renderer.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initWeydra(): Promise<void> {
  if (_initialized) return;
  await init();
  _initialized = true;
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
    if (!_initialized) {
      throw new Error('initWeydra() must be called before Renderer.create()');
    }
    const inner = await new WasmRenderer(canvas);
    return new Renderer(inner);
  }

  resize(width: number, height: number): void {
    this.inner.resize(width, height);
  }

  render(): void {
    this.inner.render();
  }
}

export type { };
