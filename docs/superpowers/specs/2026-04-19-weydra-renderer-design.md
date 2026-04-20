# weydra-renderer — Design Spec

**Status:** draft · **Data:** 2026-04-19 · **Autor:** caua + Claude

## Resumo

Renderer gráfico 2D próprio em Rust + wgpu, substituindo Pixi.js no jogo Orbital. Primeiro projeto do namespace `weydra` (empresa). Arquitetura pensada pra evoluir de "renderer de Orbital" → "engine 2D reusável" → "engine completa com audio/physics/input" sem precisar refactor.

O jogo é renderizado hoje em Pixi v8 (WebGL2 / WebGPU / Canvas2D fallback). O alvo do weydra-renderer é **bater o Pixi em frame time no mobile low-end** (PowerVR BXM-8-256 reportado, Adreno/Mali faixa média) mantendo visual idêntico ao atual.

## Objetivos

1. Renderer 2D próprio controlado 100% por nós (sem dependência de Pixi)
2. Performance igual ou melhor que Pixi em todos os devices que o Orbital atende
3. Multi-plataforma via wgpu: WebGPU, WebGL2, Vulkan, Metal, DX12, GLES 3.0
4. API TypeScript com type-safety, ergonomia decente, overhead praticamente zero no hot path
5. Migração incremental — jogo **nunca quebra** durante os ~5-6 meses de dev
6. Base reusável pra futuros jogos do ecossistema weydra

## Não-objetivos

- Não é uma reimplementação do Pixi — não vamos replicar API dele
- Não suporta OpenGL ES 2.0, OpenGL 1.x, ou rasterização software custom (Canvas2D do Orbital fica intacto como fallback último)
- Não é motor 3D
- Não é engine com ECS/audio/physics/editor **na fase inicial** (escopo pode evoluir pra isso)
- Consoles (Switch/PS/Xbox) não estão no escopo atual

## Escopo por fase

- **Fase A (atual → ~6 meses):** renderer funcionando no Orbital. Substitui Pixi completamente. Escopo focado — só o que Orbital precisa.
- **Fase B (futura):** engine 2D reusável. API abstrai Orbital-specifics. Consumível por outros jogos.
- **Fase C (distante):** engine completa com audio/physics/input/asset pipeline. Fora do spec atual.

Design decisions do spec atual **não travam** evolução pra B ou C — princípio de fronteiras limpas do primeiro dia.

## Contexto: auditoria do Pixi atual

Auditoria completa gerada durante brainstorming (in-conversation, 2026-04-19). Resumo consolidado:

- **28 arquivos, 486 referências** a classes Pixi no código fonte
- Classes realmente usadas: Application, Container, Sprite, Graphics, Mesh, Shader, GlProgram/GpuProgram, UniformGroup, Geometry, Buffer, Texture, RenderTexture, TilingSprite, Text, AnimatedSprite, Rectangle, Assets, Ticker, ImageSource
- 2 shaders customizados (planeta.wgsl + GLSL, starfield.wgsl + GLSL)
- Graphics API: ~12 métodos (circle, rect, roundRect, moveTo, lineTo, arc, fill, stroke, clear)
- 2 blend modes: normal + add
- 2 scale modes: nearest (quase tudo) + linear (só fog)
- Hit-testing: majoritariamente custom via DOM addEventListener, MAS Pixi eventMode é usado mais do que parece — **5 objetos com `eventMode='static'`** em `minimapa.ts`, `tutorial.ts`, `painel.ts`, `selecao.ts`, e **~11 handlers `.on('pointer...')`** ativos (selection cards com hover+press, action buttons nos painéis, close button do tutorial, click-to-navigate no minimap). Migração precisa re-wire esses no M7-M9, não só M9
- **Não usa:** Filter (zero instâncias), BitmapFont, mask, cacheAsTexture, post-processing
- RenderTexture usado só pra shader warmup (não crítico)
- Text: 3 usos com fonte de sistema (monospace)

## Arquitetura

### Layout do repo

