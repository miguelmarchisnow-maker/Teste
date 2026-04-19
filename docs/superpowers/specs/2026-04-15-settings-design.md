# Settings System — Design

**Data**: 2026-04-15
**Status**: Aprovado, pronto pra plano de implementação
**Projeto**: Orbital Wydra

## Contexto

O spec 1 (Save/Load) criou uma tela de **Configurações** mínima com só duas opções (intervalo de autosave, toggle de modo experimental). Este spec expande essa tela pra uma configuração completa de áudio, gráficos e jogabilidade.

Durante o brainstorm também foi identificado um **bug de viewport culling** que afeta três arquivos do sistema de rendering — o cálculo de bounds de tela assume que `camera.x/y` é o canto superior-esquerdo da viewport, mas a transform real posiciona a câmera no centro. Consequência: o culling tá deslocado meia-tela pra direita/baixo. Coisas na esquerda/cima somem cedo demais; coisas fora da direita/baixo continuam renderizando. Esse bug é incluído neste spec como pré-requisito pras opções de "qualidade baixa" fazerem sentido (sem o fix, reduzir qualidade não entrega performance real porque o mundo inteiro continua no loop de render).

Este é o **segundo de 5 specs** do ciclo de fechamento do main menu. Os outros:

1. Save/Load (pronto)
2. Settings (este spec)
3. Input system + rebind de controles
4. i18n PT/EN
5. Deploy em GitHub Pages

## Objetivo

Entregar uma tela de configurações completa e polida que cobre:

- **Áudio**: 4 categorias (Master, SFX jogo, SFX UI, Avisos) com volume e mute por categoria, refatorando `som.ts` pra usar uma árvore de `GainNode`.
- **Gráficos**: slider único de qualidade com 4 níveis (Alto/Médio/Baixo/Mínimo) mapeado pra flags concretas, mais toggles isolados (fullscreen, scanlines, mostrar FPS, limite de FPS), controles de motor de renderização (WebGL/WebGPU, versão do WebGL, preferência de GPU) e um modal com informações detalhadas da GPU ativa.
- **Jogabilidade**: confirmar ações destrutivas, edge-scroll.
- **Fix do viewport culling**: correção do cálculo de bounds em `mundo.ts`, `fundo.ts` e `nevoa.ts`, com função pura testável e testes unitários.
- **Extensão do `src/core/config.ts`** com todas as chaves novas e observer pattern pra propagação live das mudanças.
- **Tela de Configurações reescrita** com abas (Áudio / Gráficos / Jogabilidade), botões de reset por aba e global, tooltip mechanism novo com textos estruturados pra cada controle gráfico.
- **Acessível tanto do main menu quanto in-game** via novo botão na sidebar.

## Fora de escopo

- Música e sons ambientes — não existem no projeto ainda; adicionar sliders pra conteúdo inexistente é YAGNI. Quando trilha existir, vira outro spec.
- Mixer 3D posicional, compressor, reverb — overkill pra jogo 2D simples.
- Refatoração do sistema de input (spec 3).
- Idioma (spec 4).
- Touch/mobile settings (o jogo é desktop-only).
- Render scale (resolution scale) — removido durante o brainstorm após o usuário clarificar que `powerPreference` era o que ele queria como "quanto de performance usar".
- Forçar software rendering — impossível pelo browser; o spec só detecta e informa.
- Seleção de GPU por nome/modelo — o browser não expõe essa API por razões de privacidade (fingerprinting).
- **Persistência de estado hardcoded de HUD** (empire name, créditos) — herda a decisão do Save/Load spec.

---

## 1. Arquitetura em linha grossa

Cinco unidades independentes que se integram via o `src/core/config.ts` expandido:

```
                          ┌─────────────────────┐
                          │   config.ts         │
                          │   (observer pattern) │
                          └──────────┬──────────┘
                                     │
           ┌─────────────────────────┼────────────────────────┐
           ▼                         ▼                        ▼
  ┌──────────────┐          ┌───────────────┐        ┌────────────────┐
  │  mixer.ts    │          │ graphics-     │        │ player.ts /    │
  │  (audio      │          │ preset.ts     │        │ sidebar / etc  │
  │  GainNode    │          │ (graphics     │        │ (gameplay      │
  │  tree)       │          │  flags)       │        │  toggles)      │
  └──────────────┘          └───────────────┘        └────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  viewport-bounds.ts │
                          │  (shared pure fn)   │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              mundo.ts          fundo.ts         nevoa.ts
              (culling)         (starfield)      (fog canvas)


  ┌────────────────────────────────────────────────────────────┐
  │                     settings-panel.ts                      │
  │   (3 tabs: áudio / gráficos / jogabilidade)                │
  │   consome getConfig(), chama setConfig() em cada change    │
  │   acessível do main-menu E da sidebar in-game              │
  └────────────────────────────────────────────────────────────┘
           │
           ▼
  ┌────────────────────────────────┐
  │  renderer-info-modal.ts        │
  │  (popup read-only com GPU      │
  │   info, capacidades, aviso     │
  │   de software rendering)       │
  └────────────────────────────────┘
```

**Princípio de live-update**:

- **Áudio**: live sempre. `GainNode.gain.value` atualiza em tempo real sem glitch audível.
- **Gráficos**: live onde é barato (scanlines, órbitas, FPS display, FPS cap, max fantasmas, fog throttle); requer reload onde é caro (shader ao vivo → baked, fullscreen, motor de renderização, versão WebGL, preferência GPU, densidade starfield pesada). Quando uma mudança exige reload, o controle mostra banner inline "Requer recarregar o jogo. [Recarregar agora]".
- **Jogabilidade**: live sempre.

---

## 2. Refactor do áudio

### 2.1 Arquitetura em GainNodes

Hoje `src/audio/som.ts` conecta cada oscilador direto ao `ctx.destination` sem mixer. Refactor: árvore de `GainNode`s persistente com 1 master + 3 categorias filhas.

```
AudioContext.destination
        ▲
        │
   masterGain
        ▲
   ┌────┴────┬─────────┐
   │         │         │
 sfxGain   uiGain   avisoGain
```

Novo arquivo: `src/audio/mixer.ts`.

```ts
import { getConfig, onConfigChange } from '../core/config';

export type AudioCategoria = 'sfx' | 'ui' | 'aviso';

interface MixerState {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  ui: GainNode;
  aviso: GainNode;
}

let _state: MixerState | null = null;
let _disponivel = true;

export function getMixer(): MixerState | null {
  if (_state) return _state;
  if (!_disponivel) return null;
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) {
      _disponivel = false;
      return null;
    }
    const ctx: AudioContext = new AC();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const sfx = ctx.createGain();    sfx.connect(master);
    const ui = ctx.createGain();     ui.connect(master);
    const aviso = ctx.createGain();  aviso.connect(master);
    _state = { ctx, master, sfx, ui, aviso };
    aplicarConfigAtual();
    return _state;
  } catch (err) {
    console.warn('[audio] mixer indisponível:', err);
    _disponivel = false;
    return null;
  }
}

export function getCategoriaNode(cat: AudioCategoria): GainNode | null {
  const m = getMixer();
  return m ? m[cat] : null;
}

export function aplicarConfigAtual(): void {
  const m = _state;
  if (!m) return;
  const a = getConfig().audio;
  // Mute zera o gain efetivo, mas o volume "real" fica preservado em
  // config. Assim quando o usuário unmuta, o volume volta ao valor que
  // ele tinha antes — mesmo se ele mexeu no slider enquanto mutado
  // (a mudança toma efeito imediato no unmute, não perde o valor).
  m.master.gain.value = a.master.muted ? 0 : a.master.volume;
  m.sfx.gain.value = a.sfx.muted ? 0 : a.sfx.volume;
  m.ui.gain.value = a.ui.muted ? 0 : a.ui.volume;
  m.aviso.gain.value = a.aviso.muted ? 0 : a.aviso.volume;
}

// Auto-apply on config changes
onConfigChange((cfg) => {
  aplicarConfigAtual();
});
```

**Browser policy**: AudioContexts são bloqueados até o primeiro gesto do usuário. `getMixer()` é preguiçoso — só instancia na primeira chamada, que acontece depois que o usuário clicou em "Novo Jogo" ou em qualquer botão. Se por algum motivo alguma `somX()` é chamada antes do gesto, o mixer fica `null` e a função vira no-op silenciosa.

### 2.2 Mudanças em `som.ts`

Cada função recebe (implicitamente) sua categoria via helper `tocar(categoria, ...)`:

```ts
import { getMixer, getCategoriaNode, type AudioCategoria } from './mixer';

function tocar(
  categoria: AudioCategoria,
  freq: number,
  dur: number,
  tipo: OscillatorType = 'sine',
  volume: number = 0.3,
  decay: boolean = true,
): void {
  const m = getMixer();
  if (!m) return;
  const osc = m.ctx.createOscillator();
  const gain = m.ctx.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  if (decay) gain.gain.exponentialRampToValueAtTime(0.001, m.ctx.currentTime + dur);
  osc.connect(gain);
  const catNode = getCategoriaNode(categoria);
  if (!catNode) return;
  gain.connect(catNode);
  osc.start(m.ctx.currentTime);
  osc.stop(m.ctx.currentTime + dur);
}

function tocarRuido(categoria: AudioCategoria, dur: number, volume = 0.2): void {
  const m = getMixer();
  if (!m) return;
  const bufferSize = m.ctx.sampleRate * dur;
  const buffer = m.ctx.createBuffer(1, bufferSize, m.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  const src = m.ctx.createBufferSource();
  src.buffer = buffer;
  const gain = m.ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain);
  const catNode = getCategoriaNode(categoria);
  if (!catNode) return;
  gain.connect(catNode);
  src.start();
}
```

