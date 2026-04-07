import { Container, Graphics } from 'pixi.js';
import type { Spritesheet } from 'pixi.js';
import type { Sol, Planeta, Sistema } from '../types';
import { DIST_MIN_SISTEMA } from './constantes';
import { criarPlanetaSprite, TIPO_PLANETA } from './planeta';
import { criarEstadoPesquisas } from './pesquisa';

function sortearTipoPlaneta(): string {
  const tipos = Object.values(TIPO_PLANETA);
  return tipos[Math.floor(Math.random() * tipos.length)];
}

function criarSol(x: number, y: number, raio: number, cor: number): Sol {
  const sol = new Graphics() as unknown as Sol;
  sol.x = x;
  sol.y = y;
  sol._raio = raio;
  sol._cor = cor;
  sol._tipoAlvo = 'sol';
  sol.circle(0, 0, raio * 1.45).fill({ color: cor, alpha: 0.08 });
  sol.circle(0, 0, raio).fill({ color: cor, alpha: 0.95 });
  sol.circle(0, 0, raio * 0.55).fill({ color: 0xfff7dd, alpha: 0.9 });
  return sol;
}

export function criarSistemaSolar(container: Container, planetaSheet: Spritesheet, centroX: number, centroY: number, indiceSistema: number): Sistema {
  const corSol = [0xffd166, 0xffb703, 0xfff1a8, 0xf4a261][indiceSistema % 4];
  const raioSol = 90 + Math.random() * 70;
  const sol = criarSol(centroX, centroY, raioSol, corSol);
  sol.visible = false;
  container.addChild(sol);

  const quantidadePlanetas = 1 + Math.floor(Math.random() * 5);
  const planetas: Planeta[] = [];

  for (let i = 0; i < quantidadePlanetas; i++) {
    const tamanho = 140 + Math.random() * 170;
    const raioOrbita = raioSol + 300 + i * (220 + Math.random() * 80);
    const anguloInicial = Math.random() * Math.PI * 2;
    const velocidade = 0.00003 + Math.random() * 0.000025;
    const tipoPlaneta = sortearTipoPlaneta();
    const p = criarPlanetaSprite(
      planetaSheet,
      centroX + Math.cos(anguloInicial) * raioOrbita,
      centroY + Math.sin(anguloInicial) * raioOrbita,
      tamanho,
      tipoPlaneta
    ) as unknown as Planeta;

    p.dados = {
      dono: 'neutro',
      tipoPlaneta,
      producao: 1,
      recursos: { comum: 0, raro: 0, combustivel: 0 },
      tamanho,
      selecionado: false,
      fabricas: 0,
      infraestrutura: 0,
      naves: 0,
      acumuladorRecursosMs: 0,
      fracProducao: { comum: 0, raro: 0, combustivel: 0 },
      sistemaId: indiceSistema,
      construcaoAtual: null,
      producaoNave: null,
      filaProducao: [],
      repetirFilaProducao: false,
      pesquisas: criarEstadoPesquisas(),
      pesquisaAtual: null,
    };
    p._tipoAlvo = 'planeta';
    p._orbita = {
      centroX,
      centroY,
      raio: raioOrbita,
      angulo: anguloInicial,
      velocidade,
    };

    const anel = new Graphics();
    p.addChild(anel);
    p._anel = anel;

    const construcoes = new Graphics();
    p.addChild(construcoes);
    p._construcoes = construcoes;

    p.visible = false;
    container.addChild(p);
    planetas.push(p);
  }

  return { x: centroX, y: centroY, sol, planetas };
}

export { DIST_MIN_SISTEMA };