```
orbital-fork/
├── src/                              ← jogo TS (importa do ts-bridge)
├── weydra-renderer/                  ← raiz do projeto renderer
│   ├── Cargo.toml                    ← workspace root
│   ├── core/                         ← crate: weydra-renderer
│   │   ├── Cargo.toml                ← deps: wgpu, bytemuck, glam, lyon, fontdue
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── device.rs             ← wgpu Instance/Adapter/Device/Queue
│   │   │   ├── surface.rs            ← abstração de surface
│   │   │   ├── scene.rs              ← scene graph, slotmap handles
│   │   │   ├── transform.rs          ← affine 2D
│   │   │   ├── texture.rs            ← texture manager + atlas
│   │   │   ├── sprite.rs             ← sprite batcher
│   │   │   ├── graphics.rs           ← vector primitives via lyon
│   │   │   ├── mesh.rs               ← custom shader meshes
│   │   │   ├── shader.rs             ← shader registry, WGSL compilation
│   │   │   ├── text.rs               ← bitmap font (fontdue)
│   │   │   ├── frame.rs              ← frame orchestration
│   │   │   └── pools/                ← per-shader-type uniform pools
│   │   ├── shaders/                  ← WGSL compartilhados
│   │   └── tests/
│   ├── adapters/
│   │   ├── wasm/                     ← crate: weydra-renderer-wasm
│   │   │   ├── Cargo.toml            ← deps: core + wasm-bindgen + web-sys
│   │   │   └── src/lib.rs
│   │   └── winit/                    ← crate: weydra-renderer-winit (fase B)
│   ├── examples/                     ← demos standalone
│   │   ├── hello-clear/
│   │   ├── sprite-batcher/
│   │   └── full-demo/
│   └── ts-bridge/                    ← API TS consumível pelo Orbital
│       ├── index.ts
│       ├── sprite.ts
│       ├── graphics.ts
│       ├── mesh.ts
│       └── shaders/                  ← wrappers tipados por shader
│           ├── planet.ts
│           └── starfield.ts
└── ... resto do jogo
```

Princípio da separação core / adapters:

- `core/` **não conhece browser, TS, WASM**. Só wgpu + Rust puro. Roda em qualquer target que wgpu suporte.
- `adapters/xxx/` cada um é crate fina que traduz entre runtime-alvo e core. Adicionar target novo = nova pasta em `adapters/`, zero mudança no core.
- `ts-bridge/` mora dentro do weydra-renderer porque é parte da interface pública. Outros projetos que consumirem weydra também querem essas bindings.

### Stack técnica

- **Linguagem:** Rust (stable, nightly apenas se absolutamente necessário)
- **GPU:** wgpu v25+ (crate oficial WebGPU)
- **Browser binding:** wasm-bindgen + wasm-pack
- **Vector tessellation:** lyon crate
- **Text rasterization:** fontdue crate (bitmap font)
- **Serialization:** bytemuck pra `#[repr(C)]` → bytes
- **Math:** glam crate (vec/mat 2D otimizado)
- **Build:** Cargo workspaces + wasm-pack build
- **Test:** cargo test (native) + wasm-pack test (browser)

### Backends suportados

Via wgpu, herdados automaticamente:

| Alvo | Backend | Fase |
|---|---|---|
| Chrome/Edge desktop | WebGPU | A |
| Chrome Android | WebGPU | A |
| Safari desktop 17+ | WebGPU | A |
| Firefox desktop | WebGL2 | A |
| Safari iOS 17+ | WebGL2 | A |
| Mobile low-end (PowerVR/Adreno/Mali) | WebGL2 | A |
| Hardware sem GPU (WARP/SwiftShader) | Canvas2D fallback (fora do weydra, path TS existente) | A |
| Windows desktop native | DX12 / Vulkan | B |
| Linux desktop native | Vulkan | B |
| macOS/iOS native | Metal | B |
| Android native | Vulkan | B |
| Steam Deck | Vulkan | B |

