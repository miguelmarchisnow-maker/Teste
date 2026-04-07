import { Graphics } from 'pixi.js';
import type { Nave, Mundo, Planeta, Sol, AlvoPonto, AcaoNaveParsed, Recursos } from '../types';
import { VELOCIDADE_NAVE, VELOCIDADE_ORBITA_NAVE, formatarId } from './constantes';
import { cheats } from '../ui/debug';
import { notifColonizacao, mostrarNotificacao } from '../ui/notificacao';
import { somConquista } from '../audio/som';

function criarCargaVazia(): Recursos {
  return { comum: 0, raro: 0, combustivel: 0 };
}

function totalRecursos(recursos: Recursos): number {
  return recursos.comum + recursos.raro + recursos.combustivel;
}

function obterPlanetaAlvo(nave: Nave): Planeta | null {
  return nave.alvo && nave.alvo._tipoAlvo === 'planeta' ? nave.alvo : null;
}

export function capacidadeCargaCargueira(tier: number): number {
  return 30 * (2 ** Math.max(0, tier - 1));
}

function carregarRecursosPlaneta(planeta: Planeta, capacidade: number): Recursos {
  const carga = criarCargaVazia();
  let restante = capacidade;
  for (const tipo of ['comum', 'raro', 'combustivel'] as const) {
    if (restante <= 0) break;
    const disponivel = Math.floor(planeta.dados.recursos[tipo]);
    const quantidade = Math.min(disponivel, restante);
    planeta.dados.recursos[tipo] -= quantidade;
    carga[tipo] = quantidade;
    restante -= quantidade;
  }
  return carga;
}

function descarregarRecursosPlaneta(planeta: Planeta, carga: Recursos): void {
  planeta.dados.recursos.comum += carga.comum;
  planeta.dados.recursos.raro += carga.raro;
  planeta.dados.recursos.combustivel += carga.combustivel;
}

function totalConfigurado(nave: Nave): number {
  return totalRecursos(nave.configuracaoCarga);
}

function carregarConfiguracaoOrigem(nave: Nave, planeta: Planeta): Recursos {
  const carga = criarCargaVazia();
  for (const tipo of ['comum', 'raro', 'combustivel'] as const) {
    const desejado = Math.max(0, Math.floor(nave.configuracaoCarga[tipo]));
    const disponivel = Math.floor(planeta.dados.recursos[tipo]);
    const quantidade = Math.min(desejado, disponivel);
    planeta.dados.recursos[tipo] -= quantidade;
    carga[tipo] = quantidade;
  }
  return carga;
}

export function ajustarConfiguracaoCarga(nave: Nave, tipo: keyof Recursos, delta: number): void {
  if (nave.tipo !== 'cargueira') return;
  const capacidade = capacidadeCargaCargueira(nave.tier);
  const atual = nave.configuracaoCarga[tipo];
  const totalSemTipo = totalConfigurado(nave) - atual;
  const proximo = Math.max(0, Math.min(capacidade - totalSemTipo, atual + delta));
  nave.configuracaoCarga[tipo] = proximo;
}

export function definirPlanetaRotaCargueira(nave: Nave, modo: 'origem' | 'destino', planeta: Planeta): void {
  if (nave.tipo !== 'cargueira' || planeta.dados.dono !== 'jogador') return;
  nave.rotaCargueira ??= { origem: null, destino: null, loop: false, fase: 'origem' };
  nave.rotaCargueira[modo] = planeta;
}

export function alternarLoopCargueira(nave: Nave): void {
  if (nave.tipo !== 'cargueira') return;
  nave.rotaCargueira ??= { origem: null, destino: null, loop: false, fase: 'origem' };
  nave.rotaCargueira.loop = !nave.rotaCargueira.loop;
}

