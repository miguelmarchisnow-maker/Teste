import type { ProfilingData } from '../types';
import { profiling } from './profiling';

/**
 * Rolling profiling capture — starts appending one sample per frame
 * into a persistent buffer when the user presses 'Record' in the
 * debug menu, stops when they press again. The buffer is then
 * serialized and offered as a JSON download so the player can send
 * it to devs for post-mortem analysis.
 *
 * The flight-recorder design (capture during play, export later) is
 * the only way to meaningfully debug 'felt slow but I couldn't
 * reproduce it' — live profiling is useless when the user is in
 * the settings menu inspecting the graph.
 */

export interface LoggedFrame {
  /** Monotonic ms since recording started. */
  t: number;
  /** Every key from ProfilingData sampled at this frame. */
  buckets: ProfilingData;
}

export interface LogSession {
  startedAtIsoUtc: string;
  userAgent: string;
  viewport: { w: number; h: number; dpr: number };
  rendererName: string;
  gpuVendor: string;
  gpuRenderer: string;
  frames: LoggedFrame[];
  config: unknown;
}

let _active = false;
let _startMs = 0;
let _frames: LoggedFrame[] = [];
// Cap the buffer so a forgotten recording doesn't exhaust RAM. At
// 60 FPS this is ~5 minutes of samples; 120 Hz → ~2.5 min.
const MAX_FRAMES = 18_000;

export function iniciarLoggingProfiling(): void {
  if (_active) return;
  _active = true;
  _startMs = performance.now();
  _frames = [];
}

export function pararLoggingProfiling(): void {
  _active = false;
}

export function estaLoggingProfiling(): boolean {
  return _active;
}

/** How many frames have been captured so far. */
export function getFramesCapturadosCount(): number {
  return _frames.length;
}

/**
 * Called once per frame by the main ticker when recording is on.
 * Snapshots the current ProfilingData averages (cheap — they're
 * already computed by profileFlush).
 */
export function amostrarFrameProfiling(): void {
  if (!_active) return;
  if (_frames.length >= MAX_FRAMES) {
    // Hit the cap — stop quietly instead of thrashing GC.
    _active = false;
    return;
  }
  _frames.push({
    t: performance.now() - _startMs,
    buckets: { ...profiling },
  });
}

/**
 * Bundle the captured frames + a bit of environment metadata into
 * a session object. Environment helps whoever debugs see which
 * browser / GPU / resolution the session came from.
 */
function montarSessao(app: { renderer?: any } | null, config: unknown): LogSession {
  const r = app?.renderer;
  const rendererName = String(r?.name ?? r?.type ?? 'desconhecido');
  let gpuVendor = 'desconhecido';
  let gpuRenderer = 'desconhecido';
  try {
    const gl = r?.gl as WebGLRenderingContext | WebGL2RenderingContext | undefined;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        gpuVendor = (gl.getParameter((ext as any).UNMASKED_VENDOR_WEBGL) as string) ?? gpuVendor;
        gpuRenderer = (gl.getParameter((ext as any).UNMASKED_RENDERER_WEBGL) as string) ?? gpuRenderer;
      }
    }
    const adapter = r?.gpu?.adapter as GPUAdapter | undefined;
    if (adapter?.info) {
      gpuVendor = adapter.info.vendor || gpuVendor;
      gpuRenderer = adapter.info.description || adapter.info.device || adapter.info.architecture || gpuRenderer;
    }
  } catch { /* best-effort */ }

  return {
    startedAtIsoUtc: new Date(Date.now() - (performance.now() - _startMs)).toISOString(),
    userAgent: navigator.userAgent,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
    rendererName,
    gpuVendor,
    gpuRenderer,
    frames: [..._frames],
    config,
  };
}

/**
 * Pack the captured session into a JSON blob and trigger a browser
 * download. Does NOT stop recording — caller should do that first if
 * they want the final snapshot.
 */
export function baixarLogProfiling(app: { renderer?: any } | null, config: unknown): void {
  const sessao = montarSessao(app, config);
  const json = JSON.stringify(sessao, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `orbital-profiling-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick — the browser has already started the download.
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function limparLogProfiling(): void {
  _frames = [];
  _startMs = performance.now();
}