### 2.3 Classificação das funções existentes

Cada `somX` em `src/audio/som.ts` passa a especificar sua categoria:

| Função                  | Categoria | Por quê                                  |
|-------------------------|-----------|------------------------------------------|
| `somClique`             | `ui`      | Click/hover de botões HUD                |
| `somEnvio`              | `sfx`     | Envio de nave — ação de gameplay         |
| `somExplosao`           | `sfx`     | Destruição/combate                       |
| `somConquista`          | `sfx`     | Colonizar planeta — evento forte         |
| `somVitoria`            | `aviso`   | Fim de jogo, notificação grande          |
| `somDerrota`            | `aviso`   | Fim de jogo                              |
| `somConstrucaoCompleta` | `aviso`   | Milestone, "alerta de atenção"           |
| `somPesquisaCompleta`   | `aviso`   | Milestone                                |
| `somNaveProducida`      | `sfx`     | Evento de gameplay frequente             |

Exemplo:

```ts
export function somClique(): void {
  tocar('ui', 800, 0.08, 'square', 0.15);
  setTimeout(() => tocar('ui', 1200, 0.06, 'square', 0.1), 30);
}

export function somEnvio(): void {
  tocar('sfx', 300, 0.3, 'sawtooth', 0.15);
  setTimeout(() => tocar('sfx', 500, 0.2, 'sawtooth', 0.1), 50);
  setTimeout(() => tocar('sfx', 700, 0.15, 'sawtooth', 0.08), 100);
}
```

### 2.4 Arquivos afetados (áudio)

- **Novo**: `src/audio/mixer.ts`
- **Modificado**: `src/audio/som.ts` — toda `somX` ganha categoria explícita

---

## 3. Gráficos — níveis de qualidade

### 3.1 Slider "Qualidade" → preset de flags

Slider único com 4 posições (`alto` / `medio` / `baixo` / `minimo`) que mapeia pra um preset de flags concretas armazenadas em `config.graphics`.

| Flag                  | Alto   | Médio  | Baixo         | Mínimo        |
|-----------------------|--------|--------|---------------|---------------|
| `fogThrottle`         | 1      | 2      | 3             | 0 (off)       |
| `maxFantasmas`        | -1 (∞) | 30     | 15            | 0             |
| `densidadeStarfield`  | 1.0    | 0.7    | 0.4           | 0.15          |
| `shaderLive`          | true   | true   | false (baked) | false (baked) |
| `mostrarOrbitas`      | true   | true   | true          | false         |

**Importante**: o slider de Qualidade sobrescreve **apenas essas 5 flags**. Scanlines, FPS cap, Fullscreen e Mostrar FPS são toggles **independentes** (Seção 3.4) — o slider não mexe neles. Quando o usuário mexe numa das 5 flags derivadas individualmente em "Avançado", o dropdown do slider mostra "(personalizado)" pra sinalizar divergência.

**Convenção de sentinelas**: `fogThrottle: 0` significa fog desligado (sem canvas). `maxFantasmas: -1` significa ilimitado. `maxFantasmas: 0` significa desligado. `fpsCap: 0` significa sem limite.

### 3.2 Semântica de cada flag

**`fogThrottle: number`** — existe hoje em `src/ui/debug.ts:35` (`config.fogThrottle`). Número de frames entre redraws do canvas do fog. Valores altos = fog "granulado" mas muito barato. `0` = fog desligado completamente (sem canvas).

**`maxFantasmas: number`** — novo. Limite máximo de planetas "lembrados" renderizados simultaneamente na camada de memória. `-1` = ilimitado. `0` = desligado. Pool ordenado por `timestamp` desc, apenas top-N renderizam. Os excedentes continuam no `WeakMap` — persistência intacta, só não renderizam. Isso é "quantitativo" no sentido que o jogo ainda lembra de todos os planetas descobertos (fundamental pra gameplay), mas só mostra os N mais recentes visualmente.

**`densidadeStarfield: number`** — novo. Fator 0.0–1.0 multiplicando o número de estrelas geradas em `criarFundo`. Mudança exige recriar o fundo (barato, one-shot). Aplicado em `src/world/fundo.ts`.

**`shaderLive: boolean`** — novo. Quando `true`, shaders procedurais de planeta/estrela rodam em cada frame via `atualizarTempoPlanetas`/`atualizarLuzPlaneta` em `src/world/planeta-procedural.ts`. Quando `false`, o shader roda uma vez na criação com `uTime = 0` (valor determinístico fixo, não `performance.now()`), o resultado é capturado como `RenderTexture` via `app.renderer.generateTexture(mesh)`, e o `Sprite` final usa essa textura baked. **Runtime: zero custo de shader, só sprite render normal**. Tradeoff: animações de superfície de planeta e pulso de estrela ficam **congeladas** (visual estático preservado, movimento ausente). O `uTime = 0` fixo garante que o bake seja determinístico — a mesma seed de geração produz o mesmo visual em toda sessão. Requer reload pra aplicar porque exige recriar todos os sprites com a nova estratégia.

**Referência de API existente**: `src/ui/planet-panel.ts:~555` já usa `app.renderer.generateTexture` no projeto, então a API é conhecida por funcionar no Pixi 8 do projeto.

**`mostrarOrbitas: boolean`** — controla `planeta._linhaOrbita.visible`. Quando `false`, todas as linhas de órbita ficam escondidas sem destruir os objetos Graphics.

**`scanlines: boolean`** — lido pelo loading screen (já existe como efeito fixo) e por um novo overlay CRT sobre o HUD (opcional, só se usuário ativar).

**`fpsCap: number`** — setado em `app.ticker.maxFPS`. `0` = sem limite. Pixi respeita o cap na main thread.

### 3.3 Motor de renderização

Controle independente do slider de Qualidade (escolha do usuário, não do preset).

```ts
graphics.renderer: 'webgl' | 'webgpu';              // default 'webgl'
graphics.webglVersion: 'auto' | '1' | '2';          // só aplica se renderer === 'webgl'
graphics.gpuPreference: 'auto' | 'high-performance' | 'low-power';
```

**`renderer`**: passa em `app.init` como `preference: 'webgl' | 'webgpu'`. Pixi 8 suporta ambos backends. (Pixi 8 também ainda tem Canvas renderer, mas não é exposto como opção pro usuário porque é depreciado e tem feature set limitado — nem todos os shaders funcionam.)

**`webglVersion`**: `'auto'` deixa o Pixi escolher (prefere WebGL 2 internamente, cai pra WebGL 1 se o hardware não suportar). `'1'` ou `'2'` forçam uma versão específica criando o canvas e contexto manualmente antes do `app.init`:

```ts
// CAVEAT: app.init({ context }) é tipado como WebGL2RenderingContext em
// Pixi 8. Passar WebGL 1 exige cast `as any`. O comportamento em runtime
// é best-effort — o Pixi usa o contexto fornecido pra criar o renderer.
// Testar empiricamente em cada mudança de versão do Pixi.
if (gfx.renderer === 'webgl' && gfx.webglVersion !== 'auto') {
  const canvas = document.createElement('canvas');
  const ctxOpts: WebGLContextAttributes = {
    antialias: true,
    premultipliedAlpha: true,
  };
  if (gfx.gpuPreference !== 'auto') {
    ctxOpts.powerPreference = gfx.gpuPreference;
  }
  const gl = gfx.webglVersion === '1'
    ? canvas.getContext('webgl', ctxOpts)
    : canvas.getContext('webgl2', ctxOpts);
  if (gl) {
    baseInit.context = gl as any;        // cast intencional
    baseInit.canvas = canvas as any;     // cast intencional (ICanvas)
  } else {
    console.warn(`[renderer] WebGL ${gfx.webglVersion} indisponível, caindo pra auto`);
    setConfig({ graphics: { ...gfx, webglVersion: 'auto' } });
    // Reinicia com auto (o fluxo retry é parte do fallback chain abaixo)
  }
}
```

**Verificação de viabilidade no plano**: a tarefa que implementa este trecho deve começar com um spike de 30 minutos — criar um canvas, pegar um contexto WebGL 1 e passar pro `app.init`. Se o Pixi 8 rejeitar em runtime (não só no typecheck), **remove a opção "WebGL 1 forçado"** da UI e deixa só `auto` e `2` (que são tipos-consistentes porque WebGL 2 é `WebGL2RenderingContext`). O plano deve documentar esse spike como pré-requisito.

**`gpuPreference`**: passa em `app.init` como `powerPreference`. Em laptops dual-GPU, `'high-performance'` força a GPU discreta, `'low-power'` força a integrada. **Quando `gpuPreference === 'auto'`, o campo é omitido** do `initOpts` (não passado como `'default'` — Pixi 8 tipa o campo apenas `'high-performance' | 'low-power'`, e o comportamento default do browser já é o desejado).

**Fallback chain** no boot:

