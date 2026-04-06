import type { Mundo, PesquisasState, Pesquisa } from '../types';
import { CATEGORIAS_PESQUISA, TIER_MAX, CUSTO_PESQUISA_RARO, TEMPO_PESQUISA_MS } from './constantes';
import { cheats } from '../ui/debug';
import { notifPesquisaCompleta } from '../ui/notificacao';
import { somPesquisaCompleta } from '../audio/som';

export function criarEstadoPesquisas(): PesquisasState {
  return {
    torreta: [false, false, false, false, false],
    cargueira: [false, false, false, false, false],
    batedora: [false, false, false, false, false],
  };
}

export function atualizarPesquisaGlobal(mundo: Mundo, deltaMs: number): void {
  const p: Pesquisa | null = mundo.pesquisaAtual;
  if (!p) return;
  if (cheats.pesquisaInstantanea) p.tempoRestanteMs = 0;
  else p.tempoRestanteMs = Math.max(0, p.tempoRestanteMs - deltaMs);
  if (p.tempoRestanteMs <= 0) {
    const arr: boolean[] | undefined = mundo.pesquisas[p.categoria];
    if (arr) arr[p.tier - 1] = true;
    notifPesquisaCompleta(p.categoria, p.tier);
    somPesquisaCompleta();
    mundo.pesquisaAtual = null;
  }
}

export function iniciarPesquisa(mundo: Mundo, categoria: string, tier: number): boolean {
  if (!CATEGORIAS_PESQUISA.includes(categoria)) return false;
  if (tier < 1 || tier > TIER_MAX) return false;
  const arr: boolean[] | undefined = mundo.pesquisas[categoria];
  if (!arr || arr[tier - 1]) return false;
  if (mundo.pesquisaAtual) return false;
  if (mundo.recursosJogador.raro < CUSTO_PESQUISA_RARO) return false;
  mundo.recursosJogador.raro -= CUSTO_PESQUISA_RARO;
  mundo.pesquisaAtual = {
    categoria, tier,
    tempoRestanteMs: TEMPO_PESQUISA_MS,
    tempoTotalMs: TEMPO_PESQUISA_MS,
  };
  return true;
}

export function pesquisaTierLiberada(mundo: Mundo, categoria: string, tier: number): boolean {
  return !!mundo.pesquisas[categoria]?.[tier - 1];
}

export function getPesquisaAtual(mundo: Mundo): Pesquisa | null {
  return mundo.pesquisaAtual || null;
}
