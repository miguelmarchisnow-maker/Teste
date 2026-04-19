/**
 * Inline SVG sigils for the empire logo picker. Each sigil is a
 * standalone builder that returns a fresh SVGSVGElement — the caller
 * mounts it wherever. Stroke uses `currentColor` so the surrounding
 * CSS can tint the glyph with the empire color.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function baseSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function path(d: string): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  return p;
}

function circle(cx: number, cy: number, r: number): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(cx));
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', String(r));
  c.setAttribute('fill', 'none');
  return c;
}

// ── Sigils ──────────────────────────────────────────────────────────

function sigEstrela(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M24 6 L28 20 L42 20 L30 28 L34 42 L24 34 L14 42 L18 28 L6 20 L20 20 Z'));
  return s;
}

function sigEscudo(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M24 6 L38 11 L38 24 C38 33 32 40 24 42 C16 40 10 33 10 24 L10 11 Z'));
  s.appendChild(path('M24 16 L24 32 M16 24 L32 24'));
  return s;
}

function sigAtomo(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(circle(24, 24, 3));
  const e1 = document.createElementNS(SVG_NS, 'ellipse');
  e1.setAttribute('cx', '24'); e1.setAttribute('cy', '24');
  e1.setAttribute('rx', '16'); e1.setAttribute('ry', '7');
  e1.setAttribute('fill', 'none');
  s.appendChild(e1);
  const e2 = e1.cloneNode() as SVGElement;
  e2.setAttribute('transform', 'rotate(60 24 24)');
  s.appendChild(e2);
  const e3 = e1.cloneNode() as SVGElement;
  e3.setAttribute('transform', 'rotate(120 24 24)');
  s.appendChild(e3);
  return s;
}

function sigEngrenagem(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(circle(24, 24, 6));
  // 8 teeth as short radial strokes
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const x1 = 24 + Math.cos(a) * 11;
    const y1 = 24 + Math.sin(a) * 11;
    const x2 = 24 + Math.cos(a) * 16;
    const y2 = 24 + Math.sin(a) * 16;
    s.appendChild(path(`M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`));
  }
  s.appendChild(circle(24, 24, 11));
  return s;
}

function sigAsa(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M6 26 Q16 12 24 14 Q32 12 42 26 Q32 22 24 24 Q16 22 6 26 Z'));
  s.appendChild(path('M24 14 L24 36'));
  return s;
}

function sigCrisma(): SVGSVGElement {
  // Christogram-ish crossed keys — minimal
  const s = baseSvg();
  s.appendChild(path('M12 12 L36 36 M36 12 L12 36'));
  s.appendChild(circle(24, 24, 10));
  return s;
}

function sigOrbe(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(circle(24, 24, 14));
  s.appendChild(path('M10 24 L38 24'));
  s.appendChild(path('M24 10 Q34 24 24 38 Q14 24 24 10'));
  return s;
}

function sigAnel(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(circle(24, 24, 14));
  s.appendChild(circle(24, 24, 8));
  s.appendChild(path('M6 24 L18 24 M30 24 L42 24'));
  return s;
}

function sigCrane(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M14 10 L14 26 L10 30 L14 34 L34 34 L38 30 L34 26 L34 10 Z'));
  s.appendChild(path('M18 18 L22 18 M26 18 L30 18'));
  s.appendChild(path('M20 38 L22 42 M26 38 L28 42'));
  return s;
}

function sigCruz(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M24 6 L24 42 M8 18 L40 18'));
  s.appendChild(circle(24, 30, 10));
  return s;
}

function sigOlho(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M6 24 Q24 10 42 24 Q24 38 6 24 Z'));
  s.appendChild(circle(24, 24, 5));
  return s;
}

function sigFoice(): SVGSVGElement {
  const s = baseSvg();
  s.appendChild(path('M12 38 Q12 10 40 10'));
  s.appendChild(path('M36 14 Q32 26 20 30'));
  s.appendChild(path('M12 38 L30 38'));
  return s;
}

export interface SigiloDef {
  id: string;
  label: string;
  render: () => SVGSVGElement;
}

export const SIGILOS: readonly SigiloDef[] = [
  { id: 'estrela',     label: 'Estrela',     render: sigEstrela },
  { id: 'escudo',      label: 'Escudo',      render: sigEscudo },
  { id: 'atomo',       label: 'Átomo',       render: sigAtomo },
  { id: 'engrenagem',  label: 'Engrenagem',  render: sigEngrenagem },
  { id: 'asa',         label: 'Asa',         render: sigAsa },
  { id: 'crisma',      label: 'Crisma',      render: sigCrisma },
  { id: 'orbe',        label: 'Orbe',        render: sigOrbe },
  { id: 'anel',        label: 'Anel',        render: sigAnel },
  { id: 'crane',       label: 'Crânio',      render: sigCrane },
  { id: 'cruz',        label: 'Cruz',        render: sigCruz },
  { id: 'olho',        label: 'Olho',        render: sigOlho },
  { id: 'foice',       label: 'Foice',       render: sigFoice },
];

export function renderSigilo(id: string): SVGSVGElement {
  const def = SIGILOS.find((s) => s.id === id) ?? SIGILOS[0];
  return def.render();
}