```ts
const baseInit: any = {
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x000000,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
  antialias: true,
};
if (gfx.gpuPreference !== 'auto') {
  baseInit.powerPreference = gfx.gpuPreference;
}

// Import-time flag: set direct on the module to pular observer durante boot.
// Listeners do mixer/preset/etc podem tentar tocar em coisas não-inicializadas.
// setConfigDuranteBoot escreve direto no _cache e localStorage sem disparar observer.
async function bootInit(): Promise<void> {
  try {
    await app.init({ ...baseInit, preference: gfx.renderer });
  } catch (err) {
    if (gfx.renderer === 'webgpu') {
      console.warn('[renderer] WebGPU failed, falling back to WebGL:', err);
      setConfigDuranteBoot({ graphics: { ...gfx, renderer: 'webgl' } });
      await app.init({ ...baseInit, preference: 'webgl' });
      window.setTimeout(
        () => toast('WebGPU indisponível — usando WebGL', 'err'),
        2000,
      );
      return;
    }
    // Se o usuário forçou WebGL 2 ou WebGL 1 e falhou, volta pra auto
    if (gfx.renderer === 'webgl' && gfx.webglVersion !== 'auto') {
      console.warn(`[renderer] WebGL ${gfx.webglVersion} forçado falhou, caindo pra auto:`, err);
      setConfigDuranteBoot({ graphics: { ...gfx, webglVersion: 'auto' } });
      // Remove o context manual se estava no baseInit
      delete baseInit.context;
      delete baseInit.canvas;
      await app.init({ ...baseInit, preference: 'webgl' });
      window.setTimeout(
        () => toast(`WebGL ${gfx.webglVersion} indisponível — usando automático`, 'err'),
        2000,
      );
      return;
    }
    throw err;
  }
}
await bootInit();
```

**`setConfigDuranteBoot`**: variante de `setConfig` exportada por `src/core/config.ts` que atualiza `_cache` + escreve no localStorage mas **não dispara listeners**. Usada exclusivamente no caminho de boot antes dos listeners estarem prontos. Evita race entre fallback de renderer e observers parcialmente inicializados.

### 3.4 Toggles isolados (independentes do slider)

Além do slider de Qualidade, 4 toggles diretos na aba Gráficos:

1. **Fullscreen** — chama `document.documentElement.requestFullscreen()` / `document.exitFullscreen()`. **Deve ser chamado sincronamente dentro do event handler do checkbox**, não via observer — o gesto do usuário só vale dentro do callback original. Se for invocado via listener do observer pattern, o browser rejeita.
2. **Scanlines CRT** — pode ser ligado/desligado independente do preset.
3. **Mostrar FPS no canto** — adiciona um pequeno contador no HUD.
4. **Limite de FPS** — dropdown 30 / 60 / 120 / Sem limite.

Mudar o slider de Qualidade **não** mexe nesses 4 toggles — eles são preferências totalmente independentes. A tabela da seção 3.1 contém apenas as 5 flags derivadas do preset (`fogThrottle`, `maxFantasmas`, `densidadeStarfield`, `shaderLive`, `mostrarOrbitas`).

### 3.5 Migration da chave legada

O debug menu hoje (`src/ui/debug.ts`) salva `localStorage['renderer']` numa chave solta. No primeiro `load()` do config novo, se essa chave existir, migra pro `config.graphics.renderer` e apaga a chave antiga:

```ts
function migrarChavesLegadas(): void {
  const renderer = localStorage.getItem('renderer');
  if (renderer === 'webgl' || renderer === 'webgpu') {
    const cfg = getConfig();
    setConfig({ graphics: { ...cfg.graphics, renderer } });
    localStorage.removeItem('renderer');
  }
}
```

Depois da migration, o debug menu continua funcionando mas lendo do `config` — removemos o dropdown de renderer do debug menu (agora é setting de usuário, não de debug).

### 3.6 Arquivos afetados (gráficos)

- **Novo**: `src/core/graphics-preset.ts` — função `aplicarPreset(nivel)`
- **Modificado**: `src/main.ts` — passa `preference`, `powerPreference`, context manual pro `app.init`
- **Modificado**: `src/world/fundo.ts` — consome `densidadeStarfield`
- **Modificado**: `src/world/nevoa.ts` — consome `fogThrottle`, `maxFantasmas`
- **Modificado**: `src/world/mundo.ts` — consome `mostrarOrbitas` no loop de rendering
- **Modificado**: `src/world/planeta-procedural.ts` — adiciona path de baking pra shader on/off
- **Modificado**: `src/ui/debug.ts` / `debug-menu.ts` — remove dropdown de renderer (migração completa pro settings-panel)

---

## 4. Gameplay — 2 toggles

### 4.1 Confirmar ações destrutivas

`config.gameplay.confirmarDestrutivo: boolean` (default `true`).

**Onde aplica**: sucatear nave, apagar save da lista, voltar ao menu. Novo helper `src/ui/confirmar-acao.ts`:

```ts
import { getConfig } from '../core/config';

export function confirmarAcao(msg: string, onConfirm: () => void): void {
  if (!getConfig().gameplay.confirmarDestrutivo) {
    onConfirm();
    return;
  }
  if (window.confirm(msg)) onConfirm();
}
```

(A implementação atual usa `window.confirm`; uma versão polida com `confirm-dialog.ts` existente pode substituir depois sem mudar a API.)

**Sites convertidos**:

- `src/world/naves.ts` → `sucatearNave` — envolver em `confirmarAcao('Sucatear nave?', () => ...)`
- `src/ui/main-menu.ts` → delete save card — substituir `confirm(...)` por `confirmarAcao`
- `src/ui/sidebar.ts` → Voltar ao Menu — substituir `confirm(...)` por `confirmarAcao`

Quando `confirmarDestrutivo === false`, click executa direto sem diálogo.

### 4.2 Edge-scroll

`config.gameplay.edgeScroll: boolean` (default `false`).

**Implementação**: `src/core/player.ts` ganha um listener de `mousemove` que mede a distância do cursor às bordas da viewport. Se < 40px da borda e `edgeScroll === true` e `_gameStarted === true`, empurra `camera.x/y` proporcional à distância. Velocidade base ~800 world units/segundo na borda máxima.

**Pegadinha — conflito com painéis**: quando o usuário abre um painel HUD (planet-panel, ship-panel, etc.), ele pode querer mover o cursor sobre o painel sem a câmera começar a rolar. Solução: marcar todos os containers HUD com `data-ui="true"` via atributo DOM; o listener de mousemove checa `(e.target as HTMLElement)?.closest('[data-ui="true"]')` e desativa edge-scroll se estiver dentro.

**Requisito crítico de CSS**: todos os containers marcados `data-ui="true"` precisam ter `pointer-events: auto` (default de `div`, mas verifique — alguns overlays decorativos usam `pointer-events: none` pra "deixar clicks passarem"). Se um container HUD tem `pointer-events: none`, o `e.target` vai ignorá-lo e pular pro canvas atrás, quebrando o gate do edge-scroll. Na prática: **o container raiz de cada painel HUD tem `pointer-events: auto`**; sub-elementos decorativos podem ter `none` sem afetar o gate porque o teste `closest()` sobe a árvore até achar um ancestral correspondente.

**Arquivos afetados**: `src/core/player.ts` (listener), `src/ui/planet-panel.ts`, `src/ui/ship-panel.ts`, `src/ui/build-panel.ts`, `src/ui/colonizer-panel.ts`, `src/ui/sidebar.ts`, `src/ui/settings-panel.ts`, `src/ui/new-world-modal.ts`, `src/ui/renderer-info-modal.ts`, `src/ui/colony-modal.ts`, `src/ui/confirm-dialog.ts` (todos ganham `data-ui="true"` no container raiz).

---

## 5. Fix do viewport culling

### 5.1 Diagnóstico

Arquivo: `src/world/mundo.ts` linhas 205–217 (dentro de `atualizarMundo`). O código atual:

```ts
const margem = 600 / zoom;
const esq = camera.x - margem;
const dir = camera.x + app.screen.width / zoom + margem;
const cima = camera.y - margem;
const baixo = camera.y + app.screen.height / zoom + margem;
```

A transform da câmera em `src/main.ts` linha 130 é:

```ts
container.x = -camera.x * camera.zoom + app.screen.width / 2;
container.y = -camera.y * camera.zoom + app.screen.height / 2;
```

Esse `+ app.screen.width / 2` faz com que `camera.x/y` seja **o ponto do mundo abaixo do centro da tela**. O bug no bloco de bounds: ele trata `camera.x/y` como se fosse o canto superior-esquerdo da viewport — então `esq = camera.x - 600` (só uma margem pequena à esquerda do centro) e `dir = camera.x + screen.width/zoom + 600` (tela inteira à direita do centro).

**Consequência**: o retângulo de culling fica deslocado pela metade da largura da viewport pra direita e pela metade da altura pra baixo. Metade visível (esquerda/topo) é culled cedo demais; metade fora (direita/baixo) continua marcada como visível. Resultado: flickering no pan + GPU renderizando o que não se vê.

O mesmo bug está em:

- **`src/world/fundo.ts:73–78`** — `atualizarFundo` é chamado por `mundo.ts` com `camX = camera.x + app.screen.width / 2` (mix de world + pixel coords). Dentro da função ela subtrai `telaW/2` de volta, o que **mascara parcialmente** o offset em `zoom=1` mas não em outros zooms. Além disso as dimensões `telaW/H` são passadas em **pixels** quando deveriam ser em **world units** — o starfield culling só funciona correto em `zoom=1`.
- **`src/world/mundo-menu.ts:98`** — `atualizarMundoMenu` também chama `atualizarFundo`. Aqui o `camX/camY` já são centro-relativos (recebidos corretos de `main.ts:133`), mas as dimensões passam como `app.screen.width` e `app.screen.height` em pixels. Como o menu roda em `zoom ~ 0.55`, o culling do starfield menu tá errado. Precisa ser alterado pra passar world units (`app.screen.width / zoom`).
- **`src/world/nevoa.ts:295–298`** — `desenharNeblinaVisao` usa `worldX = camera.x - margem` como top-left do canvas de fog, mesmo erro de centro-vs-top-left.

### 5.2 Fix — função pura extraída

