/**
 * Procedural empire sigils. Every sigil is a seeded composition of
 *   frame + motif + ornament.
 *
 * Deterministic: same seed → same SVG. That means the save layer only
 * needs to persist a number. The wizard offers a gallery of variations
 * (seed, seed+1, …, seed+7) so players can browse without regenerating
 * the whole pool.
 *
 * All strokes use `currentColor` — callers tint by setting the color
 * on the containing element.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Seeded RNG ─────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  // Mulberry32 — simple, fast, good enough for cosmetic use.
  let a = (seed | 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── SVG helpers ────────────────────────────────────────────────────

function baseSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function path(d: string, strokeWidth = 2): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-width', String(strokeWidth));
  return p;
}

function circle(cx: number, cy: number, r: number, strokeWidth = 2): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(cx));
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', String(r));
  c.setAttribute('fill', 'none');
  c.setAttribute('stroke-width', String(strokeWidth));
  return c;
}

// ─── Frames (outer enclosure) ───────────────────────────────────────

type Frame = 'nenhum' | 'circulo' | 'hex' | 'escudo' | 'diamante' | 'duplo-circulo';
const FRAMES: readonly Frame[] = ['nenhum', 'circulo', 'hex', 'escudo', 'diamante', 'duplo-circulo'];

function addFrame(svg: SVGSVGElement, kind: Frame, strokeWidth: number): void {
  switch (kind) {
    case 'nenhum':
      return;
    case 'circulo':
      svg.appendChild(circle(24, 24, 20, strokeWidth));
      return;
    case 'duplo-circulo':
      svg.appendChild(circle(24, 24, 20, strokeWidth));
      svg.appendChild(circle(24, 24, 17, strokeWidth * 0.7));
      return;
    case 'hex': {
      // Flat-top hexagon centered at (24,24) with radius 20
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push(`${(24 + Math.cos(a) * 20).toFixed(2)} ${(24 + Math.sin(a) * 20).toFixed(2)}`);
      }
      svg.appendChild(path(`M${pts.join(' L')} Z`, strokeWidth));
      return;
    }
    case 'escudo':
      svg.appendChild(path('M24 4 L42 10 L42 24 C42 33 34 42 24 44 C14 42 6 33 6 24 L6 10 Z', strokeWidth));
      return;
    case 'diamante':
      svg.appendChild(path('M24 4 L44 24 L24 44 L4 24 Z', strokeWidth));
      return;
  }
}

// ─── Motifs (central symbol) ────────────────────────────────────────

type Motif =
  | 'estrela-5'
  | 'estrela-6'
  | 'estrela-8'
  | 'cruz'
  | 'triangulo'
  | 'triangulo-inv'
  | 'anel'
  | 'orbe'
  | 'olho'
  | 'atomo'
  | 'engrenagem'
  | 'asa'
  | 'raio'
  | 'seta'
  | 'ponto-triplice'
  | 'barras';
const MOTIFS: readonly Motif[] = [
  'estrela-5', 'estrela-6', 'estrela-8',
  'cruz', 'triangulo', 'triangulo-inv',
  'anel', 'orbe', 'olho',
  'atomo', 'engrenagem', 'asa',
  'raio', 'seta', 'ponto-triplice', 'barras',
];

function addMotif(svg: SVGSVGElement, kind: Motif, strokeWidth: number): void {
  switch (kind) {
    case 'estrela-5': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? 11 : 5;
        pts.push(`${(24 + Math.cos(a) * r).toFixed(2)} ${(24 + Math.sin(a) * r).toFixed(2)}`);
      }
      svg.appendChild(path(`M${pts.join(' L')} Z`, strokeWidth));
      return;
    }
    case 'estrela-6': {
      svg.appendChild(path('M24 13 L31 25 L17 25 Z', strokeWidth));
      svg.appendChild(path('M24 35 L31 23 L17 23 Z', strokeWidth));
      return;
    }
    case 'estrela-8': {
      const pts: string[] = [];
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? 12 : 5;
        pts.push(`${(24 + Math.cos(a) * r).toFixed(2)} ${(24 + Math.sin(a) * r).toFixed(2)}`);
      }
      svg.appendChild(path(`M${pts.join(' L')} Z`, strokeWidth));
      return;
    }
    case 'cruz':
      svg.appendChild(path('M24 12 L24 36 M12 24 L36 24', strokeWidth * 1.2));
      return;
    case 'triangulo':
      svg.appendChild(path('M24 12 L34 32 L14 32 Z', strokeWidth));
      return;
    case 'triangulo-inv':
      svg.appendChild(path('M14 16 L34 16 L24 36 Z', strokeWidth));
      return;
    case 'anel':
      svg.appendChild(circle(24, 24, 10, strokeWidth));
      svg.appendChild(circle(24, 24, 5, strokeWidth * 0.8));
      return;
    case 'orbe':
      svg.appendChild(circle(24, 24, 10, strokeWidth));
      svg.appendChild(path('M14 24 L34 24 M24 14 Q30 24 24 34 M24 14 Q18 24 24 34', strokeWidth * 0.8));
      return;
    case 'olho':
      svg.appendChild(path('M10 24 Q24 14 38 24 Q24 34 10 24 Z', strokeWidth));
      svg.appendChild(circle(24, 24, 3.5, strokeWidth));
      return;
    case 'atomo': {
      svg.appendChild(circle(24, 24, 2.5, strokeWidth));
      const e1 = document.createElementNS(SVG_NS, 'ellipse');
      e1.setAttribute('cx', '24'); e1.setAttribute('cy', '24');
      e1.setAttribute('rx', '11'); e1.setAttribute('ry', '5');
      e1.setAttribute('fill', 'none');
      e1.setAttribute('stroke-width', String(strokeWidth * 0.85));
      svg.appendChild(e1);
      const e2 = e1.cloneNode() as SVGElement;
      e2.setAttribute('transform', 'rotate(60 24 24)');
      svg.appendChild(e2);
      const e3 = e1.cloneNode() as SVGElement;
      e3.setAttribute('transform', 'rotate(120 24 24)');
      svg.appendChild(e3);
      return;
    }
    case 'engrenagem': {
      svg.appendChild(circle(24, 24, 5, strokeWidth));
      svg.appendChild(circle(24, 24, 10, strokeWidth));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x1 = 24 + Math.cos(a) * 10;
        const y1 = 24 + Math.sin(a) * 10;
        const x2 = 24 + Math.cos(a) * 14;
        const y2 = 24 + Math.sin(a) * 14;
        svg.appendChild(path(`M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`, strokeWidth));
      }
      return;
    }
    case 'asa':
      svg.appendChild(path('M24 14 Q14 18 10 28 Q18 24 24 26 Q30 24 38 28 Q34 18 24 14 Z', strokeWidth));
      svg.appendChild(path('M24 14 L24 36', strokeWidth * 0.8));
      return;
    case 'raio':
      svg.appendChild(path('M26 12 L16 26 L22 26 L18 36 L30 22 L24 22 L30 12 Z', strokeWidth));
      return;
    case 'seta':
      svg.appendChild(path('M24 12 L34 24 L28 24 L28 36 L20 36 L20 24 L14 24 Z', strokeWidth));
      return;
    case 'ponto-triplice':
      svg.appendChild(circle(24, 14, 3, strokeWidth));
      svg.appendChild(circle(14, 30, 3, strokeWidth));
      svg.appendChild(circle(34, 30, 3, strokeWidth));
      svg.appendChild(path('M24 14 L14 30 L34 30 Z', strokeWidth * 0.7));
      return;
    case 'barras':
      svg.appendChild(path('M14 16 L34 16', strokeWidth * 1.5));
      svg.appendChild(path('M14 24 L34 24', strokeWidth * 1.5));
      svg.appendChild(path('M14 32 L34 32', strokeWidth * 1.5));
      return;
  }
}

// ─── Ornaments (optional flourish) ──────────────────────────────────

type Ornament = 'nenhum' | 'ticks-4' | 'ticks-8' | 'pontos-4' | 'cantos';
const ORNAMENTS: readonly Ornament[] = ['nenhum', 'ticks-4', 'ticks-8', 'pontos-4', 'cantos'];

function addOrnament(svg: SVGSVGElement, kind: Ornament, strokeWidth: number): void {
  switch (kind) {
    case 'nenhum':
      return;
    case 'ticks-4':
    case 'ticks-8': {
      const n = kind === 'ticks-4' ? 4 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x1 = 24 + Math.cos(a) * 19;
        const y1 = 24 + Math.sin(a) * 19;
        const x2 = 24 + Math.cos(a) * 22;
        const y2 = 24 + Math.sin(a) * 22;
        svg.appendChild(path(`M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`, strokeWidth * 0.8));
      }
      return;
    }
    case 'pontos-4': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const x = 24 + Math.cos(a) * 20;
        const y = 24 + Math.sin(a) * 20;
        svg.appendChild(circle(x, y, 1.8, strokeWidth));
      }
      return;
    }
    case 'cantos': {
      // L-shapes at the 4 corners of the viewbox, inward from the edge.
      const s = 5;
      const gap = 4;
      const corners = [
        [gap, gap, 1, 1],
        [48 - gap, gap, -1, 1],
        [gap, 48 - gap, 1, -1],
        [48 - gap, 48 - gap, -1, -1],
      ];
      for (const [x, y, dx, dy] of corners) {
        svg.appendChild(path(
          `M${x} ${y + dy * s} L${x} ${y} L${x + dx * s} ${y}`,
          strokeWidth * 0.8,
        ));
      }
      return;
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Seed-derived palette: one primary hue, slightly shifted secondary. */
export function paletaDoSigilo(seed: number): { primaria: string; secundaria: string } {
  const rng = makeRng(seed ^ 0xCAFEBABE);
  const hue = Math.floor(rng() * 360);
  const primaria = hslToHex(hue, 65 + rng() * 25, 62 + rng() * 10);
  // Secondary: rotated 25-40° for harmony, slightly desaturated.
  const shift = 25 + rng() * 15;
  const hue2 = (hue + (rng() < 0.5 ? shift : -shift) + 360) % 360;
  const secundaria = hslToHex(hue2, 55 + rng() * 20, 70 + rng() * 10);
  return { primaria, secundaria };
}

