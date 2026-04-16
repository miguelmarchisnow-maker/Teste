import { describe, it, expect, beforeEach } from 'vitest';

const fakeStorage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => fakeStorage[k] ?? null,
  setItem: (k: string, v: string) => { fakeStorage[k] = v; },
  removeItem: (k: string) => { delete fakeStorage[k]; },
  clear: () => { for (const k of Object.keys(fakeStorage)) delete fakeStorage[k]; },
};

import { getConfig, setConfig, resetConfigForTest } from '../../../core/config';

describe('config', () => {
  beforeEach(() => {
    (global.localStorage as any).clear();
    resetConfigForTest();
  });

  it('returns defaults when nothing stored', () => {
    const c = getConfig();
    expect(c.autosaveIntervalMs).toBe(60000);
    expect(c.saveMode).toBe('periodic');
  });

  it('persists partial updates', () => {
    setConfig({ autosaveIntervalMs: 30000 });
    expect(getConfig().autosaveIntervalMs).toBe(30000);
    expect(getConfig().saveMode).toBe('periodic');
  });

  it('survives reset+reload by reading from storage', () => {
    setConfig({ saveMode: 'experimental' });
    resetConfigForTest();
    expect(getConfig().saveMode).toBe('experimental');
  });
});
