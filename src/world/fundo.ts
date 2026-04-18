import {
  Buffer, Container, Geometry, GlProgram, GpuProgram, Mesh,
  Shader, State, UniformGroup,
} from 'pixi.js';
import vertexSrc from '../shaders/starfield.vert?raw';
import fragmentSrc from '../shaders/starfield.frag?raw';
import wgslSrc from '../shaders/starfield.wgsl?raw';
import { getConfig } from '../core/config';

/**
 * Starfield renderer. Replaced the old canvas-tile-cache approach
 * (400 MB GPU pior caso) with a single fullscreen fragment shader
 * that procedurally draws 3 parallax layers of stars on the GPU.
 *
 * How it works:
 *   - A single unit quad Mesh sits at world position (camX - vpW/2,
 *     camY - vpH/2) with size (vpW, vpH). Repositioned each frame by
 *     atualizarFundo() so it always exactly covers the visible area.
 *   - The fragment shader computes a "virtual world position" per
 *     pixel from camera + UV and hashes it to decide whether a star
 *     exists at that coordinate, plus its brightness/color/twinkle.
 *   - Layers have different cell sizes, parallax factors, and drift
 *     speeds to simulate depth; uTime drives per-star twinkle and
 *     slow world-space drift.
 *
 * Memory: ~10 KB (shader programs + uniform block). No textures at
 * all — the old cache is gone.
 */

interface FundoContainer extends Container {
  _mesh: Mesh<Geometry, Shader>;
  _uniforms: UniformGroup;
  _tempoAcumMs: number;
}

/**
 * Approximate bytes held by the starfield renderer. Now trivially
 * tiny — kept for compatibility with the RAM HUD readout.
 */
export function getStarfieldMemoryBytes(_fundo: Container): number {
  // 2 shader programs (GLSL + WGSL) + one uniform block.
  return 10 * 1024;
}

// ─── Shared GPU resources ─────────────────────────────────────────
// Programs + geometry are created once at module load and reused for
// every FundoContainer (menu world + main world).

function criarUnitQuadGeometry(): Geometry {
  const positions = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return new Geometry({
    attributes: {
      aPosition: { buffer: new Buffer({ data: positions, usage: 32 | 8 }), format: 'float32x2' },
      aUV: { buffer: new Buffer({ data: uvs, usage: 32 | 8 }), format: 'float32x2' },
    },
    indexBuffer: new Buffer({ data: indices, usage: 16 | 8 }),
  });
}

const sharedQuadGeometry = criarUnitQuadGeometry();

const sharedGlProgram = GlProgram.from({
  vertex: vertexSrc,
  fragment: fragmentSrc,
  name: 'starfield-shader',
});

const sharedGpuProgram = GpuProgram.from({
  vertex: { source: wgslSrc, entryPoint: 'mainVertex' },
  fragment: { source: wgslSrc, entryPoint: 'mainFragment' },
  name: 'starfield-shader',
});

function criarUniforms(): UniformGroup {
  return new UniformGroup({
    uCamera:    { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uViewport:  { value: new Float32Array([1920, 1080]), type: 'vec2<f32>' },
    uTime:      { value: 0, type: 'f32' },
    uDensidade: { value: 1.0, type: 'f32' },
  });
}

/**
 * Force the starfield shader program to compile + link NOW by rendering
 * an off-screen test mesh. Call this once at boot — same pattern as
 * precompilarShadersPlaneta — so the first world/menu render doesn't
 * pay the GL link cost mid-frame.
 */
export async function precompilarShaderStarfield(
  app: { renderer: { render: (opts: { container: Container; target: any }) => void } },
): Promise<void> {
  let warmup: Container | null = null;
  let target: any = null;
  try {
    const { RenderTexture } = await import('pixi.js');
    warmup = criarFundo(1) as Container;
    target = RenderTexture.create({ width: 8, height: 8 });
    app.renderer.render({ container: warmup, target });
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  } catch (err) {
    console.warn('[fundo] starfield shader warmup failed (non-fatal):', err);
  } finally {
    try { warmup?.destroy({ children: true }); } catch { /* noop */ }
    try { target?.destroy(true); } catch { /* noop */ }
  }
}

export function criarFundo(_tamanhoMundo: number): FundoContainer {
  const container = new Container() as FundoContainer;

  const uniforms = criarUniforms();
  const shader = new Shader({
    gpuProgram: sharedGpuProgram,
    glProgram: sharedGlProgram,
    resources: { starUniforms: uniforms },
  });

  const state = State.for2d();
  state.blend = false; // Opaque fullscreen draw — blending is pointless overhead.

  const mesh = new Mesh({
    geometry: sharedQuadGeometry,
    shader,
    state,
  });
  // The quad is unit-sized; atualizarFundo scales + positions it to
  // exactly cover the current viewport every frame.
  mesh.eventMode = 'none';

  container.addChild(mesh);
  container._mesh = mesh;
  container._uniforms = uniforms;
  container._tempoAcumMs = 0;

  return container;
}

/**
 * Repositions the fullscreen starfield quad to cover the current
 * viewport in world coords and pushes camera + time uniforms to the
 * shader. Called every frame from the main ticker.
 *
 * @param fundo   Container do starfield retornado por criarFundo()
 * @param jogadorX Centro X da viewport em world units
 * @param jogadorY Centro Y da viewport em world units
 * @param telaW   Largura da viewport em world units
 * @param telaH   Altura da viewport em world units
 */
export function atualizarFundo(
  fundo: FundoContainer,
  jogadorX: number,
  jogadorY: number,
  telaW: number,
  telaH: number,
): void {
  const mesh = fundo._mesh;
  // Cover the viewport exactly — a touch of overscan isn't needed
  // because the shader has no texture boundaries to hide.
  mesh.x = jogadorX - telaW / 2;
  mesh.y = jogadorY - telaH / 2;
  mesh.scale.set(telaW, telaH);

  // Integrate time (seconds) for parallax drift + twinkle.
  fundo._tempoAcumMs += 16.67; // Called once per frame; real dt isn't
                               // critical — the effect is cosmetic.
  const uniforms = fundo._uniforms.uniforms as {
    uCamera: Float32Array;
    uViewport: Float32Array;
    uTime: number;
    uDensidade: number;
  };
  uniforms.uCamera[0] = jogadorX;
  uniforms.uCamera[1] = jogadorY;
  uniforms.uViewport[0] = telaW;
  uniforms.uViewport[1] = telaH;
  uniforms.uTime = fundo._tempoAcumMs / 1000;
  uniforms.uDensidade = getConfig().graphics.densidadeStarfield;
  // UniformGroup in Pixi v8 auto-dirty tracks property writes — no
  // explicit .update() call needed (and none exists on the API).
}
