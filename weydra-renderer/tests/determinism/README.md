# Weydra ↔ Pixi planet shader determinism gate

Headless harness that renders the same fixed-seed reference planet under
the legacy Pixi GLSL path and the weydra WGSL live-shader path, hashes
both framebuffers, and reports whether the outputs match.

## Purpose

Catch regressions in the WGSL planet shader's PCG / FBM / cloud / dither
math when porting from the original GLSL implementation. The test does
**not** assert absolute pixel equivalence between WebGL2 and wgpu — that
is rarely achievable across different shader compilers (naga vs. ANGLE
vs. native drivers). Instead it serves as a tripwire: if a shader edit
makes the WGSL output drift further from the GLSL reference, the runner
flags it.

## How to run

In two terminals (the runner needs the Vite dev server up):

```
# Terminal 1
bun run dev

# Terminal 2
bun run test:determinism
```

The runner installs nothing on its own. If Playwright is missing it
exits with instructions:

```
bun add -d playwright
# or
npm i -D playwright
```

## Reference scene

| Field           | Value                                                |
|-----------------|------------------------------------------------------|
| Viewport        | 800 × 800 (deviceScaleFactor 1)                      |
| Planet position | world (0, 0) → screen centre                         |
| Planet size     | 400 px                                               |
| Planet type     | `TIPO_PLANETA.COMUM` (planetType = 0, terran)        |
| Planet seed     | 3.14                                                 |
| Palette RNG     | mulberry32 seeded with 0xC0FFEE                      |
| Camera          | (0, 0), zoom 1, time 0                               |
| `uTime`         | 0 (ticker is stopped after one render)               |
| `uRotation`     | 0                                                    |
| Backend         | weydra `auto` (prefers WebGPU; falls back to WebGL2) |

The harness pins every `getConfig().graphics.*` and `getConfig().weydra.*`
field that influences planet rendering — only the planet path of interest
is enabled, every other weydra subsystem is off.

Activation URLs:

- `…/orbital-fork/?weydra_determinism_test=1&engine=pixi`
- `…/orbital-fork/?weydra_determinism_test=1&engine=weydra`

The `engine=pixi` URL forces `weydra.planetsLive = false` so the planet
is created via the Pixi `Mesh` + GLSL `criarShaderPlaneta` path. The
`engine=weydra` URL forces `weydra.planetsLive = true` so
`criarPlanetaProceduralSprite` allocates a `PlanetInstance` from the
weydra pool and draws via the WGSL shader.

## Pass / fail criteria

In order of strictness:

1. **BIT-EXACT** — SHA-256 of the two PNG screenshots is identical.
2. **PNG-byte equal** — same byte length and 0 differing bytes (still
   strong evidence of pixel equivalence; PNGs of identical pixels can
   differ at the byte level due to deflate non-determinism, so this is
   a tighter-than-hash check).
3. **Documented divergence** — hashes diverge. Runner exits 0 and prints
   both screenshot paths so a human can inspect, or so a future
   `pngjs` + `pixelmatch` step can apply the spec's `<1%` of pixels
   differing by `>3` RGB units tolerance.

The runner currently does **not** fail CI on hash mismatch. M5 Status
documents the divergence; tightening the gate to a real pixel-diff with
the spec tolerance is a follow-up.

## Output artefacts

- `/tmp/determinism-pixi.png`
- `/tmp/determinism-weydra.png`

Open both in an image diff tool (Krita, Beyond Compare, `compare` from
ImageMagick) to spot regressions.

## Env overrides

- `ORBITAL_DEV_URL` — base URL of the Vite dev server. Default
  `http://localhost:5173/orbital-fork/`.

## Files

- `weydra-renderer/tests/determinism/runner.mjs` — Playwright runner.
- `src/world/determinism-scene.ts` — hidden boot path that builds the
  reference scene. Activated by the URL flag; otherwise never imported.
- `src/main.ts` — single early branch that short-circuits to the
  determinism harness when the flag is present.

## Known caveats

- **WebGL2 vs. wgpu compiler drift** — different shader stacks compile
  the same source to different SPIR-V / GLSL ASM. Even an identical
  algorithm can produce 1–2 LSB drift on isolated pixels.
- **Deflate non-determinism** — Chromium's PNG encoder may not produce
  byte-identical files for byte-identical pixel buffers across versions.
  The runner falls back from SHA-256 equality to byte-stream comparison;
  if both fail, screenshots are still saved for visual diff.
- **First-paint timing** — the harness stops the ticker after one render,
  but shader compile + first paint can take a few hundred ms. The runner
  uses a 10s readiness sentinel + 3s settle delay; raise `SETTLE_MS` in
  `runner.mjs` if you see flakiness on slow GPUs.
