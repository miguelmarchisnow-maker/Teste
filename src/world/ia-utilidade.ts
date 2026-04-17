import type { Mundo, Planeta, Nave } from '../types';
import type { PersonalidadeIA } from './personalidade-ia';
import { saoHostis } from './constantes';
import { getStatsCombate, podeAtacar } from './combate';
import { getRancor, tempoDesdeUltimoAtaque } from './ia-memoria';

/**
 * Utility-based action scoring for AI decisions.
 *
 * Each tick, the AI generates a list of candidate actions (build ship,
 * send fleet, research tech, expand factory). Each candidate gets a
 * utility score combining:
 *
 *   utility = base_value × personality_weight × situational_modifier
 *
 * The AI executes top-N actions that fit its budget. Personalities
 * differ → different utility shapes → different play styles.
 */

export type AcaoCandidata =
  | { tipo: 'produzir_nave'; planeta: Planeta; tipoNave: string; }
  | { tipo: 'enviar_frota'; origem: Planeta; alvo: Planeta; navesIds: string[]; }
  | { tipo: 'pesquisar'; planeta: Planeta; categoria: string; tier: number; }
  | { tipo: 'subir_fabrica'; planeta: Planeta; }
  | { tipo: 'subir_infra'; planeta: Planeta; };

export interface AcaoComScore {
  acao: AcaoCandidata;
  score: number;
}

function planetasDoDono(mundo: Mundo, dono: string): Planeta[] {
  return mundo.planetas.filter((p) => p.dados.dono === dono);
}