function processarLoopCargueira(nave: Nave): void {
  if (nave.tipo !== 'cargueira' || nave.estado !== 'orbitando' || !nave.rotaCargueira?.loop) return;
  const planetaAtual = obterPlanetaAlvo(nave);
  const rota = nave.rotaCargueira;
  if (!planetaAtual || !rota.origem || !rota.destino) return;
  if (totalConfigurado(nave) <= 0) return;

  if (rota.fase === 'origem' && planetaAtual === rota.origem && totalRecursos(nave.carga) <= 0) {
    const carga = carregarConfiguracaoOrigem(nave, planetaAtual);
    if (totalRecursos(carga) <= 0) return;
    nave.carga = carga;
    nave.origem = planetaAtual;
    rota.fase = 'destino';
    nave.estado = 'viajando';
    nave.alvo = rota.destino;
    nave.orbita = null;
    return;
  }

  if (rota.fase === 'destino' && planetaAtual === rota.destino && totalRecursos(nave.carga) <= 0) {
    rota.fase = 'origem';
    nave.estado = 'viajando';
    nave.alvo = rota.origem;
    nave.orbita = null;
  }
}

function desenharNaveGfx(nave: Nave): void {
  const g = nave.gfx;
  const tipo = nave.tipo || 'colonizadora';
  const tier = nave.tier || 1;
  const sel = nave.selecionado ? 0.95 : 0;
  g.clear();
  if (tipo === 'colonizadora') {
    g.poly([0, -10, 8, 8, 0, 4, -8, 8]).fill({ color: 0xffffff, alpha: 0.95 });
  } else if (tipo === 'cargueira') {
    const w = 10 + tier * 1.2;
    g.roundRect(-w, -7, w * 2, 14, 2).fill({ color: 0xa8d4ff, alpha: 0.95 });
    g.rect(-w * 0.4, -4, w * 0.8, 5).fill({ color: 0x446688, alpha: 0.9 });
  } else if (tipo === 'batedora') {
    g.poly([0, -9, 10, 0, 0, 9, -6, 0]).fill({ color: 0xffcc66, alpha: 0.95 });
  } else if (tipo === 'torreta') {
    const s = 5 + tier * 0.6;
    g.rect(-s, -s, s * 2, s * 2).fill({ color: 0xff6666, alpha: 0.95 });
    g.circle(0, 0, 3).fill({ color: 0xffaaaa, alpha: 0.95 });
  }
  g.circle(0, 0, 14).stroke({ color: 0x44aaff, width: 1.2, alpha: sel });
}

export function atualizarSelecaoNave(nave: Nave): void {
  desenharNaveGfx(nave);
}

function obterRaioAlvo(alvo: Planeta | Sol | AlvoPonto | null): number {
  if (!alvo) return 0;
  if (alvo._tipoAlvo === 'ponto') return 16;
  if (alvo._tipoAlvo === 'sol') return alvo._raio + 45;
  return alvo.dados.tamanho / 2 + 28;
}

export function entrarEmOrbita(nave: Nave, alvo: Planeta | Sol | AlvoPonto): void {
  const raio = obterRaioAlvo(alvo) + 18 + Math.random() * 28;
  nave.estado = 'orbitando';
  nave.alvo = alvo;
  nave.orbita = {
    raio,
    angulo: Math.random() * Math.PI * 2,
    velocidade: VELOCIDADE_ORBITA_NAVE,
  };
}

export function criarNave(mundo: Mundo, planetaOrigem: Planeta, tipo: string, tier: number = 1): Nave {
  const nave: Nave = {
    id: formatarId('nave'),
    tipo, tier,
    dono: 'jogador',
    x: planetaOrigem.x, y: planetaOrigem.y,
    estado: 'orbitando',
    alvo: planetaOrigem,
    selecionado: false,
    origem: planetaOrigem,
    carga: criarCargaVazia(),
    configuracaoCarga: criarCargaVazia(),
    rotaCargueira: null,
    gfx: new Graphics(),
    _tipoAlvo: 'nave',
    orbita: null,
  };
  atualizarSelecaoNave(nave);
  mundo.navesContainer.addChild(nave.gfx);
  mundo.naves.push(nave);
  entrarEmOrbita(nave, planetaOrigem);
  return nave;
}

export function removerNave(mundo: Mundo, nave: Nave): void {
  if (nave.origem?.dados && nave.tipo === 'colonizadora') {
    nave.origem.dados.naves = Math.max(0, nave.origem.dados.naves - 1);
  }
  const idx = mundo.naves.indexOf(nave);
  if (idx >= 0) mundo.naves.splice(idx, 1);
  if (nave.gfx) mundo.navesContainer.removeChild(nave.gfx);
}

