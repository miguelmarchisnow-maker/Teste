import type { Planeta, Recursos } from '../types';
import { TIPO_PLANETA } from './planeta';
import { CICLO_RECURSO_MS, TIER_MAX, CUSTO_BASE_TIER, MULTIPLICADOR_TIER, TEMPO_BASE_CONSTRUCAO_MS, TEMPO_BASE_COLONIZADORA_MS } from './constantes';

export function obterProducaoNaturalCiclo(planeta: Planeta): Recursos {
  const tipo = planeta.dados.tipoPlaneta;
  const infra = planeta.dados.infraestrutura || 0;
  switch (tipo) {
    case TIPO_PLANETA.COMUM: return { comum: 1 + infra, raro: 1, combustivel: 1 };
    case TIPO_PLANETA.MARTE: return { comum: 0.5, raro: 0.5, combustivel: 0.5 };
    case TIPO_PLANETA.GASOSO: return { comum: 0, raro: 0, combustivel: 7 };
    default: return { comum: 1 + infra, raro: 1, combustivel: 1 };
  }
}

export function aplicarProducaoCicloAoPlaneta(planeta: Planeta): void {
  const base = obterProducaoNaturalCiclo(planeta);
  const mult = planeta.dados.producao || 1;
  const acc = planeta.dados.fracProducao;
  const recursos = planeta.dados.recursos;
  acc.comum += base.comum * mult;
  acc.raro += base.raro * mult;
  acc.combustivel += base.combustivel * mult;
  for (const k of ['comum', 'raro', 'combustivel'] as const) {
    while (acc[k] >= 1) {
      recursos[k] += 1;
      acc[k] -= 1;
    }
  }
}

export function textoProducaoCicloPlaneta(planeta: Planeta): string {
  const base = obterProducaoNaturalCiclo(planeta);
  const mult = planeta.dados.producao || 1;
  const fmt = (n: number): string => (Number.isInteger(n * mult) ? String(n * mult) : (n * mult).toFixed(1));
  return `C:${fmt(base.comum)} R:${fmt(base.raro)} F:${fmt(base.combustivel)}`;
}

export function getTierMax(): number { return TIER_MAX; }

export function calcularCustoTier(tierAtual: number): number | null {
  if (tierAtual >= TIER_MAX) return null;
  return CUSTO_BASE_TIER * (MULTIPLICADOR_TIER ** tierAtual);
}

export function calcularTempoConstrucaoMs(tierAtual: number): number | null {
  if (tierAtual >= TIER_MAX) return null;
  return TEMPO_BASE_CONSTRUCAO_MS * (MULTIPLICADOR_TIER ** tierAtual);
}

export function calcularTempoCicloPlaneta(): number { return CICLO_RECURSO_MS; }

export function calcularTempoRestantePlaneta(planeta: Planeta): number {
  const cicloAtualMs = calcularTempoCicloPlaneta();
  return Math.max(0, cicloAtualMs - planeta.dados.acumuladorRecursosMs);
}

export function calcularTempoColonizadoraMs(planeta: Planeta | null): number | null {
  if (!planeta || planeta.dados.fabricas < 1) return null;
  return Math.max(10 * 1000, TEMPO_BASE_COLONIZADORA_MS / planeta.dados.fabricas);
}