Novo arquivo: `src/world/viewport-bounds.ts`.

```ts
export interface ViewportBounds {
  esq: number;
  dir: number;
  cima: number;
  baixo: number;
  halfW: number;
  halfH: number;
  margem: number;
}

export function calcularBoundsViewport(
  camX: number,
  camY: number,
  zoom: number,
  screenW: number,
  screenH: number,
  margemMin: number = 600,
  margemMultiplier: number = 0,
): ViewportBounds {
  const z = zoom || 1;
  const halfW = screenW / (2 * z);
  const halfH = screenH / (2 * z);
  // Margem composta de três termos — usa o maior:
  //   1. margemMin: piso absoluto em world units (default 600)
  //   2. halfW * 0.5: proporcional à meia-largura (25% de cada lado)
  //   3. margemMultiplier / z: buffer zoom-scaled (legado da nevoa, onde
  //      a margem cresce conforme o usuário afasta — fog precisa escalar
  //      assim pra não aparecer bordas ao panning em zoom out)
  const margem = Math.max(
    margemMin,
    halfW * 0.5,
    margemMultiplier > 0 ? margemMultiplier / z : 0,
  );
  return {
    halfW,
    halfH,
    margem,
    esq: camX - halfW - margem,
    dir: camX + halfW + margem,
    cima: camY - halfH - margem,
    baixo: camY + halfH + margem,
  };
}
```

Função **pura**, testável sem Pixi.

### 5.3 Aplicação em `mundo.ts`

Substitui o bloco de 213–217 por:

```ts
import { calcularBoundsViewport } from './viewport-bounds';

// ... dentro de atualizarMundo:
const bounds = calcularBoundsViewport(
  camera.x,
  camera.y,
  camera.zoom,
  app.screen.width,
  app.screen.height,
);
const { esq, dir, cima, baixo } = bounds;
```

E a chamada a `atualizarFundo` vira:

```ts
atualizarFundo(
  mundo.fundo,
  camera.x,
  camera.y,
  app.screen.width / (camera.zoom || 1),   // largura em world units
  app.screen.height / (camera.zoom || 1),  // altura em world units
);
```

### 5.4 Aplicação em `fundo.ts`

`atualizarFundo` hoje usa `jogadorX - telaW / 2` — tratamento center-relative que **já está correto**. O bug tava no caller que passava coordenadas erradas. Depois do fix do mundo.ts, `fundo.ts` funciona sem mudança de lógica.

**Porém**, vale limpar o comentário do arquivo pra documentar que `telaW/H` é em **world units** (já é hoje, mas não tá explícito). Adicionar JSDoc:

```ts
/**
 * @param jogadorX Centro da viewport em coordenadas de mundo.
 * @param jogadorY Centro da viewport em coordenadas de mundo.
 * @param telaW Largura da viewport em unidades de MUNDO (= screen.width / zoom).
 * @param telaH Altura da viewport em unidades de MUNDO.
 */
export function atualizarFundo(
  fundo: FundoContainer,
  jogadorX: number,
  jogadorY: number,
  telaW: number,
  telaH: number,
): void { ... }
```

### 5.5 Aplicação em `nevoa.ts`

Usa `calcularBoundsViewport` com `margemMultiplier = 1500` pra preservar exatamente o comportamento original. O código atual em `nevoa.ts:293` calcula `margem = 1500 * invZoom` — ou seja, a margem **cresce** quando o zoom out aumenta. Em `zoom=1` dá 1500; em `zoom=0.5` dá 3000. Essa escala é essencial pra o fog canvas não mostrar bordas durante panning em zoom-out.

O parâmetro `margemMultiplier` em `calcularBoundsViewport` implementa exatamente essa semântica — quando setado, contribui `margemMultiplier / z` à margem final (junto com o piso `margemMin` e o proporcional `halfW * 0.5`).

```ts
import { calcularBoundsViewport } from './viewport-bounds';

// Dentro de desenharNeblinaVisao:
// margemMin=0 (não usa piso), margemMultiplier=1500 (replica margem original)
const bounds = calcularBoundsViewport(
  camera.x, camera.y, zoom, screenW, screenH,
  0,        // margemMin
  1500,     // margemMultiplier — margem_fog = 1500 / zoom
);
const worldX = bounds.esq;
const worldY = bounds.cima;
const worldW = bounds.dir - bounds.esq;
const worldH = bounds.baixo - bounds.cima;
```

O culling geral (mundo.ts) usa `margemMin=600` sem multiplier — margem constante + proporcional à tela. O fog (nevoa.ts) usa `margemMultiplier=1500` sem piso — margem escala com zoom. Sites diferentes, necessidades diferentes, mesma função pura.

### 5.6 Testes unitários

Novo arquivo: `src/world/__tests__/viewport-bounds.test.ts`.

```ts
import { describe, it, expect } from 'vitest';
import { calcularBoundsViewport } from '../viewport-bounds';

describe('calcularBoundsViewport', () => {
  it('camera at origin produces bounds centered on origin', () => {
    const b = calcularBoundsViewport(0, 0, 1, 1920, 1080);
    expect(b.esq).toBeLessThan(0);
    expect(b.dir).toBeGreaterThan(0);
    expect(b.esq + b.dir).toBeCloseTo(0);
    expect(b.cima + b.baixo).toBeCloseTo(0);
  });

  it('bounds include the full viewport plus margem on each side', () => {
    const b = calcularBoundsViewport(0, 0, 1, 1920, 1080);
    expect(b.dir - b.esq).toBeGreaterThanOrEqual(1920);
    expect(b.baixo - b.cima).toBeGreaterThanOrEqual(1080);
  });

  it('zoom out expands bounds proportionally', () => {
    const b1 = calcularBoundsViewport(0, 0, 1, 1920, 1080);
    const b2 = calcularBoundsViewport(0, 0, 0.5, 1920, 1080);
    expect(b2.dir - b2.esq).toBeGreaterThan(b1.dir - b1.esq);
  });

  it('camera offset shifts bounds without changing size', () => {
    const b0 = calcularBoundsViewport(0, 0, 1, 1920, 1080);
    const b1 = calcularBoundsViewport(1000, 500, 1, 1920, 1080);
    expect((b1.esq + b1.dir) / 2).toBeCloseTo(1000, -1);
    expect((b1.cima + b1.baixo) / 2).toBeCloseTo(500, -1);
    expect(b1.dir - b1.esq).toBeCloseTo(b0.dir - b0.esq);
  });

  it('minimum margem defaults to 600 world units', () => {
    const b = calcularBoundsViewport(0, 0, 10, 100, 100);
    expect(b.margem).toBeGreaterThanOrEqual(600);
  });

  it('custom margemMin parameter overrides the default', () => {
    const b = calcularBoundsViewport(0, 0, 10, 100, 100, 1500);
    expect(b.margem).toBeGreaterThanOrEqual(1500);
  });
});
```

### 5.7 Arquivos afetados (viewport fix)

- **Novo**: `src/world/viewport-bounds.ts`
- **Novo**: `src/world/__tests__/viewport-bounds.test.ts`
- **Modificado**: `src/world/mundo.ts` — substitui bloco de bounds + call site do fundo
- **Modificado**: `src/world/fundo.ts` — só JSDoc esclarecendo world-units
- **Modificado**: `src/world/mundo-menu.ts` — ajusta call site de `atualizarFundo` pra passar centro + world units (corrige bug compensatório herdado)
- **Modificado**: `src/world/nevoa.ts` — usa `calcularBoundsViewport` com `margemMultiplier=1500` (ver §5.5)

---

## 6. Extensão do `config.ts`

### 6.1 Shape completo

```ts
export interface OrbitalConfig {
  // Do Save/Load (spec 1, já existente)
  autosaveIntervalMs: number;
  saveMode: 'periodic' | 'experimental';

  // Audio
  audio: {
    master: { volume: number; muted: boolean };
    sfx:    { volume: number; muted: boolean };
    ui:     { volume: number; muted: boolean };
    aviso:  { volume: number; muted: boolean };
  };

  // Graphics
  graphics: {
    qualidadeEfeitos: 'alto' | 'medio' | 'baixo' | 'minimo';
    // Independentes (não tocados pelo preset):
    fullscreen: boolean;
    scanlines: boolean;
    mostrarFps: boolean;
    fpsCap: number;                              // 0 = sem limite
    renderer: 'webgl' | 'webgpu';
    webglVersion: 'auto' | '1' | '2';            // só aplica se renderer === 'webgl'
    gpuPreference: 'auto' | 'high-performance' | 'low-power';
    // Derivadas do preset (overrideáveis):
    mostrarOrbitas: boolean;
    fogThrottle: number;                         // 0 = fog desligado
    maxFantasmas: number;                        // -1 = ilimitado, 0 = nenhum
    densidadeStarfield: number;                  // 0.0–1.0
    shaderLive: boolean;                         // false = baked
  };

  // Gameplay
  gameplay: {
    confirmarDestrutivo: boolean;
    edgeScroll: boolean;
  };
}
```

### 6.2 Defaults

```ts
const DEFAULTS: OrbitalConfig = {
  autosaveIntervalMs: 60000,
  saveMode: 'periodic',
  audio: {
    master: { volume: 0.8, muted: false },
    sfx:    { volume: 1.0, muted: false },
    ui:     { volume: 0.7, muted: false },
    aviso:  { volume: 1.0, muted: false },
  },
  graphics: {
    qualidadeEfeitos: 'alto',
    fullscreen: false,
    scanlines: true,
    mostrarFps: false,
    fpsCap: 0,
    renderer: 'webgl',
    webglVersion: 'auto',
    gpuPreference: 'auto',
    mostrarOrbitas: true,
    fogThrottle: 1,
    maxFantasmas: -1,
    densidadeStarfield: 1.0,
    shaderLive: true,
  },
  gameplay: {
    confirmarDestrutivo: true,
    edgeScroll: false,
  },
};
```

