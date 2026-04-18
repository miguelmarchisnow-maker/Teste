import {
  Buffer, Container, Geometry, GlProgram, GpuProgram, Mesh,
  RenderTexture, Shader, State, UniformGroup,
} from 'pixi.js';
import vertexSrc from '../shaders/starfield.vert?raw';
import fragmentSrc from '../shaders/starfield.frag?raw';
import wgslSrc from '../shaders/starfield.wgsl?raw';
import { getConfig } from '../core/config';

/**
 * Starfield renderer — one fullscreen Mesh running a procedural
 * fragment shader that draws 3 parallax layers of pixel-perfect
 * stars. Zero textures, ~10 KB GPU memory.
 *
 * The Mesh lives in the scene graph as a child of the FundoContainer
 * and is repositioned every frame to cover the visible viewport in
 * world coords.
 */

interface FundoContainer extends Container {
  _mesh: Mesh<Geometry, Shader>;
  _uniforms: UniformGroup;
  _tempoAcumMs: number;
}

/**
 * Approximate bytes held by the starfield renderer — trivially tiny
 * now that the canvas tile cache is gone.
 */
export function getStarfieldMemoryBytes(_fundo: Container): number {
  return 10 * 1024;
}

// No longer needed — kept as a no-op so main.ts doesn't break while
// the app-ref wiring gets cleaned up over follow-up commits.
export function setAppReferenceForFundo(_app: unknown): void {
  /* intentional no-op */
}

// ─── Shared GPU resources ─────────────────────────────────────────

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

function criarStarfieldMesh(): { mesh: Mesh<Geometry, Shader>; uniforms: UniformGroup } {
  const uniforms = criarUniforms();
  const shader = new Shader({
    gpuProgram: sharedGpuProgram,
    glProgram: sharedGlProgram,
    resources: { starUniforms: uniforms },
  });
  const state = State.for2d();
  state.blend = false;
  const mesh = new Mesh({ geometry: sharedQuadGeometry, shader, state });
  mesh.eventMode = 'none';
  return { mesh, uniforms };
}

/**
 * Force the starfield shader program to compile + link NOW.
 */
export async function precompilarShaderStarfield(
  app: { renderer: { render: (opts: { container: Container; target: any }) => void } },
): Promise<void> {
  let mesh: Mesh<Geometry, Shader> | null = null;
  let target: RenderTexture | null = null;
  try {
    const made = criarStarfieldMesh();
    mesh = made.mesh;
    target = RenderTexture.create({ width: 8, height: 8 });
    app.renderer.render({ container: mesh, target });
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  } catch (err) {
    console.warn('[fundo] starfield shader warmup failed (non-fatal):', err);
  } finally {
    try { mesh?.destroy(); } catch { /* noop */ }
    try { target?.destroy(true); } catch { /* noop */ }
  }
}

export function criarFundo(_tamanhoMundo: number): FundoContainer {
  const container = new Container() as FundoContainer;
  const { mesh, uniforms } = criarStarfieldMesh();
  container.addChild(mesh);
  container._mesh = mesh;
  container._uniforms = uniforms;
  container._tempoAcumMs = 0;
  return container;
}

/**
 * Repositions the fullscreen starfield quad to cover the current
 * viewport in world coords and pushes camera + time uniforms to the
 * shader.
 *
 * @param fundo   Container retornado por criarFundo()
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
  mesh.x = jogadorX - telaW / 2;
  mesh.y = jogadorY - telaH / 2;
  mesh.scale.set(telaW, telaH);

  fundo._tempoAcumMs += 16.67;
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
}