**Consoles (Switch/PS/Xbox)**: fora de escopo atual. Se e quando virar objetivo, avaliamos SDK específico da época. Não desenhamos o renderer em função deles agora.

Backends **explicitamente não-alvo:**

- GLES 2.0 (sem instancing, shaders incompatíveis, <1% audiência)
- OpenGL 1.x (fixed function, impossível manter visual atual)
- Software raster custom via WASM (pior que Canvas2D nativo do browser)

## Estratégia de binding TS ↔ Rust

Abordagem: **wasm-bindgen + escape hatches de shared memory** (opção 6 da análise).

### Classificação de operações

| Tipo | Frequência | Mecanismo |
|---|---|---|
| Setup (create/destroy/upload) | Rara | wasm-bindgen direto, ergonômico |
| Hot path (position/color/visibility updates) | 1000s/frame | Escrita direta em `Float32Array`/`Uint32Array` views sobre WASM memory |
| Frame end | 1×/frame | `renderer.render()` via wasm-bindgen |

### Exposição de memória compartilhada

Rust aloca pools SoA (Structure-of-Arrays) em WASM linear memory. Exporta pointer + capacidade via wasm-bindgen. TS cria typed array views sobre os mesmos bytes.

```rust
#[wasm_bindgen]
impl Renderer {
    pub async fn new(canvas: HtmlCanvasElement) -> Renderer { /* ... */ }
    pub fn upload_texture(&mut self, bytes: &[u8], w: u32, h: u32) -> u32 { /* ... */ }
    pub fn create_sprite(&mut self, texture: u32) -> u64 { /* ... */ }
    pub fn destroy(&mut self, handle: u64) { /* ... */ }

    // Escape hatches pra hot path. wasm-bindgen NÃO aceita retorno de
    // `*const T` direto — expomos como u32/usize e reconstituímos a
    // view no TS via `wasm.memory.buffer + offset`.
    pub fn transforms_ptr(&self) -> u32 { self.transforms.as_ptr() as u32 }
    pub fn colors_ptr(&self) -> u32 { self.colors.as_ptr() as u32 }
    pub fn flags_ptr(&self) -> u32 { self.flags.as_ptr() as u32 }
    pub fn capacity(&self) -> u32 { /* ... */ }
    pub fn mem_version(&self) -> u32 { self.mem_version }  // incrementa se memory growth

    pub fn render(&mut self) { /* ... */ }
}
```

```ts
// ts-bridge wrapper — API ergonômica com writes diretos
class Sprite {
  set x(v: number) { renderer.views.transforms[this.handle * 4 + 0] = v; }
  set y(v: number) { renderer.views.transforms[this.handle * 4 + 1] = v; }
  // ...
}
```

### Custo medido vs alternativas

| Abordagem | Boundary crossings/frame | Custo estimado |
|---|---|---|
| wasm-bindgen per-call | ~1200 | 1-3ms |
| Raw extern "C" | ~1200 | 0.1-0.3ms |
| Shared memory manual | 1 | <0.05ms |
| **wasm-bindgen + shared memory (escolhido)** | **1** | **<0.05ms** |

### Capacidade pré-alocada + revalidação obrigatória

Pré-alocar capacidade ajuda mas **não é suficiente**. `WebAssembly.Memory` pode crescer por motivos fora do nosso controle:

- Upload de textura grande (staging buffer temporário no Rust)
- Lyon tessellation criando buffers novos durante `render()`
- Alocações transientes de wasm-bindgen glue (strings de erro, debugging)

Qualquer growth detacha o `ArrayBuffer` subjacente e invalida SILENCIOSAMENTE todos os typed array views — reads retornam 0, writes são no-op. Bug terrível de debugar.

**Mecanismo obrigatório:**

```rust
// core: mantém um version counter que incrementa após qualquer
// operação que pode ter causado memory growth
pub struct Renderer {
    mem_version: u32,
    // ...
}

// Método exposto ao TS
pub fn mem_version(&self) -> u32 { self.mem_version }
```