### 6.3 Preset → flags

`src/core/graphics-preset.ts`:

```ts
import type { OrbitalConfig } from './config';
import { getConfig, setConfig } from './config';

type Nivel = OrbitalConfig['graphics']['qualidadeEfeitos'];
type FlagsDerivadas = Pick<
  OrbitalConfig['graphics'],
  'fogThrottle' | 'maxFantasmas' | 'densidadeStarfield' | 'shaderLive' | 'mostrarOrbitas'
>;

const PRESETS: Record<Nivel, FlagsDerivadas> = {
  alto: {
    fogThrottle: 1,
    maxFantasmas: -1,
    densidadeStarfield: 1.0,
    shaderLive: true,
    mostrarOrbitas: true,
  },
  medio: {
    fogThrottle: 2,
    maxFantasmas: 30,
    densidadeStarfield: 0.7,
    shaderLive: true,
    mostrarOrbitas: true,
  },
  baixo: {
    fogThrottle: 3,
    maxFantasmas: 15,
    densidadeStarfield: 0.4,
    shaderLive: false,
    mostrarOrbitas: true,
  },
  minimo: {
    fogThrottle: 0,
    maxFantasmas: 0,
    densidadeStarfield: 0.15,
    shaderLive: false,
    mostrarOrbitas: false,
  },
};

export function aplicarPreset(nivel: Nivel): void {
  const preset = PRESETS[nivel];
  const cfg = getConfig();
  setConfig({
    graphics: {
      ...cfg.graphics,
      ...preset,
      qualidadeEfeitos: nivel,
    },
  });
}

/**
 * Retorna true se as 5 flags derivadas do preset (fogThrottle,
 * maxFantasmas, densidadeStarfield, shaderLive, mostrarOrbitas)
 * batem com o preset indicado por `qualidadeEfeitos`. Retorna false
 * se houver qualquer divergência (usuário customizou manualmente).
 *
 * NÃO considera as flags independentes (scanlines, fpsCap, etc).
 */
export function presetBateComFlagsDerivadas(cfg: OrbitalConfig): boolean {
  const esperado = PRESETS[cfg.graphics.qualidadeEfeitos];
  for (const k of Object.keys(esperado) as Array<keyof FlagsDerivadas>) {
    if (cfg.graphics[k] !== esperado[k]) return false;
  }
  return true;
}
```

O `presetBateComFlagsDerivadas` é usado pela UI pra mostrar "(personalizado)" no dropdown quando os valores divergem. **Nome canônico em todo o spec**: `presetBateComFlagsDerivadas` (não `presetAtualBate` nem variantes).

### 6.4 Observer pattern

```ts
// Em src/core/config.ts

/** DeepPartial: torna todos os campos nested opcionais. */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type ConfigListener = (cfg: OrbitalConfig) => void;
const _listeners = new Set<ConfigListener>();

// Reentrance guard: se um listener chamar setConfig de volta, rejeitamos
// com erro logado. Isso é intencionalmente restritivo — nenhum listener
// do projeto (mixer, graphics-preset, player.ts, main.ts) tem motivo
// legítimo pra reentrar. Um erro logado facilita diagnóstico quando
// alguém introduz um loop acidental; solução correta é refatorar o
// listener, não tornar reentrância OK.
let _notifying = false;

export function onConfigChange(fn: ConfigListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function setConfig(partial: DeepPartial<OrbitalConfig>): void {
  if (_notifying) {
    console.error('[config] reentrant setConfig — ignored. Listener bug:', partial);
    return;
  }
  _cache = mergeDeep(getConfig(), partial);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
  } catch (err) {
    console.warn('[config] persist failed:', err);
  }
  _notifying = true;
  try {
    // Snapshot antes de iterar: listeners podem unsubscrever durante o notify
    // e Set.forEach com mutação é fragil.
    const snapshot = Array.from(_listeners);
    for (const fn of snapshot) {
      try { fn(_cache); } catch (err) { console.error('[config] listener error:', err); }
    }
  } finally {
    _notifying = false;
  }
}

/**
 * Variante usada exclusivamente no caminho de boot de `main.ts`, antes
 * de qualquer listener estar attached. Atualiza o cache + localStorage
 * mas NÃO dispara observers. Isso evita race entre o fallback chain do
 * renderer (§3.3) e observers parcialmente inicializados.
 *
 * NÃO usar em fluxos normais de runtime.
 */
export function setConfigDuranteBoot(partial: DeepPartial<OrbitalConfig>): void {
  _cache = mergeDeep(getConfig(), partial);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
  } catch (err) {
    console.warn('[config] boot persist failed:', err);
  }
}
```

Consumidores:

- **`mixer.ts`**: listener que chama `aplicarConfigAtual()` quando `audio` muda.
- **`graphics-preset.ts`**: listener que aplica flags derivadas (fpsCap no ticker, orbitas visible, etc).
- **`player.ts`**: listener que liga/desliga edge-scroll.
- **`main.ts`**: listener que ajusta `app.ticker.maxFPS` quando `graphics.fpsCap` muda.

### 6.5 Merge com defaults e migration

```ts
function load(): OrbitalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    const merged = mergeDeep(DEFAULTS, parsed);
    migrarChavesLegadas(merged);
    return merged;
  } catch {
    return deepClone(DEFAULTS);
  }
}

function mergeDeep<T>(base: T, over: any): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k in over) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeDeep((base as any)?.[k] ?? {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function migrarChavesLegadas(cfg: OrbitalConfig): void {
  const legacyRenderer = localStorage.getItem('renderer');
  if (legacyRenderer === 'webgl' || legacyRenderer === 'webgpu') {
    cfg.graphics.renderer = legacyRenderer;
    localStorage.removeItem('renderer');
  }
}
```

`mergeDeep` protege contra saves antigos (do Save/Load spec) que não têm as chaves novas — os campos faltantes herdam o default automaticamente, sem migration explícita.

### 6.6 Arquivos afetados (config)

- **Modificado**: `src/core/config.ts` — expande com shape completo, observer pattern, mergeDeep, migration
- **Novo**: `src/core/graphics-preset.ts` — presets + `aplicarPreset` + `presetBateComFlagsDerivadas`

---

## 7. Tela de Configurações (UI)

### 7.1 Layout com abas

O `settings-panel.ts` provisório (criado no Save/Load spec) é reescrito. Nova estrutura:

```
┌─────────────────────────────────────────────────┐
│  CONFIGURAÇÕES                               ✕  │
├─────────────────────────────────────────────────┤
│  [ ÁUDIO ] [ GRÁFICOS ] [ JOGABILIDADE ]        │  ← tabs
├─────────────────────────────────────────────────┤
│                                                 │
│   (conteúdo da aba ativa)                       │
│                                                 │
├─────────────────────────────────────────────────┤
│  [ Resetar esta aba ]      [ Resetar tudo ]     │
└─────────────────────────────────────────────────┘
```

Arquivo: reescrita de `src/ui/settings-panel.ts`. API pública:

```ts
export function abrirSettings(): void;
export function fecharSettings(): void;
```

O `main-menu.ts` passa a chamar `abrirSettings()` em vez do stub antigo. A sidebar in-game ganha um botão "Configurações" que também chama `abrirSettings()`. **Mesma função, dois call sites** — sem duplicação.

Quando aberto in-game, o jogo **continua rodando por trás** (overlay, sem pause). Fecha com click fora do card ou tecla Escape.

### 7.2 Aba Áudio

Layout simples — 4 blocos idênticos:

```
Master           [━━━━━━●━━] 80%    [ 🔊 ]
SFX Jogo         [━━━━━━━━━●] 100%  [ 🔊 ]
SFX UI           [━━━━━●━━━━] 70%   [ 🔊 ]
Avisos           [━━━━━━━━━●] 100%  [ 🔊 ]
```

Cada bloco tem label, range slider 0–100 e ícone de mute. Mudança no slider dispara `setConfig({ audio: { [cat]: { volume: v/100 } } })` imediatamente — sem debounce. GainNode atualiza live via observer pattern.

Click no ícone alterna `muted`. Mutar preserva o valor real do volume (pra unmute voltar ao mesmo).

### 7.3 Aba Gráficos

Layout em 3 blocos: **Básico**, **Motor**, **Avançado**.

```
━━━ Básico ━━━
Qualidade                    [ Alto ▼ ]                (?)
                             (personalizado)          ← se divergir

Fullscreen                   [ ☐ ]                     (?)
Scanlines CRT                [ ☑ ]                     (?)
Mostrar FPS                  [ ☐ ]                     (?)
Limite de FPS                [ Sem limite ▼ ]          (?)

━━━ Motor ━━━
Motor de renderização        [ WebGL ▼ ]               (?)
  Versão do WebGL            [ Automático ▼ ]          (?)   ← só se WebGL
Preferência de GPU           [ Automático ▼ ]          (?)

[ Ver informações do renderer ]                        (?)

━━━ Avançado ━━━
Mostrar órbitas              [ ☑ ]                     (?)
Densidade de estrelas        [━━━●━━] 70%              (?)
Max fantasmas                [ Ilimitado ▼ ]           (?)
Shader ao vivo               [ ☑ ]                     (?)
```

**Banner "Requer recarregar"**: aparece inline abaixo de qualquer controle que exija reload pra aplicar. Texto: **"Requer recarregar o jogo. [Recarregar agora]"**. Click em "Recarregar agora" → `window.location.reload()`. Controles que disparam esse banner:

