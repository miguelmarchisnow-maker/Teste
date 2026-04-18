import type { Application, Container } from 'pixi.js';
import { RenderTexture } from 'pixi.js';
import { criarPlanetaProceduralSprite, criarEstrelaProcedural } from '../world/planeta-procedural';
import { TIPO_PLANETA } from '../world/planeta';
import type { OrbitalConfig } from './config';

/**
 * Heavy GPU + CPU benchmark.
 *
 * Runs an intentionally-hostile render workload off-screen for ~2.5
 * seconds and classifies the result. The goal is to approximate the
 * worst-case frame the player might hit mid-game (zoom-in on a cluster
 * of planets with starfield + fog active) so the preset we pick
 * actually survives that case. The live game runs much lighter than
 * this at typical zoom, so using the live profiler for auto-tuning
 * would under-estimate load.
 *
 * Workload:
 *   - 12 planet meshes at 384×384 unit-scale, one per known planet
 *     type, packed into a grid. Each mesh runs the full terran/gas/
 *     dry/islands/star fragment shader every frame.
 *   - 1 star mesh at 512×512.
 *   - Rendered into a 1920×1080 RenderTexture repeatedly so the
 *     measurement reflects native-res fill rate, not the user's
 *     current renderScale setting.
 *
 * Result is the average ms per rendered frame across the sampling
 * window (first 20 frames discarded as warm-up).
 */

export interface BenchmarkResult {
  avgFrameMs: number;
  minFrameMs: number;
  maxFrameMs: number;
  framesSampled: number;
  recommendedPreset: OrbitalConfig['graphics']['qualidadeEfeitos'];
  recommendedRenderScale: number;
}

const SAMPLE_MS = 2500;
const WARMUP_FRAMES = 20;
const TEST_WIDTH = 1920;
const TEST_HEIGHT = 1080;

/**
 * Classify the measured avg frame time into a preset.
 *
 * Budget logic: 60 FPS = 16.67 ms/frame. A preset is chosen so that
 * the worst-case workload has at least a 3× buffer over that budget
 * on the recommended preset — meaning the real game (much lighter)
 * should hit the FPS target with headroom.
 */
function classificar(avgMs: number): {
  preset: OrbitalConfig['graphics']['qualidadeEfeitos'];
  scale: number;
} {
  // Thresholds are measured on this synthetic stress scene, not live
  // gameplay. A 5ms avg here roughly translates to a live game avg
  // under 1ms — plenty of headroom for 'alto'.
  if (avgMs < 5)      return { preset: 'alto',   scale: 1.0 };
  if (avgMs < 12)     return { preset: 'medio',  scale: 1.0 };
  if (avgMs < 22)     return { preset: 'medio',  scale: 0.85 };
  if (avgMs < 35)     return { preset: 'baixo',  scale: 0.75 };
  if (avgMs < 55)     return { preset: 'baixo',  scale: 0.5 };
  return               { preset: 'minimo', scale: 0.35 };
}

/**
 * Build the worst-case test scene inside a Container. Caller owns
 * the lifetime and must destroy it after the benchmark finishes.
 */
async function construirCenaTeste(): Promise<Container> {
  const { Container: Ctor } = await import('pixi.js');
  const root = new Ctor();

  const tiposArray = Object.values(TIPO_PLANETA);
  // 12 planets in a 4×3 grid, each ~384 px wide.
  const cell = 384;
  const cols = 4;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tipo = tiposArray[(r * cols + c) % tiposArray.length];
      const mesh = criarPlanetaProceduralSprite(
        c * cell + cell / 2,
        r * cell + cell / 2,
        cell,
        tipo,
        1 + Math.random() * 9,
      );
      root.addChild(mesh as unknown as Container);
    }
  }

  // One star mesh at 512 to stress the star-specific shader path.
  const sol = criarEstrelaProcedural(2 * cell, 2 * cell, 256);
  root.addChild(sol as unknown as Container);

  return root;
}

/**
 * Run the benchmark. Shows no UI by itself — caller is expected to
 * present progress / results. Returns a promise that resolves after
 * the sampling window closes. `onProgress` is invoked with a 0..1
 * value so the UI can render a progress bar.
 */
export async function rodarBenchmark(
  app: Application,
  onProgress?: (p: number) => void,
): Promise<BenchmarkResult> {
  const scene = await construirCenaTeste();
  const rt = RenderTexture.create({ width: TEST_WIDTH, height: TEST_HEIGHT });
  const samples: number[] = [];
  const start = performance.now();

  try {
    let frame = 0;
    while (true) {
      const t0 = performance.now();
      app.renderer.render({ container: scene, target: rt });
      // Force the GPU to actually finish so the measurement reflects
      // real work, not just command-queue enqueue time. WebGL doesn't
      // have a public finish() from Pixi; the next rAF boundary is a
      // close proxy — browsers won't deliver rAF until the frame paints.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const t1 = performance.now();
      if (frame >= WARMUP_FRAMES) samples.push(t1 - t0);
      frame++;
      const elapsed = t1 - start;
      if (onProgress) onProgress(Math.min(1, elapsed / SAMPLE_MS));
      if (elapsed >= SAMPLE_MS) break;
    }
  } finally {
    try { scene.destroy({ children: true }); } catch { /* noop */ }
    try { rt.destroy(true); } catch { /* noop */ }
  }

  if (samples.length === 0) {
    // Couldn't sample — GPU isn't cooperating. Be conservative.
    return {
      avgFrameMs: 999,
      minFrameMs: 999,
      maxFrameMs: 999,
      framesSampled: 0,
      recommendedPreset: 'minimo',
      recommendedRenderScale: 0.35,
    };
  }

  // Trim the worst 10% (outliers from GC or background tabs).
  samples.sort((a, b) => a - b);
  const trimmed = samples.slice(0, Math.ceil(samples.length * 0.9));
  const sum = trimmed.reduce((a, b) => a + b, 0);
  const avg = sum / trimmed.length;
  const { preset, scale } = classificar(avg);

  return {
    avgFrameMs: avg,
    minFrameMs: samples[0],
    maxFrameMs: samples[samples.length - 1],
    framesSampled: samples.length,
    recommendedPreset: preset,
    recommendedRenderScale: scale,
  };
}
