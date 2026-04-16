export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface OrbitalConfig {
  autosaveIntervalMs: number;
  saveMode: 'periodic' | 'experimental';

  audio: {
    master: { volume: number; muted: boolean };
    sfx:    { volume: number; muted: boolean };
    ui:     { volume: number; muted: boolean };
    aviso:  { volume: number; muted: boolean };
  };

  graphics: {
    qualidadeEfeitos: 'alto' | 'medio' | 'baixo' | 'minimo';
    fullscreen: boolean;
    scanlines: boolean;
    mostrarFps: boolean;
    fpsCap: number;
    renderer: 'webgl' | 'webgpu';
    webglVersion: 'auto' | '1' | '2';
    gpuPreference: 'auto' | 'high-performance' | 'low-power';
    mostrarOrbitas: boolean;
    fogThrottle: number;
    maxFantasmas: number;
    densidadeStarfield: number;
    shaderLive: boolean;
  };

  gameplay: {
    confirmarDestrutivo: boolean;
    edgeScroll: boolean;
  };
}

const DEFAULTS: OrbitalConfig = {
  autosaveIntervalMs: 60000,
  saveMode: 'periodic',

  audio: {
    master: { volume: 0.8, muted: false },
    sfx:    { volume: 1.0, muted: false },
    ui:     { volume: 0.7, muted: false },
    aviso:  { volume: 1.0, muted: false },
  },

  graphics: {
    qualidadeEfeitos: 'alto',
    fullscreen: false,
    scanlines: true,
    mostrarFps: false,
    fpsCap: 0,
    renderer: 'webgl',
    webglVersion: 'auto',
    gpuPreference: 'auto',
    mostrarOrbitas: true,
    fogThrottle: 1,
    maxFantasmas: -1,
    densidadeStarfield: 1.0,
    shaderLive: true,
  },

  gameplay: {
    confirmarDestrutivo: true,
    edgeScroll: false,
  },
};

const STORAGE_KEY = 'orbital_config';

let _cache: OrbitalConfig | null = null;

function load(): OrbitalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getConfig(): OrbitalConfig {
  if (!_cache) _cache = load();
  return { ..._cache };
}

export function setConfig(partial: Partial<OrbitalConfig>): void {
  _cache = { ...getConfig(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
  } catch {
    /* quota exhausted */
  }
}

export function resetConfigForTest(): void {
  _cache = null;
}
