import { somClique } from '../audio/som';
import type { Application } from 'pixi.js';
import type { Mundo, Camera, Nave, Planeta, Sol } from '../types';
import { consumirInteracaoUi } from '../ui/interacao-ui';
import {
  definirPlanetaRotaCargueira,
  encontrarNaveNoPonto,
  encontrarPlanetaNoPonto,
  encontrarSolNoPonto,
  enviarNaveParaAlvo,
  enviarNaveParaPosicao,
  limparSelecoes,
  obterNaveSelecionada,
  selecionarNave,
  selecionarPlaneta,
} from '../world/mundo';

const camera: Camera = { x: 0, y: 0, zoom: 1 };

let cameraDragging = false;
const cameraLastMouse = { x: 0, y: 0 };
const clickStartScreen = { x: 0, y: 0 };
let clickInfo: { nave: Nave | null; planeta: Planeta | null; sol: Sol | null } | null = null;
let comandoNave: { tipo: 'mover' | 'origem' | 'destino'; nave: Nave | null } | null = null;

export function setTipoJogador(): void {}

export function getCamera(): Camera {
  return camera;
}

export function getZoom(): number {
  return camera.zoom;
}

export function setCameraPos(x: number, y: number): void {
  camera.x = x;
  camera.y = y;
}

export function iniciarComandoNave(tipo: 'mover' | 'origem' | 'destino', nave: Nave | null): void {
  if (!nave) return;
  comandoNave = { tipo, nave };
}

export function cancelarComandoNave(): void {
  comandoNave = null;
}

export function getTextoComandoNave(): string {
  if (!comandoNave?.nave?.selecionado) return '';
  if (comandoNave.tipo === 'mover') return 'Modo movimento: clique no destino';
  if (comandoNave.tipo === 'origem') return 'Config origem: clique em um planeta seu';
  return 'Config destino: clique em um planeta seu';
}

function screenToWorld(sx: number, sy: number, app: Application) {
  return {
    x: (sx - app.screen.width / 2) / camera.zoom + camera.x,
    y: (sy - app.screen.height / 2) / camera.zoom + camera.y,
  };
}

export function configurarCamera(app: Application, mundo: Mundo): void {
  const canvas = app.canvas;

  canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 0) {
      const world = screenToWorld(e.clientX, e.clientY, app);
      clickInfo = {
        nave: encontrarNaveNoPonto(world.x, world.y, mundo),
        planeta: encontrarPlanetaNoPonto(world.x, world.y, mundo, true),
        sol: encontrarSolNoPonto(world.x, world.y, mundo, true),
      };
      clickStartScreen.x = e.clientX;
      clickStartScreen.y = e.clientY;

      if (!clickInfo.nave && !clickInfo.planeta && !clickInfo.sol) {
        cameraDragging = true;
        cameraLastMouse.x = e.clientX;
        cameraLastMouse.y = e.clientY;
      }
      return;
    }

    if (e.button === 1 || e.button === 2) {
      cameraDragging = true;
      cameraLastMouse.x = e.clientX;
      cameraLastMouse.y = e.clientY;
    }
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!cameraDragging) return;

    const dx = e.clientX - cameraLastMouse.x;
    const dy = e.clientY - cameraLastMouse.y;
    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;
    cameraLastMouse.x = e.clientX;
    cameraLastMouse.y = e.clientY;
  });

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (cameraDragging) {
      cameraDragging = false;
    }

    if (e.button !== 0) return;
    if (consumirInteracaoUi()) {
      clickInfo = null;
      return;
    }

    const movedX = e.clientX - clickStartScreen.x;
    const movedY = e.clientY - clickStartScreen.y;
    const movedDist = Math.hypot(movedX, movedY);

    if (movedDist < 5) {
      const naveSelecionada = obterNaveSelecionada(mundo);
      const destinoMapa = screenToWorld(e.clientX, e.clientY, app);

      if (clickInfo?.nave) {
        cancelarComandoNave();
        selecionarNave(mundo, clickInfo.nave);
        somClique();
      } else if (naveSelecionada && comandoNave?.nave === naveSelecionada) {
        if (comandoNave.tipo === 'mover') {
          const alvo = (clickInfo?.planeta || clickInfo?.sol) ?? null;
          const ok = alvo
            ? enviarNaveParaAlvo(mundo, naveSelecionada, alvo)
            : enviarNaveParaPosicao(mundo, naveSelecionada, destinoMapa.x, destinoMapa.y);
          if (ok) {
            cancelarComandoNave();
            somClique();
          }
        } else if ((comandoNave.tipo === 'origem' || comandoNave.tipo === 'destino') && clickInfo?.planeta?.dados.dono === 'jogador') {
          definirPlanetaRotaCargueira(naveSelecionada, comandoNave.tipo, clickInfo.planeta);
          cancelarComandoNave();
          somClique();
        }
      } else if (clickInfo?.planeta) {
        cancelarComandoNave();
        selecionarPlaneta(mundo, clickInfo.planeta);
        somClique();
      } else {
        cancelarComandoNave();
        limparSelecoes(mundo);
      }
    }

    clickInfo = null;
  });

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();

    const mouseWorld = screenToWorld(e.clientX, e.clientY, app);

    if (e.deltaY < 0) {
      camera.zoom = Math.min(2.0, camera.zoom * 1.1);
    } else {
      camera.zoom = Math.max(0.3, camera.zoom / 1.1);
    }

    camera.x = mouseWorld.x - (e.clientX - app.screen.width / 2) / camera.zoom;
    camera.y = mouseWorld.y - (e.clientY - app.screen.height / 2) / camera.zoom;
  }, { passive: false });
}

export function atualizarCamera(mundo: Mundo, app: Application): void {
  mundo.container.scale.set(camera.zoom);
  mundo.container.x = -camera.x * camera.zoom + app.screen.width / 2;
  mundo.container.y = -camera.y * camera.zoom + app.screen.height / 2;
}