/**
 * Render a sigil from a seed. The same seed always yields the same
 * SVG composition (frame + motif + optional ornament + stroke width)
 * and color. Frame + ornaments use the secondary color; the motif
 * uses the primary — gives each sigil a readable two-tone feel.
 */
export function gerarSigilo(seed: number): SVGSVGElement {
  const rng = makeRng(seed);
  const svg = baseSvg();

  const strokeWidth = 1.5 + rng() * 1.0;   // 1.5..2.5
  const frame = pick(rng, FRAMES);
  const motif = pick(rng, MOTIFS);
  const ornament = rng() < 0.5 ? pick(rng, ORNAMENTS) : 'nenhum';

  const { primaria, secundaria } = paletaDoSigilo(seed);

  const frameGroup = document.createElementNS(SVG_NS, 'g');
  frameGroup.setAttribute('stroke', secundaria);
  svg.appendChild(frameGroup);
  addFrame(frameGroup as unknown as SVGSVGElement, frame, strokeWidth);

  const motifGroup = document.createElementNS(SVG_NS, 'g');
  motifGroup.setAttribute('stroke', primaria);
  svg.appendChild(motifGroup);
  addMotif(motifGroup as unknown as SVGSVGElement, motif, strokeWidth);

  const ornGroup = document.createElementNS(SVG_NS, 'g');
  ornGroup.setAttribute('stroke', secundaria);
  svg.appendChild(ornGroup);
  addOrnament(ornGroup as unknown as SVGSVGElement, ornament, strokeWidth);

  return svg;
}

/** Quick helper for UI: build N variation seeds starting at `base`. */
export function seedVariacoes(base: number, quantidade = 8): number[] {
  const out: number[] = [];
  for (let i = 0; i < quantidade; i++) out.push((base + i) | 0);
  return out;
}

export function novaSeed(): number {
  return (Math.floor(Math.random() * 0xFFFFFFFF)) | 0;
}