```ts
// ts-bridge: checa versão a cada operação que pode ter crescido memory
class Renderer {
  private views: { transforms: Float32Array, /* ... */ };
  private lastMemVersion: number = 0;

  private revalidate() {
    const v = this.wasm.mem_version();
    if (v !== this.lastMemVersion) {
      this.views.transforms = new Float32Array(
        this.wasm.memory.buffer,
        this.wasm.transforms_ptr(),
        this.wasm.capacity() * 4
      );
      // ... recriar TODOS os views
      this.lastMemVersion = v;
    }
  }

  uploadTexture(bytes: Uint8Array) {
    const id = this.wasm.upload_texture(bytes, ...);
    this.revalidate();  // upload pode ter causado growth
    return id;
  }

  render() {
    this.wasm.render();
    this.revalidate();  // render pode ter causado growth (lyon tessellation)
  }

  // Hot path: SEM revalidate, porque setters não alocam
  setPosition(h, x, y) {
    this.views.transforms[h * 4] = x;
    this.views.transforms[h * 4 + 1] = y;
  }
}
```

Revalidação vale só ~50ns (comparação de inteiro + reconstrução condicional de Float32Arrays). No hot path, pula. Em setup ops, chama sempre.

Capacidade inicial: 10.000 sprites, 500 meshes, 10.000 graphics nodes (~460KB). Generoso o suficiente pra raramente crescer.

## Scene graph + modelo de dados

### SlotMap com generational indices

Handles opacos (u64 = slot + generation). Remove + create no mesmo slot invalida handles antigos em vez de corromper.

### Entidades do core

**1. Sprite** — textured quad. Grosso do rendering (naves, planetas baked, UI icons).

**2. Graphics** — retained mode vector (círculos, linhas, arcos, retângulos). Tessellation via lyon, cached em vertex buffer. Dirty flag só re-tessela se mudou.

**3. Mesh** — shader customizado (planeta, starfield, futuros). Uniforms em pool SoA compartilhado.

### Memory layout (SoA)

```
Pool Transform  [N × 4 f32]   = N × 16 bytes    ← pointer exposto
Pool Color      [N × 1 u32]   = N × 4 bytes     ← pointer exposto
Pool Alpha      [N × 1 f32]   = N × 4 bytes     ← pointer exposto
Pool Flags      [N × 1 u8]    = N × 1 byte      ← pointer exposto
Pool Z-order    [N × 1 f32]   = N × 4 bytes     ← pointer exposto
Pool Texture    [N × 1 u32]   = N × 4 bytes     ← pointer exposto

Uniforms per-shader-type (um pool por tipo de shader):
  PlanetUniforms  [M × sizeof(PlanetUniforms)]   ← pointer exposto
  StarfieldUniforms [1 × sizeof(StarfieldUniforms)] ← pointer exposto
```

### Batching

`render()` percorre pools, filtra invisible, ordena por (z_order, texture_id, shader_id), agrupa em draw calls batched por (texture + shader + blend). Target: 5-15 draw calls por frame em cena típica do Orbital.

Instancing (draw múltiplos planetas com 1 call) fica pra quando virar gargalo provado — não upfront.

## Shader system

### Princípio

WGSL é a única linguagem que escrevemos. wgpu traduz pra SPIR-V (Vulkan), MSL (Metal), HLSL (DX12), GLSL (WebGL2), WGSL nativo (WebGPU).

### Per-shader-type homogeneous pool

Cada tipo de shader (planet, starfield, etc.) tem seu próprio pool com `#[repr(C)]` struct tipada:

```rust
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
pub struct PlanetUniforms {
    pub u_time: f32,
    pub u_seed: f32,
    // ... campos alinhados a 16 bytes
}

pub struct PlanetPool {
    instances: Vec<PlanetUniforms>,
    gpu_buffer: wgpu::Buffer,
    slotmap: SlotMap<usize>,
}
```

