import type { OrbitalConfig } from './config';
import { getConfig, setConfig } from './config';

type Nivel = OrbitalConfig['graphics']['qualidadeEfeitos'];

type FlagsDerivadas = Pick<
  OrbitalConfig['graphics'],
  'fogThrottle' | 'maxFantasmas' | 'densidadeStarfield' | 'shaderLive' | 'mostrarOrbitas'
  | 'renderScale' | 'starfieldLayers' | 'planetMaxOctaves'
>;

// Render scale is the single biggest perf knob (pixel count scales
// quadratically with the multiplier). Tying it to the preset means
// a user flipping 'minimo' on a weak machine actually feels the
// difference instead of getting fogThrottle-only savings.
const PRESETS: Record<Nivel, FlagsDerivadas> = {
  alto: {
    fogThrottle: 1,
    maxFantasmas: -1,
    densidadeStarfield: 1.0,
    shaderLive: true,
    mostrarOrbitas: true,
    renderScale: 1.0,
    starfieldLayers: 3,
    planetMaxOctaves: 6,
  },
  medio: {
    fogThrottle: 2,
    maxFantasmas: 30,
    densidadeStarfield: 0.7,
    shaderLive: true,
    mostrarOrbitas: true,
    renderScale: 0.85,
    starfieldLayers: 3,
    planetMaxOctaves: 5,
  },
  baixo: {
    fogThrottle: 3,
    maxFantasmas: 15,
    densidadeStarfield: 0.4,
    // Keep the procedural shader live even on low preset — baking
    // freezes the planet to a static snapshot which reads as broken;
    // only the truly-minimum preset trades live shading for perf.
    shaderLive: true,
    mostrarOrbitas: true,
    renderScale: 0.65,
    starfieldLayers: 2,
    planetMaxOctaves: 3,
  },
  // Minimum preset doubles as the software-renderer safety net.
  // Values are picked so Microsoft WARP, SwiftShader, LLVMpipe, or
  // Canvas2D mode all reach viable framerates without needing any
  // extra renderer-specific overrides — applying this preset alone
  // is enough.
  minimo: {
    fogThrottle: 15,
    maxFantasmas: 0,
    densidadeStarfield: 0.1,
    shaderLive: false,
    mostrarOrbitas: false,
    renderScale: 0.2,
    starfieldLayers: 1,
    planetMaxOctaves: 2,
  },
};

export function aplicarPreset(nivel: Nivel): void {
  const preset = PRESETS[nivel];
  const cfg = getConfig();
  setConfig({
    graphics: {
      ...cfg.graphics,
      ...preset,
      qualidadeEfeitos: nivel,
    },
  });
}

export function presetBateComFlagsDerivadas(cfg: OrbitalConfig): boolean {
  const esperado = PRESETS[cfg.graphics.qualidadeEfeitos];
  for (const k of Object.keys(esperado) as Array<keyof FlagsDerivadas>) {
    if (cfg.graphics[k] !== esperado[k]) return false;
  }
  return true;
}
