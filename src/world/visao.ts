import type { Mundo, Planeta, FonteVisao, Camera, Application } from '../types';
import { RAIO_VISAO_BASE, RAIO_VISAO_NAVE, RAIO_VISAO_BATEDORA, RAIO_VISAO_COLONIZADORA } from './constantes';
import { cheats } from '../ui/debug';
import { desenharNeblinaVisao, registrarMemoriaPlaneta } from './nevoa';

function calcularRaioVisaoPlaneta(planeta: Planeta): number {
  return RAIO_VISAO_BASE() + planeta.dados.tamanho * 0.2;
}

export function revelarSistemaCompleto(mundo: Mundo, sistemaId: number): void {
  for (const planeta of mundo.planetas) {
    if (planeta.dados.sistemaId !== sistemaId) continue;
    if (!planeta._descobertoAoJogador) {
      planeta._descobertoAoJogador = true;
      registrarMemoriaPlaneta(planeta);
    }
  }
}

export function pontoDentroDaVisao(x: number, y: number, fontesVisao: FonteVisao[]): boolean {
  for (const fonte of fontesVisao) {
    const dx: number = fonte.x - x;
    const dy: number = fonte.y - y;
    if (dx * dx + dy * dy <= fonte.raio * fonte.raio) return true;
  }
  return false;
}

export function atualizarCampoDeVisao(mundo: Mundo, camera: Camera, app: Application): void {
  const fontesVisao: FonteVisao[] = [];

  for (const planeta of mundo.planetas) {
    if (planeta.dados.dono !== 'jogador') continue;
    fontesVisao.push({
      x: planeta.x, y: planeta.y,
      raio: calcularRaioVisaoPlaneta(planeta),
    });
  }

  for (const nave of mundo.naves) {
    let raio: number;
    if (nave.tipo === 'batedora') raio = RAIO_VISAO_BATEDORA();
    else if (nave.tipo === 'colonizadora') raio = RAIO_VISAO_COLONIZADORA();
    else raio = RAIO_VISAO_NAVE();
    fontesVisao.push({ x: nave.x, y: nave.y, raio });
  }

  mundo.fontesVisao = fontesVisao;
  if (cheats.visaoTotal) {
    mundo.visaoContainer.removeChildren();
  } else {
    desenharNeblinaVisao(mundo, fontesVisao, camera, app.screen.width, app.screen.height, camera.zoom);
  }

  for (const sol of mundo.sois) {
    sol._visivelAoJogador = cheats.visaoTotal || pontoDentroDaVisao(sol.x, sol.y, fontesVisao);
    if (sol._visivelAoJogador) {
      sol._descobertoAoJogador = true;
    }
  }

  for (const planeta of mundo.planetas) {
    planeta._visivelAoJogador =
      cheats.visaoTotal ||
      planeta.dados.dono === 'jogador' ||
      pontoDentroDaVisao(planeta.x, planeta.y, fontesVisao);

    if (planeta._visivelAoJogador) {
      planeta._descobertoAoJogador = true;
      registrarMemoriaPlaneta(planeta);
    }

    if (!planeta._visivelAoJogador && planeta.dados.selecionado) {
      planeta.dados.selecionado = false;
    }
  }
}
