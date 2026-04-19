/**
 * Player empire — name, visual identity (logo/sigil), personality
 * weights, objective, and generated lore. Authored by the player in the
 * new-world wizard; carried on Mundo and persisted with the save.
 *
 * The personality is expressed as 6 sliders (the same genome the AI
 * uses). An "archetype" is inferred from the dominant weights only to
 * feed the existing lore generator — the player never picks one by name.
 */

import { gerarImperioLore, type ImperioLore } from './lore/imperio-lore';
import type { Arquetipo, PersonalidadeIA } from './personalidade-ia';

export type ObjetivoImperio =
  | 'conquista'      // eliminate all empires
  | 'economia'       // accumulate resources
  | 'ciencia'        // research everything
  | 'sobrevivencia'  // endure
  | 'exploracao'     // discover all systems
  | 'livre';         // no explicit goal

export interface PesosImperio {
  agressao: number;
  expansao: number;
  economia: number;
  ciencia: number;
  defesa: number;
  vinganca: number;
}

export interface ImperioJogador {
  nome: string;
  /** Sigil id — maps to an SVG builder in ui/empire-builder/sigilos.ts */
  logo: { sigilo: string };
  pesos: PesosImperio;
  objetivo: ObjetivoImperio;
  lore?: ImperioLore;
  /** Derived from pesos — same shape as the old TipoJogador.bonus. */
  bonus: {
    producao?: number;
    fabricasIniciais?: number;
    infraestruturaInicial?: number;
  };
}

/** Color auto-assigned to the player empire. Kept separate from pesos
 *  so auto-tinting logic can evolve without breaking save shape. */
export const COR_JOGADOR_DEFAULT = 0x44aaff;

export const SIGILO_DEFAULT = 'estrela';

export const PESOS_DEFAULT: PesosImperio = {
  agressao: 1.0,
  expansao: 1.0,
  economia: 1.0,
  ciencia: 1.0,
  defesa: 1.0,
  vinganca: 1.0,
};

export const PESOS_MIN = 0;
export const PESOS_MAX = 1.5;

export function clampPeso(v: number): number {
  if (!Number.isFinite(v)) return 1.0;
  return Math.max(PESOS_MIN, Math.min(PESOS_MAX, v));
}

export function imperioJogadorDefault(): ImperioJogador {
  const imperio: ImperioJogador = {
    nome: 'Meu Império',
    logo: { sigilo: SIGILO_DEFAULT },
    pesos: { ...PESOS_DEFAULT },
    objetivo: 'livre',
    bonus: {},
  };
  imperio.bonus = derivarBonus(imperio.pesos);
  return imperio;
}

/**
 * Map dominant weights → archetype for the lore generator.
 *
 * The lore engine's templates (birth story, foundational achievement,
 * military doctrine, etc.) are keyed by archetype. We infer the closest
 * fit from the player's slider state so lore stays coherent with how
 * they actually built the empire.
 */
export function inferirArquetipo(pesos: PesosImperio): Arquetipo {
  const scores: Array<[Arquetipo, number]> = [
    ['warlord',   pesos.agressao + pesos.vinganca * 0.5],
    ['explorer',  pesos.expansao],
    ['trader',    pesos.economia + pesos.expansao * 0.3],
    ['scientist', pesos.ciencia],
    ['defender',  pesos.defesa + pesos.vinganca * 0.3],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][0];
}

/**
 * Derive gameplay bonuses from the personality weights. Keeps the
 * same TipoJogador.bonus shape so the existing world-creation code
 * (mundo.ts) can apply it unchanged.
 */
export function derivarBonus(pesos: PesosImperio): ImperioJogador['bonus'] {
  const bonus: ImperioJogador['bonus'] = {};
  if (pesos.economia >= 1.2) bonus.producao = 1 + (pesos.economia - 1) * 0.5;
  if (pesos.expansao >= 1.2) bonus.fabricasIniciais = 1;
  if (pesos.defesa >= 1.2)   bonus.infraestruturaInicial = 1;
  return bonus;
}

function defaultNaveFavorita(arquetipo: Arquetipo): PersonalidadeIA['naveFavorita'] {
  switch (arquetipo) {
    case 'warlord':   return 'fragata';
    case 'trader':    return 'cargueira';
    case 'scientist': return 'fragata';
    case 'defender':  return 'torreta';
    case 'explorer':  return 'batedora';
  }
}

/**
 * Build a PersonalidadeIA-shaped object from the player's empire so
 * the existing lore generator (which expects that shape) can run. The
 * returned object is NOT registered as an AI — it's purely a carrier.
 */
export function sintetizarPersonalidade(imperio: ImperioJogador): PersonalidadeIA {
  const arquetipo = inferirArquetipo(imperio.pesos);
  return {
    id: 'jogador',
    nome: imperio.nome,
    cor: COR_JOGADOR_DEFAULT,
    arquetipo,
    pesos: { ...imperio.pesos },
    naveFavorita: defaultNaveFavorita(arquetipo),
    frotaMinAtaque: 5,
    paciencia: 3,
    frotaMax: 25,
    forca: 1,
  };
}

/**
 * Generate lore for the player's empire. `seed` makes regeneration
 * deterministic-per-click — the wizard passes a fresh seed on each
 * "Regerar" press.
 */
export function gerarLoreDoJogador(imperio: ImperioJogador, seed: number): ImperioLore {
  const personalidade = sintetizarPersonalidade(imperio);
  return gerarImperioLore({
    empireId: 'jogador',
    galaxySeed: seed,
    nomeImperio: imperio.nome,
    personalidade,
  });
}
