export interface OrbitalConfig {
  autosaveIntervalMs: number;
  saveMode: 'periodic' | 'experimental';
}

const DEFAULTS: OrbitalConfig = {
  autosaveIntervalMs: 60000,
  saveMode: 'periodic',
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