- Shader ao vivo (muda estratégia de sprite — exige recriar os sprites e swap pra RenderTexture baked)
- Motor de renderização (Pixi recria a pipeline inteira)
- Versão do WebGL (contexto criado manualmente antes do `app.init`)
- Preferência de GPU (browser só seleciona GPU em `getContext`/`requestAdapter`, exige reload)
- Densidade de estrelas (starfield é gerado uma vez na criação do mundo — mudar em runtime exigiria recriar todo o fundo e seus containers. Reload é mais simples e confiável)

**Fullscreen não usa banner**: o toggle chama `requestFullscreen()`/`exitFullscreen()` **sincronamente** dentro do handler do checkbox (o gesto de click é o que habilita a transição). Se o navegador rejeitar, toast de erro "Fullscreen bloqueado pelo navegador". **Crítico**: fullscreen **não pode** ser aplicado via observer pattern — o gesto só vale dentro do callback original. O listener do config observer é chamado *depois* que o gesto já se perdeu. Solução: o handler do checkbox chama `requestFullscreen` antes de chamar `setConfig`, e `setConfig` só persiste o estado.

### 7.4 Aba Jogabilidade

2 controles:

```
Confirmar ações destrutivas     [ ☑ ]                  (?)
Edge-scroll                     [ ☐ ]                  (?)
```

Todos live — `setConfig()` direto no change.

### 7.5 Botões de reset

- **Resetar esta aba**: aplica `setConfig` com os defaults só da seção ativa. Preserva as outras.
- **Resetar tudo**: `confirmarAcao('Resetar todas as configurações?', () => setConfig(DEFAULTS))`.

Ambos disparam os listeners, então o refresh visual é automático.

### 7.6 Tooltip mechanism

Novo arquivo: `src/ui/tooltip.ts`.

```ts
let _tip: HTMLDivElement | null = null;
let _styleInjected = false;

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ui-tooltip {
      position: fixed;
      max-width: 320px;
      background: rgba(0, 0, 0, 0.92);
      border: 1px solid var(--hud-border);
      color: var(--hud-text);
      font-family: var(--hud-font);
      font-size: calc(var(--hud-unit) * 0.75);
      line-height: 1.45;
      padding: calc(var(--hud-unit) * 0.6) calc(var(--hud-unit) * 0.8);
      pointer-events: none;
      z-index: 900;
      opacity: 0;
      white-space: pre-line;
      transition: opacity 140ms ease;
    }
    .ui-tooltip.show { opacity: 1; }
    .ui-help-icon {
      display: inline-block;
      width: calc(var(--hud-unit) * 1);
      height: calc(var(--hud-unit) * 1);
      line-height: calc(var(--hud-unit) * 1);
      text-align: center;
      border: 1px solid var(--hud-text-dim);
      border-radius: 50%;
      font-size: calc(var(--hud-unit) * 0.7);
      color: var(--hud-text-dim);
      cursor: help;
      margin-left: calc(var(--hud-unit) * 0.3);
    }
    .ui-help-icon:hover {
      color: var(--hud-text);
      border-color: var(--hud-text);
    }
  `;
  document.head.appendChild(s);
}

function ensureTip(): HTMLDivElement {
  if (_tip) return _tip;
  injectStyles();
  const t = document.createElement('div');
  t.className = 'ui-tooltip';
  document.body.appendChild(t);
  _tip = t;
  return t;
}

export function comHelp(label: HTMLElement, text: string): void {
  injectStyles();
  const icon = document.createElement('span');
  icon.className = 'ui-help-icon';
  icon.textContent = '?';
  icon.setAttribute('aria-label', text);
  icon.addEventListener('mouseenter', () => {
    const tip = ensureTip();
    tip.textContent = text;
    tip.classList.add('show');
    const rect = icon.getBoundingClientRect();
    tip.style.left = `${rect.right + 8}px`;
    tip.style.top = `${rect.top}px`;
  });
  icon.addEventListener('mouseleave', () => {
    _tip?.classList.remove('show');
  });
  label.appendChild(icon);
}
```

`pre-line` no CSS faz `\n` virar quebra de linha visível. `textContent` (não `innerHTML`) mantém seguro contra XSS.

### 7.7 Textos dos tooltips (aba Gráficos)

**Qualidade**:

```
Qualidade

Preset que ajusta múltiplas opções avançadas de
uma vez. Use 'Baixo' ou 'Mínimo' se o jogo estiver
travando.

Mostra '(personalizado)' quando você mexeu em
opções avançadas depois de escolher um preset.
```

**Fullscreen**:

```
Fullscreen

Alterna tela cheia. O navegador pode pedir
permissão na primeira vez.
```

**Scanlines CRT**:

```
Scanlines CRT

Efeito visual retrô com linhas horizontais
sobrepostas. Custo de desempenho: desprezível.
```

**Mostrar FPS**:

```
Mostrar FPS

Exibe o contador de quadros por segundo no canto
da tela. Útil pra diagnosticar queda de desempenho.
```

**Limite de FPS**:

```
Limite de FPS

Limita a taxa de quadros. Valores menores
economizam CPU/GPU e bateria em laptops.

'Sem limite' deixa o jogo rodar tão rápido quanto
o navegador permitir.
```

**Motor de renderização**:

```
Motor de renderização

Biblioteca gráfica que o jogo usa pra desenhar.

• WebGL
  Padrão estável. Funciona em todos os navegadores
  modernos e é a escolha segura.

• WebGPU
  Sucessor do WebGL, pode ser 20–40% mais rápido em
  hardware moderno. Exige navegador recente: Chrome
  e Edge atuais suportam bem; Firefox e Safari ainda
  têm suporte limitado.

• Fallback automático
  Se o WebGPU falhar ao iniciar, o jogo volta sozinho
  pro WebGL e avisa na tela.

Mudança exige recarregar o jogo.
```

**Versão do WebGL**:

```
Versão do WebGL

Versão da especificação usada pela pipeline gráfica.

• Automático
  O Pixi escolhe WebGL 2 se disponível, com fallback
  pra WebGL 1. Recomendado pra 99% dos casos.

• WebGL 2 forçado
  Força a versão mais nova, mais rápida e com mais
  features. Falha ao iniciar se sua GPU ou driver
  não suportar.

• WebGL 1 forçado
  Força a versão antiga, compatível com GPUs muito
  velhas e drivers bugados. Use só se o WebGL 2
  estiver crashando ou renderizando com artefatos.

Só aplica quando o motor é WebGL (ignorado em WebGPU).
Requer recarregar o jogo.
```

**Preferência de GPU**:

```
Preferência de GPU

Diz ao navegador qual GPU usar — importa em laptops
que têm tanto uma GPU integrada (economia) quanto
uma discreta (performance).

• Automático
  O navegador decide. Geralmente integrada pra
  economizar bateria. Recomendado.

• Alta performance
  Força a GPU discreta. Jogo roda mais rápido mas
  consome muito mais bateria em laptops.

• Economia de energia
  Força a GPU integrada. Menor performance, mas
  máxima autonomia em laptops.

Em desktops com uma GPU só, não muda nada.
Requer recarregar o jogo.
```

**Ver informações do renderer** (tooltip do botão):

```
Ver informações do renderer

Abre um diálogo com detalhes técnicos da pipeline
gráfica ativa: motor em uso, GPU, vendor, versão,
capacidades (tamanho máximo de textura, vertex
attribs, extensões suportadas) e aviso se estiver
rodando em software.

Útil pra debug e pra saber se vale a pena tentar
WebGPU ou se há problema de aceleração.
```

**Mostrar órbitas**:

```
Mostrar órbitas

Desenha as linhas circulares que mostram o caminho
dos planetas em volta da estrela. Desligar reduz
custo de rendering em sistemas com muitos planetas.
```

**Densidade de estrelas**:

```
Densidade de estrelas

Quantas estrelas compõem o fundo espacial.

Valores baixos ganham performance em máquinas
fracas. Requer recarregar o jogo pra aplicar
(o starfield é gerado uma vez na criação do mundo).
```

**Max fantasmas**:

```
Max fantasmas

Número máximo de planetas 'lembrados' que aparecem
como sombra quando saem do seu campo de visão.

Limitar reduz custo de rendering sem alterar o
gameplay — o jogo ainda lembra de todos, só mostra
os N mais recentes visualmente.
```

**Shader ao vivo**:

```
Shader ao vivo

Quando ligado, planetas e estrelas têm animação de
superfície renderizada por shader em tempo real —
bonito mas caro.

Quando desligado, o shader roda uma vez na criação
e o resultado é guardado como textura fixa: mesmo
visual, animação congelada, desempenho muito maior.

Requer recarregar o jogo.
```

### 7.8 Modal de informações do renderer

Novo arquivo: `src/ui/renderer-info-modal.ts`.

```ts
import type { Application } from 'pixi.js';

interface RendererInfo {
  motor: string;
  versao: string;
  gpu: string;
  vendor: string;
  driver?: string;
  maxTextureSize?: number;
  maxVertexAttribs?: number;
  maxUniformVectors?: number;
  extensions?: string[];
  features?: string[];      // WebGPU
  limits?: Record<string, unknown>;  // WebGPU
  software: boolean;
  /** True se o navegador bloqueou info detalhada (privacy / no-extension). */
  bloqueado: boolean;
}

export function abrirRendererInfoModal(app: Application): void {
  const info = coletarInfo(app);
  const container = montarModal(info);
  document.body.appendChild(container);
}

