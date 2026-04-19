import { describe, it, expect, beforeEach } from 'vitest';

// Node test env has no localStorage; config.ts touches it during persist.
const fakeStorage: Record<string, string> = {};
(global as any).localStorage = (global as any).localStorage ?? {
  getItem: (k: string) => fakeStorage[k] ?? null,
  setItem: (k: string, v: string) => { fakeStorage[k] = v; },
  removeItem: (k: string) => { delete fakeStorage[k]; },
  clear: () => { for (const k of Object.keys(fakeStorage)) delete fakeStorage[k]; },
};

import { computeUiMode } from '../ui-mode';
import { resetConfigForTest, setConfigDuranteBoot } from '../config';

function make(coarse: boolean, innerWidth: number, portrait: boolean) {
  return {
    coarsePointer: coarse,
    innerWidth,
    portrait,
  };
}

describe('computeUiMode', () => {
  beforeEach(() => resetConfigForTest());

  it('desktop mouse, auto → no touch, lg, landscape', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'auto' } });
    const m = computeUiMode(make(false, 1920, false));
    expect(m.touch).toBe(false);
    expect(m.size).toBe('lg');
    expect(m.orientation).toBe('landscape');
  });

  it('phone portrait, auto → touch, sm, portrait', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'auto' } });
    const m = computeUiMode(make(true, 390, true));
    expect(m.touch).toBe(true);
    expect(m.size).toBe('sm');
    expect(m.orientation).toBe('portrait');
  });

  it('tablet landscape 1000 coarse, auto → touch, md, landscape', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'auto' } });
    const m = computeUiMode(make(true, 1000, false));
    expect(m.touch).toBe(true);
    expect(m.size).toBe('md');
  });

  it('big desktop + coarse pointer, auto → no touch (width > 1024)', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'auto' } });
    const m = computeUiMode(make(true, 1600, false));
    expect(m.touch).toBe(false);
  });

  it('touchMode=on forces touch regardless of size/pointer', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'on' } });
    const m = computeUiMode(make(false, 1920, false));
    expect(m.touch).toBe(true);
  });

  it('touchMode=off forces no-touch even on phone', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'off' } });
    const m = computeUiMode(make(true, 390, true));
    expect(m.touch).toBe(false);
  });

  it('size breakpoints: <600 sm, <1024 md, else lg', () => {
    setConfigDuranteBoot({ ui: { touchMode: 'off' } });
    expect(computeUiMode(make(false, 599, false)).size).toBe('sm');
    expect(computeUiMode(make(false, 600, false)).size).toBe('md');
    expect(computeUiMode(make(false, 1023, false)).size).toBe('md');
    expect(computeUiMode(make(false, 1024, false)).size).toBe('lg');
  });
});