Vantagens:
- Layout homogêneo → bind group único por pool
- Type safety total (struct Rust é fonte de verdade)
- Update buffer é `queue.write_buffer(&gpu_buffer, 0, bytemuck::cast_slice(&instances))`
- Naturalmente instanceable quando necessário

### TS wrappers — escritos à mão

Por shader, um `.ts` com getters/setters tipados:

```ts
export class PlanetInstance {
  constructor(public handle: bigint, private r: Renderer) {
    this.base = Number(handle) * (r.planetUniformsStride / 4);
  }
  set uTime(v: number) { this.r.views.planetUniformsF32[this.base + 0] = v; }
  set uSeed(v: number) { this.r.views.planetUniformsF32[this.base + 1] = v; }
  // ...
}
```

2 shaders × ~15 fields = ~30 setters escritos à mão total. Se chegarmos a 20+ shaders, consideramos codegen via naga reflection.

### Shaders existentes: port direto

`planeta.wgsl` e `starfield.wgsl` já são WGSL. Port = renomear bindings pra novo bind group layout. Zero mudança de lógica. Estimativa: 1 dia pra ambos.

### Fallback WebGL2

wgpu traduz WGSL → GLSL 3.00 ES via `naga` crate. Features básicas (uniforms, textures, sampling) mapeiam limpo.

**Gaps conhecidos** que podem exigir ajuste shader-side:
- `textureNumLevels` não existe em GLSL 3.00 ES — hoje não usamos
- `textureDimensions` em recursos não-uniformes — hoje não usamos
- Dynamic array indexing em loops pode gerar GLSL inválido em alguns casos
- Arrays de cores indexados dinamicamente — `planeta.wgsl` usa `uColors0..uColors5` via switch, deve funcionar mas validar

M2 (starfield) e M5 (planet) são os testes reais do path WebGL2. Se algum shader exigir tweaks pro backend GL, reserva +2-3 dias adicionais no milestone afetado.

## Estratégia de migração

### Coexistência: dois canvases stacked

```html
<canvas id="weydra-canvas" style="z-index: 0; position: fixed; ...">
<canvas id="pixi-canvas"   style="z-index: 1; background: transparent; ...">
```

- Canvas Pixi com background transparente, Canvas weydra em baixo
- Camera x/y/zoom sincronizada entre os dois (mesmo source of truth no TS)
- Input (pointerdown etc.) continua no Pixi canvas
- Conforme sistemas migram, Pixi equivalents viram no-op
- No M10 (fim), Pixi canvas é removido

**Limitação aceita:** z-order entre objetos em canvases diferentes é fixo. Mitigado por migrar rigidamente bottom-up (starfield → ships → planets → graphics → UI).

**Estados intermediários com z-order visualmente errado:** Orbital tem camadas interleaved que NÃO seguem split bottom/top limpo:
- Orbit Graphics rings (atrás de planetas, acima de starfield)
- Ship engine trails (atrás de naves, acima de planet rings)
- Fog overlay (acima de tudo exceto UI)

Durante a migração, períodos onde (exemplo) ship trails estão no weydra canvas (baixo) mas orbit rings ainda estão em Pixi (cima) vão renderizar em ordem **visualmente errada**. Não é bug — é consequência do approach incremental.

**Mitigação:**
- Intermediate states são aceitáveis em branch de dev
- Antes de mergear milestone pra main, ou o z-order fica correto, ou o flag fica default-off e o sistema só ativa em dev builds até o próximo milestone corrigir
- Alternativa: mergear 2-3 milestones adjacentes juntos quando o z-order exigir (ex: M4+M5 planets + M7 graphics rings merged juntos como "planet layer complete")

### Milestones