function coletarInfo(app: Application): RendererInfo {
  const renderer = app.renderer as any;
  const tipo = renderer.type as number;  // WEBGL_LEGACY / WEBGL / WEBGPU
  const ehWebGPU = renderer.name === 'webgpu' || tipo === 2;

  if (ehWebGPU) {
    return coletarInfoWebGPU(renderer);
  }
  return coletarInfoWebGL(renderer);
}

function coletarInfoWebGL(renderer: any): RendererInfo {
  const gl: WebGLRenderingContext | WebGL2RenderingContext | null = renderer.gl ?? null;
  if (!gl) {
    return { motor: 'WebGL', versao: 'desconhecido', gpu: 'desconhecido', vendor: 'desconhecido', software: false, bloqueado: true };
  }
  // WEBGL_debug_renderer_info é deprecated/bloqueado em vários contextos:
  // Safari bloqueia por padrão desde 2020; Firefox com privacy.resistFingerprinting
  // retorna strings genéricas; Chrome já sinalizou intenção de depreciar.
  // Sempre null-check o resultado e mostre "bloqueado pelo navegador" quando ausente.
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext
    ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) || 'desconhecido'
    : 'bloqueado pelo navegador';
  const vendor = ext
    ? (gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string) || 'desconhecido'
    : 'bloqueado pelo navegador';
  const versao = (gl.getParameter(gl.VERSION) as string) ?? 'desconhecido';
  // Software detection só faz sentido se temos o renderer string real.
  const software = ext ? /swiftshader|llvmpipe|software|basic render/i.test(gpu) : false;
  return {
    motor: versao.includes('2.0') ? 'WebGL 2' : 'WebGL 1',
    versao,
    gpu,
    vendor,
    driver: ext ? extrairDriver(gpu) : undefined,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number,
    maxUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number,
    extensions: gl.getSupportedExtensions() ?? [],
    software,
    bloqueado: !ext,
  };
}

/**
 * WebGPU info é esforço-a-melhor: Pixi 8 não expõe `adapter` publicamente
 * no tipo de `renderer`, então o acesso é via cast unsafe. Além disso, a
 * spec do WebGPU explicitamente permite que browsers retornem strings
 * vazias pros campos de `GPUAdapter.info` por motivos de privacidade.
 * Chrome hoje preenche alguns campos; Firefox/Safari são mais restritivos.
 * Sempre null-check e mostre "desconhecido" quando vazio.
 */
function coletarInfoWebGPU(renderer: any): RendererInfo {
  const adapter = (renderer as any).adapter ?? null;
  const info = (adapter as any)?.info ?? {};
  const device = info.device || 'desconhecido';
  const vendor = info.vendor || 'desconhecido';
  const architecture = info.architecture || '';
  return {
    motor: 'WebGPU',
    versao: 'WebGPU 1.0',
    gpu: device,
    vendor,
    driver: architecture || undefined,
    features: adapter?.features ? Array.from(adapter.features as Iterable<string>) : [],
    limits: adapter?.limits ? Object.fromEntries(Object.entries(adapter.limits)) : {},
    software: /software|fallback/i.test(architecture),
    bloqueado: !adapter,
  };
}

function extrairDriver(gpuString: string): string | undefined {
  const m = gpuString.match(/ANGLE \(([^)]+)\)/);
  return m?.[1];
}

