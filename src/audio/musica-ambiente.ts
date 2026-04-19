import { getMixer, getCategoriaNode } from './mixer';

/**
 * Procedural ambient music for Orbital Wydra.
 *
 * Each WORLD has its own musical theme — generated from a deterministic
 * seed. Same seed → same musical character (root note, scale, voice
 * mix, tempos). Different seeds → different feel.
 *
 * Variations driven by seed:
 *  - Root frequency (A1..D2 range)
 *  - Scale (pentatonic minor / dorian / phrygian / lydian)
 *  - Voice intensities (which oscillators are louder)
 *  - LFO speeds for cutoff, detune, tremolo
 *  - Detune amounts
 *
 * Public API:
 *   - iniciarMusicaAmbiente(seed?)  — start with optional world seed
 *   - pararMusicaAmbiente()         — stop and tear down
 *   - musicaAtiva()                 — boolean state
 *   - gerarSeedMusical()            — random uint32 for new worlds
 */

interface VoiceGroup {
  ctx: AudioContext;
  out: GainNode;          // local mix bus (connects to mixer.musica)
  nodes: AudioNode[];     // all oscillators + LFOs for cleanup
  startTime: number;
}

let _voices: VoiceGroup | null = null;

// ─── Seeded RNG (mulberry32) ─────────────────────────────────────────────
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gerarSeedMusical(): number {
  return Math.floor(Math.random() * 0xFFFFFFFF);
}

// Different scales — each with different mood
const SCALES: Record<string, number[]> = {
  pentaMinor:  [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5],          // A C D E G — melancólico
  dorian:      [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3],   // dorian — esperançoso
  phrygian:    [1, 16 / 15, 6 / 5, 4 / 3, 3 / 2, 8 / 5], // phrygian — sombrio
  lydian:      [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 27 / 16], // lydian — mágico
};

const SCALE_NAMES = Object.keys(SCALES);

function semitones(base: number, n: number): number {
  return base * Math.pow(2, n / 12);
}

export function musicaAtiva(): boolean {
  return _voices !== null;
}

export function iniciarMusicaAmbiente(seed?: number): void {
  if (_voices) return;
  const mixer = getMixer();
  if (!mixer) return;
  const target = getCategoriaNode('musica');
  if (!target) return;

  // Per-world seed → deterministic music character
  const rng = makeRng(seed ?? gerarSeedMusical());

  // Choose musical parameters from seed
  const ROOT_HZ = 90 + rng() * 60;                // 90..150 Hz
  const scaleName = SCALE_NAMES[Math.floor(rng() * SCALE_NAMES.length)];
  const SCALE_RATIOS = SCALES[scaleName];
  // Voice intensities — randomly emphasize different layers
  const subBassGain = 0.08 + rng() * 0.10;
  const sawGain = 0.04 + rng() * 0.06;
  const shimmerPeak = 0.015 + rng() * 0.025;
  // LFO speeds (periods in seconds)
  const cutoffPeriod = 16 + rng() * 14;            // 16..30s
  const cutoffSweep = 280 + rng() * 250;            // 280..530 Hz
  const filterBase = 480 + rng() * 320;             // 480..800 Hz
  const tremoloPeriod = 6 + rng() * 8;              // 6..14s
  const detuneAmt = 4 + rng() * 8;                  // 4..12 cents
  const detunePeriodMin = 10 + rng() * 8;
  // Pick scale degree pair for the saw chorus
  const degA = Math.floor(rng() * SCALE_RATIOS.length);
  const degB = Math.floor(rng() * SCALE_RATIOS.length);
  // Shimmer pitch — random scale degree, 2 octaves up
  const shimmerDeg = Math.floor(rng() * SCALE_RATIOS.length);

  const ctx = mixer.ctx;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(target);
  out.gain.linearRampToValueAtTime(1.0, now + 4);

  const nodes: AudioNode[] = [];

  // Voice 1: Sub-bass
  {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = ROOT_HZ / 2;
    const gain = ctx.createGain();
    gain.gain.value = subBassGain;
    osc.connect(gain).connect(out);
    osc.start(now);
    nodes.push(osc, gain);
  }

  // Voice 2 & 3: Mid saw chorus through filter
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterBase;
    filter.Q.value = 4;
    filter.connect(out);

    const lfoCutoff = ctx.createOscillator();
    lfoCutoff.type = 'sine';
    lfoCutoff.frequency.value = 1 / cutoffPeriod;
    const lfoCutoffGain = ctx.createGain();
    lfoCutoffGain.gain.value = cutoffSweep;
    lfoCutoff.connect(lfoCutoffGain).connect(filter.frequency);
    lfoCutoff.start(now);
    nodes.push(lfoCutoff, lfoCutoffGain);

    const freqs = [ROOT_HZ * SCALE_RATIOS[degA], ROOT_HZ * SCALE_RATIOS[degB]];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freqs[i];
      const g = ctx.createGain();
      g.gain.value = sawGain;
      osc.connect(g).connect(filter);

      const lfoDetune = ctx.createOscillator();
      lfoDetune.type = 'sine';
      lfoDetune.frequency.value = 1 / (detunePeriodMin + i * 3 + rng() * 5);
      const lfoDetuneGain = ctx.createGain();
      lfoDetuneGain.gain.value = detuneAmt;
      lfoDetune.connect(lfoDetuneGain).connect(osc.detune);
      lfoDetune.start(now);
      osc.start(now);
      nodes.push(osc, g, lfoDetune, lfoDetuneGain);
    }
    nodes.push(filter);
  }

  // Voice 4: High shimmer
  {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = semitones(ROOT_HZ * 4 * SCALE_RATIOS[shimmerDeg], 0);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(out);

    const tremolo = ctx.createOscillator();
    tremolo.type = 'sine';
    tremolo.frequency.value = 1 / tremoloPeriod;
    const tremoloGain = ctx.createGain();
    tremoloGain.gain.value = shimmerPeak;
    const tremoloOffset = ctx.createConstantSource();
    tremoloOffset.offset.value = shimmerPeak;
    tremoloOffset.connect(gain.gain);
    tremolo.connect(tremoloGain).connect(gain.gain);
    tremolo.start(now);
    tremoloOffset.start(now);
    osc.start(now);
    nodes.push(osc, gain, tremolo, tremoloGain, tremoloOffset);
  }

  console.log(`[música] seed=${seed ?? '?'}, scale=${scaleName}, root=${ROOT_HZ.toFixed(1)}Hz`);

  _voices = { ctx, out, nodes, startTime: now };
}

export function pararMusicaAmbiente(): void {
  const v = _voices;
  if (!v) return;
  _voices = null;

  const ctx = v.ctx;
  const now = ctx.currentTime;
  // Fade out over 1.5s, then stop everything
  v.out.gain.cancelScheduledValues(now);
  v.out.gain.setValueAtTime(v.out.gain.value, now);
  v.out.gain.linearRampToValueAtTime(0, now + 1.5);

  setTimeout(() => {
    for (const node of v.nodes) {
      try {
        if ('stop' in node && typeof (node as any).stop === 'function') {
          (node as any).stop();
        }
        node.disconnect();
      } catch {
        // node may already be torn down
      }
    }
    try { v.out.disconnect(); } catch { /* noop */ }
  }, 1700);
}