| # | Sistema | Duração | Critério de merge |
|---|---|---|---|
| M1 | Foundation (setup, clear screen, frame loop) | 1 sem | Canvas pinta preto, `render()` a 60fps |
| M2 | Starfield (2 shaders + tiling sprite) | 1 sem | Starfield visual idêntico via weydra |
| M3 | Ships (sprites + trails) | 2 sem | Todas as naves via weydra |
| M4 | Planets baked mode | 2 sem | Planetas pequenos via weydra |
| M5 | Planets live shader mode | 2 sem | Planet shader FBM idêntico |
| M6 | Fog-of-war | 1 sem | Fog overlay via weydra |
| M7 | Graphics primitives (orbits/routes/beams/trails) | **3 sem** | Todos os Graphics via weydra |
| M8 | Text labels | **3-4 sem** | Labels via weydra |
| M9 | UI (minimap/tutorial/panels) | 2 sem | Overlays UI via weydra |
| M10 | Pixi removal | 1 sem | `pixi.js` fora do package.json |

**Total corrigido:** 17-19 semanas (reviewer apontou sub-estimativa em M7 + M8). Realistic com fricção: **6-7 meses**.

Detalhes:
- **M7 subiu pra 3 semanas:** 12 primitive methods, integração lyon, retained mode com dirty tracking, tessellation cache. Plus re-wire dos pointer events do minimap/selecao (reviewer apontou ~11 handlers pixi que não tinham sido contados).
- **M8 subiu pra 3-4 semanas:** integração fontdue não é trivial — font file selection, bundling, rasterização multi-size, glyph atlas, layout. Orbital usa text com conteúdo dinâmico (nomes de planeta, timestamps) que impede pre-baking completo do atlas.

### Feature flags por sistema

```ts
interface WeydraFlags {
  starfield: boolean;    // M2
  ships: boolean;        // M3
  planetsBaked: boolean; // M4
  planetsLive: boolean;  // M5
  fog: boolean;          // M6
  graphics: boolean;     // M7
  text: boolean;         // M8
  ui: boolean;           // M9
}
```

Todas default `false`. Cada milestone liga a sua quando pronto. **Rollback instantâneo por sistema** desabilitando flag. No M10, flags e código Pixi são removidos.

## Testing + validation

### Níveis de teste

1. **Unit tests Rust** (sem GPU) — transform math, SlotMap, tessellation correctness
2. **Integration tests com GPU native** — `cargo test` em CI com Vulkan/Metal/DX12 headless
3. **Integration tests WASM** — `wasm-pack test --headless` em Chrome + Firefox
4. **Visual parity tests** — Playwright + pixelmatch, cenas baseline, tolerance ≤1% de pixels com Δ≥3 RGB
5. **Performance benchmarks** — cena estressante (300 naves + 50 planetas) comparando Pixi vs weydra via profiling logger existente
6. **Browser compatibility matrix** — manual em Chrome desktop/Android, Safari desktop/iOS, Firefox, devices low-end PowerVR

### Red flags que travam merge

- Visual: planeta com gradient errado, ship com posição flutuante, fog com borda dura
- Perf: frame time p95 regrediu >5% vs Pixi
- Crash: wgpu emite validation error em qualquer backend
- Platform: quebra em Safari iOS ou PowerVR mobile

### Dev loop

```
Edit Rust → wasm-pack build --dev (3-8s) → Vite HMR → enable flag → test
```

Ciclo <30s entre edit e validação visual.

### Riscos identificados

- **Shader determinism:** planeta usa PCG hash bit-exact. wgpu traduz WGSL pros backends, pode haver 1-bit drift entre MSL/HLSL/GLSL. Plano: teste de hash do framebuffer em cena de referência.
- **Tessellation lyon:** pode gerar polygon count diferente do Pixi. Plano: teste de parity pixel-a-pixel em cena com só Graphics.
- **WebGL2 feature coverage:** wgpu não suporta tudo WGSL em WebGL2. Validar cedo — M2 já exerce shader complexo.
- **Input no canvas inferior:** durante migração, se algum sistema precisar de hit-test no weydra canvas, precisamos de `pointer-events: auto` condicional. Plano: postergar pro M9 onde UI migra.
- **CI visual parity em backends diferentes:** em CI headless, wgpu via WebGPU pode cair pra WARP/SwiftShader (software), enquanto Pixi roda em WebGL via ANGLE. Comparar pixel-a-pixel entre dois backends diferentes é enganoso. Plano: **rodar visual parity tests com BOTH renderers forçados no mesmo backend** (ex: ambos em WebGL via headless Chrome com `--disable-webgpu`), ou usar CI com GPU real (GitHub Actions `ubuntu-latest-large` com NVIDIA passthrough) pra WebGPU de verdade.
- **WASM binary parse time em mobile low-end:** wgpu compila grande. Release + wasm-opt -O4 realistas: 1.5-3 MB de .wasm. Parse + instantiation em mobile low-end (PowerVR BXM-8-256 reportado pelo user) pode custar 200-500ms no boot. Medir em M1, e se for problemático, explorar code-splitting ou lazy init.