function montarModal(info: RendererInfo): HTMLDivElement {
  // ... monta o DOM com o layout descrito abaixo ...
}
```

**Layout do modal**:

```
┌─────────────────────────────────────────────────┐
│ INFORMAÇÕES DO RENDERER                      ✕  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Motor           WebGL 2                        │
│  Versão          WebGL 2.0 (OpenGL ES 3.0)      │
│  GPU             NVIDIA GeForce RTX 3080        │
│  Vendor          Google Inc. (NVIDIA)           │
│  Driver          ANGLE / Direct3D11             │
│                                                 │
│  ─── Capacidades ───                            │
│  Tamanho máx textura        16384               │
│  Vertex attribs             16                  │
│  Uniform vectors            4096                │
│  Extensions                 38 ativas  [Ver ▼]  │
│                                                 │
│  ─── Runtime ───                                │
│  Resolução                  1920 × 1080 × 2     │
│  Preferência de GPU         Automático          │
│                                                 │
│  [✓ Aceleração por hardware ativa]              │
│                                                 │
│                               [ Fechar ]        │
└─────────────────────────────────────────────────┘
```

**Se `software === true`**, o bloco final vira:

```
│  [⚠ Rodando em software — jogo vai travar]      │
│  [   Como habilitar aceleração ▼]              │
│  ┌─────────────────────────────────────┐        │
│  │ Chrome:  chrome://settings/system   │        │
│  │          "Usar aceleração por       │        │
│  │          hardware" → ligar          │        │
│  │ Firefox: about:config               │        │
│  │          layers.acceleration.       │        │
│  │          disabled → false           │        │
│  │ Edge:    edge://settings/system     │        │
│  └─────────────────────────────────────┘        │
```

**Se `bloqueado === true`** (detecção bloqueada pelo navegador), os campos GPU e Vendor aparecem como "bloqueado pelo navegador" e um bloco informativo:

```
│  [ℹ Detalhes da GPU não disponíveis]             │
│    Seu navegador bloqueia info detalhada da       │
│    GPU por privacidade (anti-fingerprinting).     │
│    Isso é normal em Safari, Firefox com           │
│    privacy.resistFingerprinting, e em tabs de     │
│    navegação privada.                             │
```

**Realismo sobre WebGPU**: em WebGPU, mesmo quando não há "bloqueio" explícito, a spec permite que `GPUAdapter.info.device/vendor/architecture` retornem strings vazias por padrão. Resultado prático: em Firefox Nightly e Safari TP o modal vai mostrar "desconhecido" em quase tudo. Isso **não é bug** — é a API. Chrome hoje preenche alguns campos mas sinalizou intenção de reduzir.

**Estilo**: mesmo padrão do `new-world-modal.ts` (overlay escuro com blur, card HUD centralizado). Reusa classes existentes onde possível.

**Lista de extensões expansível**: click em "[Ver ▼]" expande um sub-painel scrollável (max-height ~200px) com a lista inteira em monospace pequeno. Útil pra debug, não polui o layout quando fechado.

### 7.9 Arquivos afetados (UI)

- **Reescrito**: `src/ui/settings-panel.ts` — de stub pra tela completa com abas
- **Novo**: `src/ui/tooltip.ts`
- **Novo**: `src/ui/renderer-info-modal.ts`
- **Novo**: `src/ui/confirmar-acao.ts`
- **Modificado**: `src/ui/sidebar.ts` — adiciona botão "Configurações" in-game
- **Modificado**: `src/ui/main-menu.ts` — consome `abrirSettings` em vez do stub
- **Modificado**: `src/ui/planet-panel.ts`, `ship-panel.ts`, `build-panel.ts`, `colonizer-panel.ts` — atributo `data-ui="true"` no container raiz (pra edge-scroll)
- **Modificado**: sites de confirm legados migram pro `confirmarAcao`

---

## 8. Error handling, testing, migration

### 8.1 Error handling

**Áudio**:

- `AudioContext` bloqueado pelo browser (política de user-gesture): `getMixer()` é lazy, só cria no primeiro gesto. Se chamado antes, retorna `null` e `tocar()` vira no-op silencioso. Nenhum erro visível.
- `AudioContext` não suportado (browser muito antigo): detecta no boot. Retorna `null`. A aba Áudio mostra banner "Áudio indisponível neste navegador" e desabilita todos os sliders.

**Gráficos**:

- `requestFullscreen()` rejeitado: toast "Fullscreen bloqueado pelo navegador". Toggle volta a `false`.
- `document.fullscreenElement` muda externamente (usuário apertou Esc): listener sincroniza `config.graphics.fullscreen`.
- Baking de shader falhando (`generateTexture` retorna `null`): fallback pra shader live + toast "Baking falhou, usando shader live".
- WebGPU indisponível (try/catch no `app.init`): fallback automático pro WebGL, toast "WebGPU indisponível — usando WebGL", config atualizada.
- Forçar WebGL 1/2 falha ao criar contexto: fallback pro automático, toast + log.
- `WEBGL_debug_renderer_info` não disponível (alguns browsers bloqueiam por privacidade): modal mostra "desconhecido" nos campos de GPU/vendor e explica no rodapé: "Seu navegador bloqueia informações detalhadas da GPU por privacidade."

**Jogabilidade**:

- Edge-scroll com coordenadas de mouse inválidas (mouse fora da window): listener de `mouseleave` zera o vetor.
- Conflito com painéis HUD: resolvido pelo atributo `data-ui="true"`.

**Config**:

- `localStorage` cheio ao `setConfig`: loga, mantém mudança em memória, toast "Config não persistida — armazenamento cheio".
- JSON corrupto de config anterior: `load()` cai no `catch`, retorna defaults, loga warning.
- Campos ausentes em config antigo: `mergeDeep` preenche com defaults automaticamente.
- Migration da chave `renderer` legada: one-shot no primeiro `load()`.

### 8.2 Testing strategy

**Unit tests (vitest)**:

1. **`config.test.ts`** (expansão do existente no Save/Load): testa o shape completo, merge com defaults sobre parsed parcial (campos ausentes ganham default), observer pattern (listener notificado em mudança), reset por categoria vs. reset total.
2. **`graphics-preset.test.ts`**: testa que `aplicarPreset('baixo')` setta exatamente as 5 flags derivadas da tabela 3.1. Testa `presetBateComFlagsDerivadas` retornando `false` depois de override manual.
3. **`mixer.test.ts`**: mock do `AudioContext`, testa que `setConfig({ audio: { sfx: { volume: 0.5 } } })` → observer → `sfxGain.gain.value === 0.5`. Testa que mutar Master zera o master mantendo o valor real de volume em config.
4. **`viewport-bounds.test.ts`** (Seção 5.6): função pura, já especificado.
5. **`confirmar-acao.test.ts`**: testa que `confirmarDestrutivo: false` chama `onConfirm` direto; `true` chama `window.confirm` (mockado).

**Manual playtesting checklist**:

*Áudio:*

1. Master volume → 0 → nenhum som toca. 100 → volume máximo.
2. SFX Jogo mute → envio de nave silencioso, click de UI ainda soa.
3. Mudar volume durante `somVitoria` tocando → ajusta live.
4. F5 → config persistida → volumes mantidos.
5. Browser sem AudioContext → banner "indisponível" na aba, sliders cinza.

*Gráficos — preset:*

6. Qualidade Alto → Mínimo → FPS sobe, fantasmas somem, órbitas somem, starfield fica esparso.
7. Qualidade Baixo → mexer manualmente em "Mostrar órbitas" → dropdown mostra "(personalizado)".
8. Qualidade Mínimo + Shader ao vivo OFF → reload → planetas animados ficam estáticos, FPS muito maior.
9. Fullscreen ON → tela cheia. OFF → volta.
10. FPS cap 30 → jogo visivelmente mais lento porém estável.
11. Scanlines ON/OFF → efeito visível imediato.

*Gráficos — motor:*

12. Motor = WebGPU → recarregar → verifica via modal "Informações" que está WebGPU.
13. Motor = WebGL + Versão = WebGL 1 forçado → reload → verifica versão no modal. **Condicional**: só se o spike prévio (§3.3) confirmar que Pixi 8 aceita contexto WebGL 1 manual. Se o spike falhar, essa opção é removida do dropdown e o teste vira inaplicável.
14. Preferência de GPU = Alta performance → reload → em laptop dual-GPU, verifica GPU discreta no modal.
15. Motor = WebGPU em Firefox sem suporte → fallback automático + toast.

*Gráficos — modal de informações:*

16. Click em "Ver informações do renderer" → modal abre com dados reais da GPU.
17. Lista de extensions expansível → click → abre, click de novo → fecha.
18. Simular software rendering (Chrome em `--disable-gpu` via flag) → modal mostra banner vermelho + instruções expansíveis.

*Jogabilidade:*

19. Confirmar destrutivo OFF → sucatear nave → executa direto sem diálogo.
20. Confirmar destrutivo ON → sucatear nave → diálogo aparece.
21. Edge-scroll ON → cursor na borda esquerda da tela → câmera move pra esquerda.
22. Edge-scroll ON + painel de planeta aberto → cursor sobre o painel → câmera **não** move.

*Viewport culling (Seção 5):*

23. Zoom out máximo → pan → planetas na borda esquerda/topo aparecem sem delay.
24. Zoom in máximo → pan lateral rápido → nada pisca.
25. Debug: `mundo.planetas.filter(p => p.visible).length` muda consistentemente ao pan, simétrico em todas as direções.

*Settings in-game e acesso:*

26. Abrir settings pelo main menu → funciona.
27. Criar mundo → sidebar → botão "Configurações" → settings abre sobre o HUD → jogo continua rodando atrás.
28. Fechar settings com Escape → overlay some, jogo preservado.
29. Resetar esta aba (Áudio) → só áudio volta, gráficos/jogabilidade preservados.
30. Resetar tudo → confirm → todos os valores voltam ao default.

*Edge cases:*

31. Quota estourada em localStorage → mudança aplica live, toast de aviso.
32. Corrupt JSON de config → load → defaults, jogo funciona.
33. Config de Save/Load com só 2 chaves → merge preenche todas as outras.
34. Primeira vez abrindo após migration: chave legada `renderer` no localStorage → config novo tem o valor migrado, chave legada some.

### 8.3 Performance budget

- **Mixer de áudio**: overhead zero por som — um `connect` extra por oscilador, imperceptível.
- **Observer pattern em config**: < 10 listeners típicos, cada um O(1). Orçamento: < 1ms por `setConfig()`.
- **Graphics preset**: muda flags em memória, nada caro. Shader bake é one-time na mudança (não a cada frame).
- **Viewport culling fix**: mesma complexidade, só fórmula mudou. Zero custo extra.
- **Tooltip**: reaproveita um único `<div>` pra todos os tooltips, zero custo parado.
- **Renderer info modal**: dados são coletados uma vez quando abre, não poluem o hot loop.

### 8.4 Migration

- Config do Save/Load (2 chaves) → config novo: `mergeDeep` automático, sem migration explícita.
- Chave legada `localStorage['renderer']` → `config.graphics.renderer`: migração one-shot em `load()`.
- Saves de mundo: **nenhum impacto** — saves não contêm config.
- `configVersion: number` **não é necessário** neste ponto — mergeDeep resolve todos os casos imagináveis até agora. Se um dia precisar, adiciona campo e migration function igual ao spec Save/Load faz.

---

## 9. Estrutura final de arquivos

**Novos** (~10):

```
src/audio/mixer.ts
src/core/graphics-preset.ts
src/world/viewport-bounds.ts
src/world/__tests__/viewport-bounds.test.ts
src/ui/tooltip.ts
src/ui/renderer-info-modal.ts
src/ui/confirmar-acao.ts
src/core/__tests__/graphics-preset.test.ts
src/audio/__tests__/mixer.test.ts
src/ui/__tests__/confirmar-acao.test.ts
```

**Modificados** (~18):

```
src/core/config.ts              # expansão total do shape, observer pattern, migrations
src/core/__tests__/config.test.ts  # testes expandidos pro shape novo
src/audio/som.ts                # categorias explícitas em cada somX
src/main.ts                     # preference/powerPreference/context no app.init, fallback chain
src/world/mundo.ts              # calcularBoundsViewport, consome mostrarOrbitas
src/world/fundo.ts              # JSDoc esclarecendo world-units, consome densidadeStarfield
src/world/mundo-menu.ts         # call site de atualizarFundo passa world units em vez de pixels
src/world/nevoa.ts              # calcularBoundsViewport(margemMin=1500), consome fogThrottle/maxFantasmas
src/world/planeta-procedural.ts # path de shader baking
src/core/player.ts              # edge-scroll listener
src/ui/settings-panel.ts        # reescrito: abas, tooltips, 4 audio, preset, motor, modal
src/ui/sidebar.ts               # botão Configurações in-game
src/ui/main-menu.ts             # abrirSettings em vez do stub
src/ui/planet-panel.ts          # data-ui="true"
src/ui/ship-panel.ts            # data-ui="true"
src/ui/build-panel.ts           # data-ui="true"
src/ui/colonizer-panel.ts       # data-ui="true"
src/ui/colony-modal.ts          # data-ui="true"
src/ui/confirm-dialog.ts        # data-ui="true"
src/ui/debug.ts                 # remove renderer dropdown
src/ui/debug-menu.ts            # remove renderer dropdown
```

---

## 10. Riscos e mitigações

| Risco                                                   | Mitigação                                                                         |
|---------------------------------------------------------|-----------------------------------------------------------------------------------|
| Refactor de som.ts quebra áudio em todos os call sites  | Mudar uma função por vez, smoke test cada uma via dev server antes de seguir      |
| Shader bake fica visualmente diferente do live          | Bake roda na criação com `uTime = 0` determinístico. Visual comparado via screenshot manual antes/depois |
| Viewport fix regride algo em `atualizarFundo`           | Função pura com testes unitários + `margemMin=600` default preserva buffer original pra fast pan + smoke test manual zoom in/out/pan |
| Edge-scroll dispara sobre HUD                           | `data-ui="true"` + requisito `pointer-events: auto` no container raiz + teste manual com cada painel aberto |
| Modal de renderer mostra campos vazios em WebGPU        | Null-checks, "desconhecido" como fallback, bloco informativo explicando privacy-redaction. Documentado como comportamento esperado, não bug |
| `WEBGL_debug_renderer_info` bloqueado pelo navegador    | Detecta extensão ausente → flag `bloqueado: true` → UI mostra "bloqueado pelo navegador" com bloco explicativo. Software detection só roda se extension disponível |
| Tooltip fica por baixo de um modal                     | `z-index: 900` no tooltip (acima de qualquer modal — new-world = 600, renderer-info = 700) |
| AudioContext proibido em iframes/privados               | Detecção no boot, banner "indisponível", funções no-op silenciosas                |
| Observer pattern reentrância / loop infinito           | Guarda reentrante em `setConfig`: se já tem um notify em execução, enfileira a próxima mudança e dispara depois. Implementação: flag `_notifying: boolean` |
| Fullscreen gesture perdido via observer pattern         | `requestFullscreen()` chamado sincronamente no handler do checkbox, ANTES do `setConfig`. Observer só persiste estado, não dispara transição. |

---

## 11. Dependências com outros specs

- **Save/Load (spec 1)**: este spec **depende** do `src/core/config.ts` e do `src/ui/settings-panel.ts` criados no Save/Load. Expande ambos. Sem o Save/Load implementado, este spec não pode ser executado.
- **Input system + rebind (spec 3)**: independente. Os botões novos da sidebar usam listeners diretos por ora; quando o sistema de input centralizado existir, migram pra ações nomeadas.
- **i18n (spec 4)**: independente. As strings novas (labels, tooltips) são PT hardcoded. Spec de i18n vai extrair tudo junto quando chegar a vez dele.
- **GitHub Pages deploy (spec 5)**: independente.