export function atualizarNaves(mundo: Mundo, deltaMs: number): void {
  for (let i = mundo.naves.length - 1; i >= 0; i--) {
    const nave = mundo.naves[i];
    const alvo = nave.alvo;
    if (nave.estado === 'viajando' && alvo) {
      const dx = alvo.x - nave.x;
      const dy = alvo.y - nave.y;
      const dist = Math.hypot(dx, dy);
      const stopDist = obterRaioAlvo(alvo);
      const velReal = VELOCIDADE_NAVE * (cheats.velocidadeNave ? 10 : 1);
      if (dist <= stopDist + velReal * deltaMs) {
        if (nave.tipo === 'colonizadora' && alvo._tipoAlvo === 'planeta' && alvo.dados.dono === 'neutro') {
          finalizarColonizacao(mundo, nave, alvo);
          continue;
        }
        if (nave.tipo === 'cargueira' && alvo._tipoAlvo === 'planeta' && alvo.dados.dono === 'jogador' && totalRecursos(nave.carga) > 0) {
          descarregarRecursosPlaneta(alvo, nave.carga);
          mostrarNotificacao(`Cargueira descarregou ${totalRecursos(nave.carga)} recursos.`, '#60ccff');
          nave.carga = criarCargaVazia();
          nave.origem = alvo;
        }
        if (alvo._tipoAlvo === 'ponto') {
          nave.x = alvo.x; nave.y = alvo.y;
          nave.estado = 'parado'; nave.alvo = null; nave.orbita = null;
        } else {
          entrarEmOrbita(nave, alvo);
        }
      } else if (dist > 0) {
        nave.x += (dx / dist) * velReal * deltaMs;
        nave.y += (dy / dist) * velReal * deltaMs;
      }
    }
    if (nave.estado === 'orbitando' && nave.orbita && nave.alvo) {
      nave.orbita.angulo += nave.orbita.velocidade * deltaMs;
      nave.x = nave.alvo.x + Math.cos(nave.orbita.angulo) * nave.orbita.raio;
      nave.y = nave.alvo.y + Math.sin(nave.orbita.angulo) * nave.orbita.raio;
    }
    processarLoopCargueira(nave);
    nave.gfx.x = nave.x;
    nave.gfx.y = nave.y;
  }
}

function finalizarColonizacao(mundo: Mundo, nave: Nave, planeta: Planeta): void {
  planeta.dados.dono = 'jogador';
  planeta.dados.selecionado = false;
  removerNave(mundo, nave);
  notifColonizacao();
  somConquista();
}

export function encontrarNaveNoPonto(mundoX: number, mundoY: number, mundo: Mundo): Nave | null {
  for (let i = mundo.naves.length - 1; i >= 0; i--) {
    const nave = mundo.naves[i];
    const dx = nave.x - mundoX;
    const dy = nave.y - mundoY;
    if (dx * dx + dy * dy < 18 * 18) return nave;
  }
  return null;
}

export function obterNaveSelecionada(mundo: Mundo): Nave | null {
  return mundo.naves.find((n: Nave) => n.selecionado) || null;
}

export function selecionarNave(mundo: Mundo, nave: Nave | null): void {
  // Note: limparSelecoes is called from mundo.ts before this
  if (nave) {
    nave.selecionado = true;
    atualizarSelecaoNave(nave);
  }
}

export function enviarNaveParaAlvo(mundo: Mundo, nave: Nave, alvo: Planeta | Sol | AlvoPonto): boolean {
  if (!nave || !alvo) return false;
  nave.estado = 'viajando';
  nave.alvo = alvo;
  nave.orbita = null;
  return true;
}

export function enviarNaveParaPosicao(mundo: Mundo, nave: Nave, wx: number, wy: number): boolean {
  if (!nave || nave.dono !== 'jogador') return false;
  nave.estado = 'viajando';
  nave.alvo = { _tipoAlvo: 'ponto', x: wx, y: wy };
  nave.orbita = null;
  return true;
}

export function parseAcaoNave(acao: string): AcaoNaveParsed | null {
  if (acao === 'nave_colonizadora') return { tipo: 'colonizadora', tier: 1 };
  const m = acao.match(/^nave_(cargueira|batedora|torreta)_([1-5])$/);
  if (m) return { tipo: m[1], tier: Number(m[2]) };
  return null;
}