## Riscos gerais e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Projeto pausa no meio da migração | Média | Baixo | Rollback por flag, Pixi continua funcional até M10 |
| M5 (planet shader) demora 2× estimado | Alta | Médio | Buffer de tempo no schedule; migração incremental não trava outros M |
| Performance não supera Pixi em mobile | Baixa | Alto | Benchmarks desde M2; abort se regression confirmada |
| wgpu bug de driver em browser-específico | Média | Médio | Fallback path Pixi via flag; report upstream |
| Scope creep (B ou C antes da hora) | Alta | Médio | Spec explícita: só expandir após M10 estável 1 mês |
| Bundle WASM tamanho (1.5-3 MB) | Baixa (size) / Média (parse time mobile) | Baixo (size) / Médio (parse) | wasm-opt -O4; medir parse time em M1 em PowerVR; code-split se necessário |
| Safari iOS diferente de Safari desktop | Média | Médio | Teste manual iOS por milestone |
| CI visual parity via backends diferentes | Média | Médio | Forçar mesmo backend pra ambos renderers em CI; ou GPU real via GitHub Actions self-hosted |
| Z-order errado em estados intermediários durante migração | Alta | Baixo | Flags default-off em estados com z-quebrado; merge de milestones adjacentes quando necessário |
| Sub-estimativa de M7 (Graphics) e M8 (Text) | Média | Médio | Já corrigido pra 3 e 3-4 semanas; spec ajustado pós code-review |
| Ship hit-test via Pixi event system (5 objetos, 11 handlers) quebrando no M7-M9 | Média | Médio | Re-wire pra DOM events começa antes do M9; tasks específicas no plano do M7 |

## Open questions (pra resolver antes de começar M1)

- [ ] `wasm-pack` ou `wasm-bindgen-cli` + `cargo build` manual? Ambos funcionam, wasm-pack é mais opinativo
- [ ] Integração Vite: `vite-plugin-wasm` + `vite-plugin-top-level-await` ou wasm-pack target=web com import direto?
- [ ] Como expor o pointer `*const T` via wasm-bindgen? Precisa feature específica ou workaround com `*const f32 as usize`
- [ ] Gerenciamento de texturas: atlas único gigante, ou atlas por tipo (ships, UI, backgrounds)?
- [ ] Formato dos sprites no spritesheet: manter PNGs atuais (ships.png) ou re-packer num atlas weydra-específico?

## Próximos passos

Com esse spec aprovado, próxima etapa é invocar `writing-plans` skill pra detalhar o plano de implementação de **M1 (Foundation)** — arquivos exatos, dependências, ordem de escrita, critérios de done. Implementação começa depois do plano validado.

## Referências

- wgpu docs: https://wgpu.rs/
- WebAssembly Boundary Tax (OpenUI case): https://aitoolly.com/ai-news/article/2026-03-21-why-openui-rewrote-their-rust-wasm-parser-in-typescript-to-achieve-a-3x-speed-increase
- wasm-bindgen: https://github.com/rustwasm/wasm-bindgen
- lyon tessellation: https://docs.rs/lyon/
- fontdue: https://docs.rs/fontdue/
- Pixi audit: seção **Contexto** deste spec (consolidado in-line)
