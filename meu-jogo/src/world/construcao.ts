import type { Mundo, Planeta, AcaoNaveParsed } from '../types';
import { cheats } from '../ui/debug';
import { CICLO_RECURSO_MS, CUSTO_NAVE_COMUM } from './constantes';
import { aplicarProducaoCicloAoImperio, calcularCustoTier, calcularTempoConstrucaoMs, calcularTempoColonizadoraMs } from './recursos';
import { criarNave, parseAcaoNave } from './naves';
import { notifConstrucaoCompleta, notifNaveProducida } from '../ui/notificacao';
import { somConstrucaoCompleta, somNaveProducida } from '../audio/som';

export function desenharConstrucoesPlaneta(planeta: Planeta): void {
  const g = planeta._construcoes;
  if (!g) return;

  g.clear();

  const total = planeta.dados.fabricas + planeta.dados.infraestrutura;
  if (total <= 0) return;

  const baseY = planeta.dados.tamanho * 0.22;
  const espacamento = Math.max(6, planeta.dados.tamanho * 0.05);
  const largura = Math.max(5, planeta.dados.tamanho * 0.03);
  const inicioX = -((total - 1) * espacamento) / 2;
  let indice = 0;

  for (let i = 0; i < planeta.dados.fabricas; i++) {
    const x = inicioX + indice * espacamento;
    const altura = Math.max(8, planeta.dados.tamanho * (0.06 + i * 0.008));
    g.roundRect(x, baseY - altura, largura, altura, 2).fill({ color: 0xffb347, alpha: 0.95 });
    g.rect(x + largura * 0.35, baseY - altura - 4, Math.max(2, largura * 0.25), 4).fill({ color: 0x6b4b1f, alpha: 0.9 });
    indice++;
  }

  for (let i = 0; i < planeta.dados.infraestrutura; i++) {
    const x = inicioX + indice * espacamento;
    const altura = Math.max(7, planeta.dados.tamanho * (0.05 + i * 0.007));
    g.roundRect(x, baseY - altura, largura, altura, 2).fill({ color: 0x6ec1ff, alpha: 0.95 });
    g.rect(x + largura * 0.2, baseY - altura - 2, largura * 0.6, 2).fill({ color: 0xd7f0ff, alpha: 0.9 });
    indice++;
  }
}

export function atualizarFilasPlaneta(mundo: Mundo, planeta: Planeta, deltaMs: number): void {
  if (planeta.dados.dono !== 'jogador') return;

  planeta.dados.acumuladorRecursosMs += deltaMs;
  while (planeta.dados.acumuladorRecursosMs >= CICLO_RECURSO_MS) {
    planeta.dados.acumuladorRecursosMs -= CICLO_RECURSO_MS;
    aplicarProducaoCicloAoImperio(mundo, planeta);
  }

  const construcao = planeta.dados.construcaoAtual;
  if (construcao) {
    if (cheats.construcaoInstantanea) construcao.tempoRestanteMs = 0;
    else construcao.tempoRestanteMs = Math.max(0, construcao.tempoRestanteMs - deltaMs);
    if (construcao.tempoRestanteMs <= 0) {
      if (construcao.tipo === 'fabrica') planeta.dados.fabricas = construcao.tierDestino;
      if (construcao.tipo === 'infraestrutura') planeta.dados.infraestrutura = construcao.tierDestino;
      planeta.dados.construcaoAtual = null;
      desenharConstrucoesPlaneta(planeta);
      notifConstrucaoCompleta(construcao.tipo, construcao.tierDestino);
      somConstrucaoCompleta();
    }
  }

  const producao = planeta.dados.producaoNave;
  if (producao) {
    if (cheats.construcaoInstantanea) producao.tempoRestanteMs = 0;
    else producao.tempoRestanteMs = Math.max(0, producao.tempoRestanteMs - deltaMs);
    if (producao.tempoRestanteMs <= 0) {
      planeta.dados.producaoNave = null;
      const tipoNave = producao.tipoNave || 'colonizadora';
      const tier = producao.tier || 1;
      if (tipoNave === 'colonizadora') planeta.dados.naves += 1;
      criarNave(mundo, planeta, tipoNave, tier);
      notifNaveProducida(tipoNave, tier);
      somNaveProducida();
    }
  }
}

function enfileirarProducaoNave(mundo: Mundo, planeta: Planeta, tipoNave: string, tier: number): boolean {
  if (planeta.dados.fabricas < 1 || planeta.dados.producaoNave) return false;
  if (tipoNave !== 'colonizadora') {
    if (planeta.dados.fabricas < tier) return false;
    const pesq = mundo.pesquisas[tipoNave];
    if (!pesq || !pesq[tier - 1]) return false;
  }
  const tempo = calcularTempoColonizadoraMs(planeta);
  if (!tempo || mundo.recursosJogador.comum < CUSTO_NAVE_COMUM) return false;
  mundo.recursosJogador.comum -= CUSTO_NAVE_COMUM;
  planeta.dados.producaoNave = {
    tipoNave,
    tier,
    tempoRestanteMs: tempo,
    tempoTotalMs: tempo,
  };
  return true;
}

export function construirNoPlaneta(mundo: Mundo, planeta: Planeta, tipo: string): boolean {
  if (!planeta || planeta.dados.dono !== 'jogador') return false;

  const parsedNave: AcaoNaveParsed | null = parseAcaoNave(tipo);
  if (parsedNave) {
    return enfileirarProducaoNave(mundo, planeta, parsedNave.tipo, parsedNave.tier);
  }

  if (tipo === 'fabrica') {
    if (planeta.dados.construcaoAtual) return false;
    const custo = calcularCustoTier(planeta.dados.fabricas);
    const tempo = calcularTempoConstrucaoMs(planeta.dados.fabricas);
    if (!custo || !tempo || mundo.recursosJogador.comum < custo) return false;
    mundo.recursosJogador.comum -= custo;
    planeta.dados.construcaoAtual = {
      tipo: 'fabrica',
      tierDestino: planeta.dados.fabricas + 1,
      tempoRestanteMs: tempo,
      tempoTotalMs: tempo,
    };
    return true;
  }

  if (tipo === 'infraestrutura') {
    if (planeta.dados.construcaoAtual) return false;
    const custo = calcularCustoTier(planeta.dados.infraestrutura);
    const tempo = calcularTempoConstrucaoMs(planeta.dados.infraestrutura);
    if (!custo || !tempo || mundo.recursosJogador.comum < custo) return false;
    mundo.recursosJogador.comum -= custo;
    planeta.dados.construcaoAtual = {
      tipo: 'infraestrutura',
      tierDestino: planeta.dados.infraestrutura + 1,
      tempoRestanteMs: tempo,
      tempoTotalMs: tempo,
    };
    return true;
  }

  return false;
}
