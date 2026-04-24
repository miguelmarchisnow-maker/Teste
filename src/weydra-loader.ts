/**
 * Loader for the weydra-renderer. Behind a debug flag so M1 can validate
 * the pipeline end-to-end without changing any real rendering yet.
 *
 * Activated by setting localStorage.weydra_m1 = '1' in the browser console.
 * When enabled: mounts a black-clearing renderer on #weydra-canvas behind
 * the Pixi canvas. When disabled: no-op, game runs exactly like before.
 */

import { initWeydra, Renderer } from '@weydra/renderer';

let _renderer: Renderer | null = null;
let _rafHandle: number | null = null;

function isEnabled(): boolean {
  try {
    return localStorage.getItem('weydra_m1') === '1';
  } catch {
    return false;
  }
}

export async function startWeydraM1(): Promise<void> {
  if (!isEnabled()) return;

  const canvas = document.getElementById('weydra-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.warn('[weydra] #weydra-canvas not found in DOM — skipping M1 init');
    return;
  }

  // Match canvas backing-store to its display size so rendering isn't stretched.
  // At first call clientWidth/Height may still be 0 (layout not yet flushed).
  // Fallback to window size, then resize handler corrects it on first paint.
  function currentSize(): { width: number; height: number; dpr: number } {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas!.clientWidth || window.innerWidth;
    const cssH = canvas!.clientHeight || window.innerHeight;
    return { width: Math.max(1, Math.floor(cssW * dpr)), height: Math.max(1, Math.floor(cssH * dpr)), dpr };
  }
  {
    const { width, height } = currentSize();
    canvas.width = width;
    canvas.height = height;
  }

  try {
    await initWeydra();
    _renderer = await Renderer.create(canvas);
    console.info('[weydra] M1 renderer initialized, clearing to black at 60fps');
  } catch (err) {
    console.error('[weydra] init failed:', err);
    return;
  }

  // Resize on window resize. Re-read devicePixelRatio each call —
  // moving window between monitors with different DPI changes it.
  window.addEventListener('resize', () => {
    if (!_renderer) return;
    const { width, height } = currentSize();
    canvas.width = width;
    canvas.height = height;
    _renderer.resize(width, height);
  });

  // Render loop via rAF. Independent of Pixi's ticker so M1 can be
  // validated in isolation.
  const loop = () => {
    if (_renderer) _renderer.render();
    _rafHandle = requestAnimationFrame(loop);
  };
  _rafHandle = requestAnimationFrame(loop);
}

export function stopWeydraM1(): void {
  if (_rafHandle !== null) {
    cancelAnimationFrame(_rafHandle);
    _rafHandle = null;
  }
  _renderer = null;
}