function navesDoDono(mundo: Mundo, dono: string): Nave[] {
  return mundo.naves.filter((n) => n.dono === dono);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Total combat power of a fleet (sum of dano × hp_ratio). */
function poderCombate(naves: Nave[]): number {
  let total = 0;
  for (const n of naves) {
    const stats = getStatsCombate(n);
    if (!podeAtacar(n.tipo)) continue;
    const hpRatio = (n.hp ?? stats.hp) / stats.hp;
    total += stats.dano * hpRatio;
  }
  return total;
}

// ─── Score functions ─────────────────────────────────────────────────────

function scoreProduzirNave(
  ia: PersonalidadeIA,
  planeta: Planeta,
  tipoNave: string,
  mundo: Mundo,
): number {
  let base = 10;

  // Personality bias toward favorite ship
  if (tipoNave === ia.naveFavorita) base *= 1.5;

  // Type-specific weights
  if (tipoNave === 'fragata') base *= ia.pesos.agressao * 1.2;
  if (tipoNave === 'torreta') base *= ia.pesos.defesa;
  if (tipoNave === 'batedora') base *= (ia.pesos.expansao * 0.7 + ia.pesos.agressao * 0.3);
  if (tipoNave === 'cargueira') base *= ia.pesos.economia * 0.6;

  // Threat at this planet → boost defensive choices
  const ameacaAqui = ameacaNoPlaneta(mundo, planeta, ia.id);
  if (tipoNave === 'torreta' && ameacaAqui > 0) {
    base *= 1 + ameacaAqui * 0.4;
  }
  if (tipoNave === 'fragata' && ameacaAqui > 0) {
    base *= 1 + ameacaAqui * 0.2; // fragata also helps defense
  }

  // Diminishing returns: lots of one type already? scale down
  const minhaFrotaTipo = mundo.naves.filter((n) => n.dono === ia.id && n.tipo === tipoNave).length;
  base *= 1 / (1 + minhaFrotaTipo * 0.1);

  // Difficulty multiplier
  base *= ia.forca;

  // Cooldown bonus: encourage some variety
  if (Math.random() < 0.1) base *= 0.7; // jitter

  return base;
}

/** Returns 0..3 representing how threatened this planet is. */
function ameacaNoPlaneta(mundo: Mundo, planeta: Planeta, donoIa: string): number {
  let ameaca = 0;
  for (const n of mundo.naves) {
    if (!saoHostis(n.dono, donoIa)) continue;
    const d = dist(n, planeta);
    if (d > 1500) continue;
    const proximidade = 1 - d / 1500; // 0..1
    const stats = getStatsCombate(n);
    ameaca += proximidade * (stats.dano / 10);
  }
  return Math.min(3, ameaca);
}

function scoreEnviarFrota(
  ia: PersonalidadeIA,
  origem: Planeta,
  alvo: Planeta,
  minhasNaves: Nave[],
  mundo: Mundo,
): number {
  const alvoDono = alvo.dados.dono;
  if (alvoDono === ia.id) return -Infinity; // can't attack own planet

  const meuPoder = poderCombate(minhasNaves);
  const defesaInimiga = poderCombate(
    mundo.naves.filter((n) => n.dono === alvoDono && saoHostis(n.dono, ia.id) && dist(n, alvo) < 600),
  );

  // Don't send tiny fleets unless attacking neutro
  if (alvoDono !== 'neutro' && minhasNaves.length < ia.frotaMinAtaque) return -Infinity;
  // Don't attack if outclassed (force ratio < 1.3)
  if (alvoDono !== 'neutro' && defesaInimiga > meuPoder * 0.8) return -Infinity;

  let base = 0;

  if (alvoDono === 'neutro') {
    // Expansion utility — value depends on planet type (gasoso planets are gold)
    base = 25 * ia.pesos.expansao;
    if (alvo.dados.tipoPlaneta === 'gasoso') base *= 1.4;
  } else {
    // Attack utility — based on enemy economy + revenge
    const valorEconomia = (alvo.dados.fabricas + alvo.dados.infraestrutura) * 5;
    const rancor = getRancor(ia.id, alvoDono);
    base = (valorEconomia + rancor * 8) * ia.pesos.agressao;

    // Revenge bonus
    if (rancor > 5) base *= 1 + ia.pesos.vinganca * 0.3;

    // Don't spam attacks on same target
    const t = tempoDesdeUltimoAtaque(ia.id, alvoDono);
    if (t < 8000) base *= 0.4;
  }

  // Distance penalty
  const d = dist(origem, alvo);
  base *= Math.max(0.2, 1 - d / 8000);

  // Force ratio bonus — winning by a lot scores higher
  if (defesaInimiga > 0) {
    const ratio = meuPoder / Math.max(1, defesaInimiga);
    base *= Math.min(2, ratio);
  } else {
    base *= 1.3; // undefended target — bonus
  }

  // Difficulty
  base *= ia.forca;

  return base;
}

function scorePesquisar(ia: PersonalidadeIA, _planeta: Planeta, categoria: string, tier: number): number {
  let base = 8 * tier; // higher tiers more valuable
  base *= ia.pesos.ciencia;

  // Category preference matches favorite ship
  if (categoria === ia.naveFavorita) base *= 1.4;

  // If currently engaged in combat, deprioritize research
  // (handled at executor level by checking resources first)

  base *= ia.forca;
  return base;
}

function scoreSubirFabrica(ia: PersonalidadeIA, planeta: Planeta): number {
  let base = 12;
  base *= ia.pesos.economia;
  // Higher tiers diminishing returns
  base *= 1 / (1 + planeta.dados.fabricas * 0.3);
  base *= ia.forca;
  return base;
}

function scoreSubirInfra(ia: PersonalidadeIA, planeta: Planeta): number {
  // Only useful on comum planets
  if (planeta.dados.tipoPlaneta !== 'comum') return 0;
  let base = 8;
  base *= ia.pesos.economia;
  base *= 1 / (1 + planeta.dados.infraestrutura * 0.3);
  base *= ia.forca;
  return base;
}

// ─── Action generation ───────────────────────────────────────────────────

export function gerarAcoesCandidatas(ia: PersonalidadeIA, mundo: Mundo): AcaoComScore[] {
  const meusPlanetas = planetasDoDono(mundo, ia.id);
  if (meusPlanetas.length === 0) return [];
  const minhasNaves = navesDoDono(mundo, ia.id);

  const acoes: AcaoComScore[] = [];

  // Production candidates: each planet × each ship type
  for (const planeta of meusPlanetas) {
    if (planeta.dados.fabricas < 1) continue;
    if (minhasNaves.length >= ia.frotaMax) continue;
    for (const tipoNave of ['fragata', 'torreta', 'batedora', 'cargueira']) {
      const score = scoreProduzirNave(ia, planeta, tipoNave, mundo);
      if (score > 0) acoes.push({ acao: { tipo: 'produzir_nave', planeta, tipoNave }, score });
    }

    // Research candidates
    for (const cat of ['fragata', 'torreta', 'batedora', 'cargueira']) {
      const arr = planeta.dados.pesquisas[cat];
      if (!arr) continue;
      const tierAtual = arr.filter(Boolean).length;
      const proxTier = tierAtual + 1;
      if (proxTier > 5) continue;
      if (planeta.dados.fabricas < proxTier) continue;
      if (planeta.dados.pesquisaAtual) continue;
      const score = scorePesquisar(ia, planeta, cat, proxTier);
      if (score > 0) acoes.push({ acao: { tipo: 'pesquisar', planeta, categoria: cat, tier: proxTier }, score });
    }

    // Economy candidates
    if (planeta.dados.fabricas < 5) {
      const score = scoreSubirFabrica(ia, planeta);
      if (score > 0) acoes.push({ acao: { tipo: 'subir_fabrica', planeta }, score });
    }
    if (planeta.dados.infraestrutura < 5 && planeta.dados.tipoPlaneta === 'comum') {
      const score = scoreSubirInfra(ia, planeta);
      if (score > 0) acoes.push({ acao: { tipo: 'subir_infra', planeta }, score });
    }
  }

  // Fleet dispatch candidates: from each owned planet with idle ships,
  // to each reachable target (neutro for expansion + hostis for attack)
  for (const origem of meusPlanetas) {
    const navesNaqui = mundo.naves.filter(
      (n) => n.dono === ia.id && n.estado === 'orbitando' && n.alvo === origem
        && (n.tipo === 'fragata' || n.tipo === 'batedora'),
    );
    if (navesNaqui.length === 0) continue;

    // Targets: neutros nearby + jogador planets + rival AI planets
    for (const alvo of mundo.planetas) {
      if (alvo === origem) continue;
      if (alvo.dados.dono === ia.id) continue;
      if (dist(origem, alvo) > 8000) continue;
      const score = scoreEnviarFrota(ia, origem, alvo, navesNaqui, mundo);
      if (score > 0) {
        acoes.push({
          acao: {
            tipo: 'enviar_frota',
            origem,
            alvo,
            navesIds: navesNaqui.slice(0, Math.min(navesNaqui.length, 5)).map((n) => n.id),
          },
          score,
        });
      }
    }
  }

  // Sort by score desc
  acoes.sort((a, b) => b.score - a.score);
  return acoes;
}
