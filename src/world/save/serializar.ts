import type { Mundo, Sol, Planeta, Nave } from '../../types';
import type {
  MundoDTO,
  SolDTO,
  SistemaDTO,
  TipoJogadorDTO,
  PlanetaDTO,
  MemoriaPlanetaDTO,
  NaveDTO,
  AlvoDTO,
  RotaCargueiraDTO,
} from './dto';
import { CURRENT_SCHEMA_VERSION } from './dto';
import { getMemoria } from '../nevoa';
import { getPersonalidades } from '../ia-decisao';

export function serializarMundo(
  mundo: Mundo,
  nome: string,
  opts: { criadoEm?: number; tempoJogadoMs?: number } = {},
): MundoDTO {
  const now = Date.now();

  const sois: SolDTO[] = mundo.sois
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((sol) => serializarSol(sol));

  const sistemas: SistemaDTO[] = mundo.sistemas
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((sis) => ({
      id: sis.id,
      x: sis.x,
      y: sis.y,
      solId: sis.sol.id,
      planetaIds: sis.planetas.map((p) => p.id),
    }));

  const agora = performance.now();
  const planetas: PlanetaDTO[] = mundo.planetas
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => serializarPlaneta(p, agora));

  const naves: NaveDTO[] = mundo.naves
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => serializarNave(n));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nome,
    criadoEm: opts.criadoEm ?? now,
    salvoEm: now,
    tempoJogadoMs: opts.tempoJogadoMs ?? 0,
    tamanho: mundo.tamanho,
    tipoJogador: serializarTipoJogador(mundo.tipoJogador),
    sistemas,
    sois,
    planetas,
    naves,
    fontesVisao: mundo.fontesVisao.map((f) => ({ x: f.x, y: f.y, raio: f.raio })),
    seedMusical: mundo.seedMusical,
    personalidadesIa: getPersonalidades().map((ia) => ({
      id: ia.id,
      nome: ia.nome,
      cor: ia.cor,
      arquetipo: ia.arquetipo,
      pesos: { ...ia.pesos },
      naveFavorita: ia.naveFavorita,
      frotaMinAtaque: ia.frotaMinAtaque,
      paciencia: ia.paciencia,
      frotaMax: ia.frotaMax,
      forca: ia.forca,
    })),
  };
}

function serializarNave(nave: Nave): NaveDTO {
  return {
    id: nave.id,
    tipo: nave.tipo,
    tier: nave.tier,
    dono: nave.dono,
    x: nave.x,
    y: nave.y,
    estado: nave.estado,
    carga: { ...nave.carga },
    configuracaoCarga: { ...nave.configuracaoCarga },
    orbita: nave.orbita ? { ...nave.orbita } : null,
    surveyTempoRestanteMs: nave.surveyTempoRestanteMs,
    surveyTempoTotalMs: nave.surveyTempoTotalMs,
    thrustX: nave.thrustX,
    thrustY: nave.thrustY,
    origemId: nave.origem.id,
    alvo: serializarAlvo(nave.alvo),
    rotaManual: nave.rotaManual.map((p) => ({ x: p.x, y: p.y })),
    rotaCargueira: serializarRotaCargueira(nave.rotaCargueira),
  };
}

function serializarAlvo(alvo: Nave['alvo']): AlvoDTO | null {
  if (!alvo) return null;
  if (alvo._tipoAlvo === 'planeta') return { tipo: 'planeta', id: alvo.id };
  if (alvo._tipoAlvo === 'sol') return { tipo: 'sol', id: alvo.id };
  if (alvo._tipoAlvo === 'ponto') return { tipo: 'ponto', x: alvo.x, y: alvo.y };
  return null;
}

function serializarRotaCargueira(rota: Nave['rotaCargueira']): RotaCargueiraDTO | null {
  if (!rota) return null;
  return {
    origemId: rota.origem?.id ?? null,
    destinoId: rota.destino?.id ?? null,
    loop: rota.loop,
    fase: rota.fase,
  };
}

function clonarDadosPlaneta(dados: Planeta['dados']): Planeta['dados'] {
  return {
    ...dados,
    recursos: { ...dados.recursos },
    fracProducao: { ...dados.fracProducao },
    pesquisas: Object.fromEntries(
      Object.entries(dados.pesquisas).map(([k, v]) => [k, [...v]]),
    ),
    filaProducao: dados.filaProducao.map((i) => ({ ...i })),
    construcaoAtual: dados.construcaoAtual ? { ...dados.construcaoAtual } : null,
    producaoNave: dados.producaoNave ? { ...dados.producaoNave } : null,
    pesquisaAtual: dados.pesquisaAtual ? { ...dados.pesquisaAtual } : null,
    selecionado: false, // transient UI state, never persisted
  };
}

function serializarPlaneta(planeta: Planeta, agora: number): PlanetaDTO {
  return {
    id: planeta.id,
    orbita: { ...planeta._orbita },
    dados: clonarDadosPlaneta(planeta.dados),
    visivelAoJogador: planeta._visivelAoJogador,
    descobertoAoJogador: planeta._descobertoAoJogador,
    memoria: serializarMemoria(planeta, agora),
  };
}

function serializarMemoria(planeta: Planeta, agora: number): MemoriaPlanetaDTO | null {
  const mem = getMemoria(planeta);
  if (!mem || !mem.dados) return null;
  return {
    conhecida: mem.conhecida,
    snapshotX: mem.dados.x,
    snapshotY: mem.dados.y,
    idadeMs: agora - mem.dados.timestamp,
    dados: { ...mem.dados.dados },
  };
}

function serializarSol(sol: Sol): SolDTO {
  return {
    id: sol.id,
    x: sol.x,
    y: sol.y,
    raio: sol._raio,
    cor: sol._cor,
    visivelAoJogador: sol._visivelAoJogador,
    descobertoAoJogador: sol._descobertoAoJogador,
  };
}

function serializarTipoJogador(tj: Mundo['tipoJogador']): TipoJogadorDTO {
  return {
    nome: tj.nome,
    desc: tj.desc,
    cor: tj.cor,
    bonus: { ...tj.bonus },
  };
}
