# Save / Load System — Design

**Data**: 2026-04-15
**Status**: Aprovado, pronto pra plano de implementação
**Projeto**: Orbital Wydra

## Contexto

Hoje o jogo não tem persistência. O main menu tem botões "Mundos Salvos" e "Configurações" que são placeholders — "Mundos Salvos" lê de uma chave `localStorage` que ninguém escreve, "Configurações" mostra "Em breve". Cada reload perde todo progresso.

Este spec define a primeira camada de persistência: jogador cria mundos nomeados, joga, fecha a aba, volta depois, continua de onde parou.

Este é o **primeiro de 5 specs** planejados pra fechar o main menu e funcionalidades associadas. Os outros, fora de escopo aqui, são:

1. **Save/Load** (este spec)
2. Settings (áudio / gráficos / jogabilidade)
3. Input system + rebind de controles
4. i18n PT/EN
5. Deploy em GitHub Pages

## Objetivo

Entregar persistência completa e robusta do estado do mundo, com dois modos de operação coexistentes:

- **Periódico** (default): snapshot completo em intervalo configurável, escrito em `localStorage`.
- **Experimental** (opt-in): dirty tracking por entidade, flush híbrido em `IndexedDB`, janela máxima de perda de ~500ms.

Ambos compartilham a mesma camada de serialização/reconstrução.

## Fora de escopo

- Cloud save / sync entre dispositivos
- Compressão de save (desnecessária pro tamanho atual)
- Múltiplos snapshots por mundo (cada mundo tem exatamente um save; salvar sobrescreve)
- Replay / histórico
- Screenshots nos cards da lista de mundos
- Refatoração do sistema de input (spec 3)
- Internacionalização (spec 4)
- **Persistência de estado hardcoded de HUD**: hoje `main.ts` chama `criarEmpireBadge('Valorian Empire', 24)` e `criarCreditsBar(43892)` com valores fixos que não vivem no `Mundo`. Este spec mantém esse comportamento — o nome do império e os créditos não fazem parte do save. Quando eles virarem estado real do jogo (parte de uma mecânica futura), um spec separado adiciona ao `MundoDTO`.

---

## 1. Arquitetura em linha grossa

Dois modos de save lado a lado, com base compartilhada:

```
                     ┌─────────────────────────┐
                     │  Mundo (Pixi + dados)   │
                     └────────────┬────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │   serializarMundo()     │  ← camada compartilhada
                     │     → MundoDTO          │     (refactor A)
                     └────────────┬────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
        ┌──────────────────┐         ┌──────────────────────┐
        │ Periódico        │         │ Experimental         │
        │ localStorage     │         │ IndexedDB            │
        │ snapshot completo│         │ per-entity dirty     │
        │ setInterval      │         │ timer + idle + vis.  │
        └──────────────────┘         └──────────────────────┘

                     ┌─────────────────────────┐
                     │   reconstruirMundo()    │  ← caminho de load,
                     │     DTO → Mundo         │     idêntico pra os 2 modos
                     └─────────────────────────┘
```

O modo ativo é controlado por `config.saveMode`. Troca em runtime é suportada (drena o modo antigo, inicia o novo, sem perda).

---

## 2. IDs estáveis

Atualmente `Sistema`, `Sol`, `Planeta` não têm campo `id`. Entidades se referenciam por identidade de objeto JS (`===`), o que não sobrevive a serialização.

Adicionar campo `id: string`:

- `Sistema.id`: formato `sys-<idx>`, ex: `sys-0`, `sys-1`.
- `Sol.id`: formato `sol-<sysIdx>`, ex: `sol-0`.
- `Planeta.id`: formato `pla-<sysIdx>-<planetIdx>`, ex: `pla-0-0`, `pla-0-1`.

Naves já possuem `id` — manter o formato atual.

**Garantias**:
- ID é imutável durante a vida do mundo.
- Setado uma vez em `criarMundo()` ou `reconstruirMundo()`.
- Legível em debug (facilita inspecionar saves à mão).
- Único dentro de um mundo (não precisa ser global).

O refactor toca código em `src/world/mundo.ts`, `src/world/planeta.ts`, `src/world/planeta-procedural.ts`, `src/world/sol.ts` (ou equivalente). Código que compara entidades por `===` continua funcionando — ID só adiciona um caminho alternativo de identidade.

---

## 3. Camada DTO e serialização

### 3.1 Tipos DTO

Arquivo: `src/world/save/dto.ts`

```ts
interface MundoDTO {
  schemaVersion: number;       // começa em 1
  nome: string;                // chave de identidade do save
  criadoEm: number;            // epoch ms
  salvoEm: number;             // epoch ms do último flush
  tempoJogadoMs: number;       // acumulado
  tamanho: number;
  tipoJogador: TipoJogadorDTO;
  ultimoTickMs: number;
  sistemas: SistemaDTO[];
  sois: SolDTO[];
  planetas: PlanetaDTO[];
  naves: NaveDTO[];
  fontesVisao: FonteVisaoDTO[];
}

interface SistemaDTO {
  id: string;
  x: number;
  y: number;
  solId: string;
  planetaIds: string[];
}

interface SolDTO {
  id: string;
  x: number;
  y: number;
  raio: number;
  cor: number;
  visivelAoJogador: boolean;
  descobertoAoJogador: boolean;
}

interface PlanetaDTO {
  id: string;
  orbita: OrbitaPlaneta;          // já é plain data — define a posição
  dados: DadosPlaneta;            // já é plain data — copy raso (clone de `pesquisas`)
  visivelAoJogador: boolean;
  descobertoAoJogador: boolean;
  memoria: MemoriaPlanetaDTO | null;   // fog-of-war "último avistamento"
  // `Planeta.x/y` NÃO são serializados — são derivados de `orbita` em
  // `atualizarOrbitaPlaneta` e recalculados no primeiro tick após o load.
  // A ligação planeta→sistema é expressa via `SistemaDTO.planetaIds[]`; o
  // `dados.sistemaId: number` legado é copiado dentro de `dados`.
  // `dados.selecionado` é forçado a `false` no load.
}

/**
 * Snapshot de memória de fog-of-war (vive hoje em `nevoa.ts` num
 * `WeakMap<Planeta, MemoriaPlaneta>`). É o que o jogador "lembra" de um
 * planeta que já viu uma vez e depois saiu do alcance de visão.
 */
interface MemoriaPlanetaDTO {
  conhecida: boolean;
  snapshotX: number;
  snapshotY: number;
  idadeMs: number;                     // ver §3.2 — timestamps como idade
  dados: {
    dono: string;
    tipoPlaneta: string;
    tamanho: number;
    fabricas: number;
    infraestrutura: number;
    naves: number;
    producao: number;
  };
}

interface NaveDTO {
  id: string;
  tipo: string;
  tier: number;
  dono: string;
  x: number;
  y: number;
  // String union explícita — desacopla o DTO do type do runtime pra
  // permitir versionamento independente.
  estado: 'orbitando' | 'viajando' | 'parado' | 'fazendo_survey'
    | 'aguardando_decisao' | 'pilotando';
  carga: Recursos;
  configuracaoCarga: Recursos;
  orbita: OrbitaNave | null;
  surveyTempoRestanteMs?: number;
  surveyTempoTotalMs?: number;
  thrustX?: number;
  thrustY?: number;
  origemId: string;
  alvo: AlvoDTO | null;
  rotaManual: AlvoPontoDTO[];     // AlvoPonto é plain data — copy raso
  rotaCargueira: RotaCargueiraDTO | null;
  // `selecionado` é forçado a `false` no load — estado de UI transient.
}

type AlvoDTO =
  | { tipo: 'planeta'; id: string }
  | { tipo: 'sol'; id: string }
  | { tipo: 'ponto'; x: number; y: number };

interface RotaCargueiraDTO {
  origemId: string | null;
  destinoId: string | null;
  loop: boolean;
  fase: 'origem' | 'destino';
}

interface FonteVisaoDTO {
  x: number;
  y: number;
  raio: number;
}

interface TipoJogadorDTO {
  nome: string;
  desc: string;
  cor: number;
  bonus: {
    producao?: number;
    fabricasIniciais?: number;
    infraestruturaInicial?: number;
  };
}
```

**Nenhum campo Pixi aparece aqui.** `Container`, `Graphics`, `Sprite`, `Filter`, `Texture`, shaders — todos recriados no load.

`DadosPlaneta` já é plain data no tipo atual (`src/types.ts`). Pode ser copiado raso no DTO, com a precaução de clonar `pesquisas: Record<string, boolean[]>` pra não compartilhar referência.

### 3.2 `serializarMundo(mundo: Mundo): MundoDTO`

Arquivo: `src/world/save/serializar.ts`

Função pura, sem side effects. Walk no mundo, extrai campos de dados, troca referências por IDs.

Pontos de cuidado:

- `Nave.alvo` → discriminated union `AlvoDTO`. O discriminator é **`nave.alvo._tipoAlvo`** (não `nave._tipoAlvo`, que sempre vale `'nave'` e identifica o próprio objeto):
  - `nave.alvo._tipoAlvo === 'planeta'` → `{ tipo: 'planeta', id: nave.alvo.id }`
  - `nave.alvo._tipoAlvo === 'sol'` → `{ tipo: 'sol', id: nave.alvo.id }`
  - `nave.alvo._tipoAlvo === 'ponto'` → `{ tipo: 'ponto', x: nave.alvo.x, y: nave.alvo.y }`
  - `nave.alvo === null` → `null`
- `Nave.origem` → `origemId: origem.id`
- `Nave.rotaCargueira.origem/destino` → IDs ou `null`
- `Nave.rotaManual`: cada entrada é um `AlvoPonto` (plain data com `_tipoAlvo: 'ponto'`, `x`, `y`). Copy raso — não há referência a resolver.
- `Sistema.sol` → `solId`
- `Sistema.planetas` → `planetaIds[]`
- **Memória de fog-of-war**: lê do `WeakMap` em `src/world/nevoa.ts` via `getMemoria(planeta)`. Converte `memoria.dados` (se não-null) no `MemoriaPlanetaDTO`, já aplicando a regra de timestamp abaixo.
- **Timestamps como idade relativa** (blocker crítico): `performance.now()` reinicia a cada page load, então timestamps absolutos em ms são inúteis depois de um reload. Regra: qualquer timestamp persistido é convertido pra `idadeMs = performance.now() - valorAtual` no save, e rebase para `performance.now() - idadeMs` no load. Hoje só `memoria.timestamp` precisa disso — outros timestamps (`Mundo.ultimoTickMs`, caches de animação em `naves.ts`, toasts em `notificacao.ts`) **não são persistidos** de propósito.
- **`Mundo.ultimoTickMs` não vai no DTO**: é só o "último frame" do game loop, usado internamente. No load, `reconstruirMundo` seta pra `performance.now()` fresco; o primeiro tick após o load usa o delta natural do ticker.
- **Estado transient de UI zerado**: `planeta.dados.selecionado` e `nave.selecionado` sempre saem como `false` no DTO (ou são zerados na entrada do reconstruir).
- **Ordem estável**: sistemas, sóis, planetas, naves **ordenados por ID** no output. Isso torna diffs de save inspecionáveis e simplifica testes de roundtrip.

A função retorna um novo objeto; não muta o mundo.

### 3.3 `reconstruirMundo(dto, app): Promise<Mundo>`

Arquivo: `src/world/save/reconstruir.ts`

Contraparte de `criarMundo()`. **Reusa as factories existentes** (`criarEstrelaProcedural`, `criarPlanetaProceduralSprite`, `criarMemoriaVisualPlaneta`, `registrarMemoriaPlaneta`) pra não divergir do caminho de criação normal. A ideia é: a única diferença entre criar um mundo novo e reconstruir um mundo é **de onde vêm os parâmetros** — no `criarMundo()` eles são procedurais/aleatórios, no `reconstruirMundo()` eles vêm do DTO.

Fluxo:

0. **Reset de estado global**: chama `resetarNomesPlanetas()` de `src/world/nomes.ts` antes de começar (o Set `_nomesUsados` é module-level global e precisa ser zerado entre mundos). Ao criar cada planeta, pré-registra o nome no Set pra preservar o comportamento do `gerarNomePlaneta` caso o usuário crie mais mundos na mesma sessão.

1. **Containers base via `criarMundoVazio(app, tamanho)`** — novo helper extraído do início de `criarMundo()`. Recebe `app` e `tamanho`, cria:
   - `container: Container` (raiz do mundo)
   - `fundo: Container` (starfield procedural via `criarFundo(tamanho)`)
   - `orbitasContainer`, `frotasContainer`, `navesContainer`, `rotasContainer`, `visaoContainer`, `memoriaPlanetasContainer`
   - Faz o `addChild` na ordem de z-stacking exata de `criarMundo()`:
     ```
     fundo → (sistemas adicionados depois, contendo sol+planetas) →
     orbitasContainer → frotasContainer → navesContainer →
     rotasContainer → visaoContainer → memoriaPlanetasContainer
     ```
   - Retorna todos os containers.
   - Tanto `criarMundo` quanto `reconstruirMundo` consomem esse helper.

2. **Sóis**: pra cada `SolDTO`, chama `criarEstrelaProcedural(x, y, raio)` (a factory real em `src/world/planeta-procedural.ts`). O objeto retornado já é o `Sol` com shader aplicado. Depois seta `_cor`, `_visivelAoJogador`, `_descobertoAoJogador`, `_raio` conforme o DTO. Adiciona ao `container`. Monta `solsById: Map<string, Sol>`.

3. **Planetas**: pra cada `PlanetaDTO`:
   - Chama `criarPlanetaProceduralSprite(x, y, tamanho, tipoPlaneta)` — factory real com o shader já aplicado. Recebe posição computada a partir de `orbita` (`centroX + cos(angulo) * raio`, idem y).
   - Copia `dados` do DTO (spread raso + clone explícito de `pesquisas` e `filaProducao`). Seta `selecionado = false`.
   - Seta `_orbita`, `_visivelAoJogador`, `_descobertoAoJogador`, `_tipoAlvo = 'planeta'`, `id` do DTO.
   - Pré-registra o nome em `_nomesUsados`.
   - Adiciona ao `container`.
   - Monta `planetasById: Map<string, Planeta>`.

4. **Memória de fog-of-war**: pra cada `Planeta` reconstruído, chama `criarMemoriaVisualPlaneta(mundo, planeta)` (a factory existente em `nevoa.ts`). Se o `PlanetaDTO.memoria.conhecida === true`, popula o `WeakMap` com um `MemoriaPlanetaSnapshot` reconstruído a partir do DTO, **rebasing o timestamp**: `timestamp = performance.now() - memoria.idadeMs`. Também seta `memoria.conhecida = true` e chama `redesenharVisualMemoria(memoria)` (ou deixa o próximo `atualizarVisibilidadeMemoria` fazer). Note: o `mundo` tem que estar montado o suficiente pra `criarMemoriaVisualPlaneta` funcionar — esse passo roda **depois** do passo 6 (montagem do Mundo), não aqui. Mantido nesta lista por clareza de dependência.

5. **Sistemas**: pra cada `SistemaDTO`, usa os mapas pra resolver `solId` → `Sol` e `planetaIds[]` → `Planeta[]`. Monta o objeto `Sistema` literal.

6. **Mundo**: monta o objeto `Mundo` com os arrays (`planetas`, `sistemas`, `sois`, `naves: []` inicialmente), containers, e campos top-level do DTO (`tamanho`, `tipoJogador`, `fontesVisao`). **`ultimoTickMs = performance.now()`** — valor fresco, não do DTO.

7. **Naves**: pra cada `NaveDTO`, cria o objeto `Nave` com campos planos. Resolve referências via os mapas:
   - `origemId` → `planetasById.get(id)` (lança se não existe)
   - `alvo`: conforme discriminator — `tipo: 'planeta'` → `planetasById.get(id)`, `tipo: 'sol'` → `solsById.get(id)`, `tipo: 'ponto'` → `{ _tipoAlvo: 'ponto', x, y }`
   - `rotaCargueira.origemId/destinoId` → planetas
   - `rotaManual`: copy raso dos pontos (já são plain data)
   - `selecionado = false`, `_selecaoAnterior = undefined`
   - Cria `gfx: Container` vazio, `rotaGfx: Graphics` vazio. `_sprite` inicia `undefined` — o código existente de sprite async pending em `naves.ts` cuida do resto no próximo tick.
   - Adiciona o `gfx` no `navesContainer` e o `rotaGfx` no `rotasContainer`.
   - Push no `mundo.naves`.

8. **Passo de memória (dependente de `mundo` montado)**: agora que `mundo.memoriaPlanetasContainer` existe com o próprio `Mundo`, executa o passo 4 de verdade — `criarMemoriaVisualPlaneta(mundo, planeta)` pra cada planeta, e se `PlanetaDTO.memoria` não-null, popula o WeakMap com o snapshot rebased.

9. **Stage**: adiciona `mundo.container` ao `app.stage` e retorna `mundo`.

**Erros de referência**: se `origemId`, `alvo.id`, `rotaCargueira.origemId/destinoId`, `SistemaDTO.solId` ou `SistemaDTO.planetaIds[*]` referenciam um ID inexistente, lança `Error('Save corrompido: referência órfã <id>')`. Não tenta consertar.

---

## 4. Modo periódico (default)

Arquivo: `src/world/save/periodic-save.ts`

### 4.1 Cadência

`setInterval` fora do ticker do Pixi. Intervalo lido de `config.autosaveIntervalMs` (default `60000`). Se `=== 0`, autosave desligado.

Por que não usar o ticker: ticker roda a 60Hz, é pausável pelo debug menu, e autosave não precisa sync de frame.

**Tempo jogado acumulado**: `main.ts` mantém um contador `_tempoJogadoAcumulado: number` incrementado por `app.ticker.deltaMS` a cada tick da fase de jogo (não do menu). `serializarMundo` lê esse valor via um getter exposto (`getTempoJogadoMs()`) e o grava em `MundoDTO.tempoJogadoMs`. No carregamento, o valor é restaurado pra `_tempoJogadoAcumulado` antes do ticker reiniciar.

### 4.2 Fluxo de um save

```ts
function autosaveTick(): void {
  if (!_mundo || !_gameStarted) return;
  if (Date.now() - _ultimoSaveTs < 200) return; // throttle

  try {
    const dto = serializarMundo(_mundo);
    dto.salvoEm = Date.now();
    dto.tempoJogadoMs = _tempoJogadoAcumulado;

    const json = JSON.stringify(dto);
    localStorage.setItem(saveKey(dto.nome), json);
    atualizarIndice(dto);

    _ultimoSaveTs = Date.now();
    _ultimoSaveErro = null;
  } catch (err) {
    handleSaveError(err);
  }
}
```

### 4.3 Storage layout no `localStorage`

- `orbital_save:<nome>` → JSON completo daquele mundo.
- `orbital_saves_index` → array de metadata leve pra listagem:
  ```ts
  Array<{
    nome: string;
    criadoEm: number;
    salvoEm: number;
    tempoJogadoMs: number;
    tipoJogador: { nome: string; cor: number };
    planetasJogador: number;
  }>
  ```
  Atualizado no mesmo tick do save completo. A tela "Mundos Salvos" lê só esse índice pra listar (não parseia cada save inteiro).
- `orbital_config` → config (intervalo, modo). Começa neste spec, expandido no spec de Settings.

### 4.4 Triggers além do timer

1. `visibilitychange` → `hidden`: flush imediato (mesma `autosaveTick()`).
2. `beforeunload`: flush síncrono final. `localStorage` é síncrono, então funciona — diferente do IndexedDB.
3. Botão **Salvar** no HUD: dispara flush + toast de confirmação.
4. Fluxo **Voltar ao Menu**: save final antes de destruir o mundo.

### 4.5 Tratamento de erro

- `QuotaExceededError`: modal "Armazenamento cheio — apague saves antigos pra continuar salvando", lista saves com botão de delete. Autosave em pausa até ter espaço.
- `JSON.stringify` falha: bug de serialização (circular ref). Log com stack, não crasha, avisa usuário.
- `localStorage` indisponível: detecta no boot, banner persistente "Save desabilitado — seu progresso não será mantido". Jogo funciona.

Todos os erros atualizam `_ultimoSaveErro: Error | null` consumido pelo HUD.

### 4.6 Throttle de segurança

Se `autosaveTick()` dispara 2× em menos de 200ms (ex: `visibilitychange` + `beforeunload` em cascata), o segundo é no-op.

### 4.7 Custo esperado

~50–100KB stringify + setItem = ~2–5ms main thread, uma vez por minuto (ou o intervalo escolhido). Negligível.

---

## 5. Modo experimental (IndexedDB)

Arquivos: `src/world/save/experimental-save.ts`, `src/world/save/indexed-db.ts`

### 5.1 Feature flag

Ativado via `config.saveMode === 'experimental'`. Toggle explícito nas Configurações: **"Save experimental em tempo real (IndexedDB)"**, default off.

Na primeira ativação, aviso: **"Modo experimental pode falhar em modo privado do navegador. Em caso de erro, o jogo volta automaticamente pro modo padrão."**

### 5.2 Schema do IndexedDB

Database `orbital_db`, version `1`. Object stores:

| Store      | keyPath              | Conteúdo                                              |
|------------|----------------------|-------------------------------------------------------|
| `mundos`   | `nome`               | Header do mundo (sem entidades)                       |
| `sistemas` | `[mundoNome, id]`    | Um registro por sistema                               |
| `sois`     | `[mundoNome, id]`    | Um registro por sol                                   |
| `planetas` | `[mundoNome, id]`    | Um registro por planeta                               |
| `naves`    | `[mundoNome, id]`    | Um registro por nave                                  |

Chaves compostas com `mundoNome` como prefixo permitem `IDBKeyRange.bound([nome, ''], [nome, '\uffff'])` pra varrer/apagar todas as entidades de um mundo sem precisar de index secundário.

Load de um mundo: 1 `get` em `mundos` + 4 `getAll` filtrados por `mundoNome`. DTOs remontados em memória, passam pelo `reconstruirMundo()` igual ao modo periódico.

Partitioned (não um blob único) porque structured clone custa proporcional ao tamanho do registro — registros pequenos são ordens de magnitude mais baratos.

### 5.3 Dirty tracking

Três níveis:

- **Per-entity**: `planeta._dirty: boolean`, `nave._dirty: boolean`, etc. Não serializado, só memória.
- **Per-category**: `mundoDirty: { sistemas: Set<string>; sois: Set<string>; planetas: Set<string>; naves: Set<string>; header: boolean }`. Reseta a cada flush.
- **Header**: qualquer alteração em campos top-level (`ultimoTickMs`, `fontesVisao`, `tempoJogadoMs`).

**Fase 1 (deste spec — pragmática)**: ao final de cada `atualizarMundo()`, marca **tudo como dirty** (todas as naves, todos os planetas, todos os sóis, header). Zero instrumentação nos pontos de mutação.

**Importante**: marcar dirty a cada tick **não é o mesmo** que flushar a cada tick. O `FlushController` (§5.4) só consome os flags a cada **500ms / idle / visibilitychange**. Os ~60 ticks que rodam entre dois flushes apenas setam um flag que já estava setado — é uma operação O(1) sobre Sets/booleanos e custa próximo de zero. O flush real acontece no máximo 2× por segundo.

**Fase 2 (não implementada neste spec)**: instrumentar pontos de mutação reais (conclusão de fábrica, troca de estado de nave, etc.) pra flush verdadeiramente granular (só entidades que mudaram de verdade, não todas). Só vale se profiling da fase 1 mostrar custo de flush não-trivial. Documentada como caminho evolutivo.

### 5.4 FlushController

Triggers:

- **Timer**: `setInterval(500ms)`. Se dirty, agenda flush.
- **Idle**: `requestIdleCallback` (fallback `setTimeout(0)`). Se dirty no momento do callback, flush.
- **`visibilitychange` → hidden**: flush imediato.
- **`beforeunload`**: ver 5.5.

Flush:

```ts
async function flush(): Promise<void> {
  if (!temDirty()) return;
  if (_flushInflight) return;
  _flushInflight = true;
  try {
    const snapshot = serializarMundoDirty(_mundo, mundoDirty);
    await writeToIndexedDB(snapshot);
    limparDirty(mundoDirty);
    _ultimoSaveOk = Date.now();
  } catch (err) {
    handleFlushError(err);
  } finally {
    _flushInflight = false;
  }
}
```

`serializarMundoDirty` é variante de `serializarMundo` que só emite registros pros IDs marcados dirty + header quando dirty.

`writeToIndexedDB` abre **uma única transaction** sobre os 5 stores em `readwrite`, faz todos os `put()` em paralelo, aguarda `oncomplete`. Atomicidade por transaction.

### 5.5 `beforeunload` no modo experimental

**Problema**: IndexedDB é async; em `beforeunload` a aba pode morrer antes do `put` terminar.

**Solução**: em `beforeunload`, serializa o **`MundoDTO` completo** (não um delta) via `serializarMundo(_mundo)` e grava **sincronamente** em `localStorage` na chave `orbital_emergency:<nome>`. No próximo boot, o sistema detecta essa chave e **substitui** o estado do mundo pelo emergency blob (que por definição é mais recente ou igual ao último flush do IndexedDB), depois apaga o emergency. Substituir, não fazer merge — DTO completo é mais simples e robusto que tentar reconciliar deltas.

**Por que DTO completo**: merge por entidade precisaria decidir qual versão vence por campo, é fácil errar, e o custo sync de serializar um DTO de ~100KB é ~5ms — aceitável pro momento de fechar a aba.

**Edge cases**:

- **Emergency blob anterior ainda existia** (primeiro save falhou ou boot passado não rodou): antes de escrever, faz `localStorage.removeItem('orbital_emergency:<nome>')`, capturando `QuotaExceededError` no write subsequente.
- **Quota estourada no `beforeunload`**: captura o erro, tenta apagar outros emergency blobs de outros mundos (`orbital_emergency:*`) pra liberar espaço, tenta de novo. Se ainda assim falhar, loga no console — não há como sinalizar pro usuário a essa altura do ciclo de vida da aba.
- **`localStorage` também indisponível** (Safari modo privado extremo — raro mas real): não há fallback síncrono. Documentado: **modo experimental não garante zero perda nesse cenário**. O aviso de ativação do modo experimental (§5.1) é atualizado pra mencionar isso. O modo experimental detecta no boot se `localStorage` está disponível e, se não, desativa automaticamente com toast persistente.

### 5.6 Tratamento de erro

- **IndexedDB falha ao abrir** (ex: Firefox modo privado): fallback automático pro modo periódico, toast "Modo experimental indisponível — usando save padrão". Config **não muda** — próxima tentativa repete.
- **`QuotaExceededError`**: mesma UI do modo periódico.
- **3 flushes consecutivos falhando**: desativa modo experimental automaticamente, escala pro periódico, aviso persistente.

### 5.7 Custo esperado

**Marcação dirty** (a cada tick, ~60Hz): `Set.add()` + bool = O(1) por entidade, <0.1ms pro mundo inteiro. Negligível.

**Flush real** (a cada 500ms ou trigger, ~2Hz): com todos os 100 planetas e 30–50 naves marcados, emite ~150 `put()` numa transaction única + 1 `put()` de header. IndexedDB processa em ~5–15ms num worker interno do browser. Async = **zero bloqueio da main thread** enquanto roda. Amortizado: ~30ms de trabalho de IDB por segundo, tudo fora da main thread. Impacto em FPS = 0.

**Sync emergency write** (só em `beforeunload`): serializa DTO completo + `localStorage.setItem`. ~5–10ms uma única vez por sessão. Aceitável.

---

## 6. UI e fluxo do usuário

### 6.1 Criação de mundo — nome obrigatório

Hoje "Novo Jogo" chama `iniciarJogo()` direto sem parâmetros. Muda pra:

1. Click em **Novo Jogo** → abre modal `new-world-modal.ts` (overlay sobre o main menu, estilo dos cards HUD existentes).
2. Modal tem:
   - Campo texto **Nome do mundo** (required, 1–40 chars, trim, único entre saves existentes — colisão mostra erro inline).
   - Dropdown/radio **Tipo de jogador** (o `getTipos()[0]` atual como default; move-se da seleção atual pra cá).
   - Preview do nome no título do card, estilo `menu-title`.
   - Botões **Criar** (primary) e **Cancelar**.
3. Click em Criar → valida → chama `iniciarJogoNovo({ nome, tipoJogador })`.

**Duas entradas distintas, não uma assinatura híbrida:**

- `iniciarJogoNovo(opts: { nome: string; tipoJogador: TipoJogador }): Promise<void>` — fluxo novo-jogo. Destrói o mundo do menu, chama `criarMundo(app, tipoJogador)`, seta `mundo.nome`, registra o header no backend ativo (via `storageBackend.registrarMundo(header)`), instala HUD, inicia autosave.
- `carregarMundo(nome: string): Promise<void>` — fluxo load-game. Destrói o mundo do menu, lê o DTO do backend ativo, passa por `migrarDto()` → `reconstruirMundo(dto, app)`, instala HUD (se ainda não instalado), inicia autosave.

Os dois compartilham ~90% do código do `iniciarJogo` atual — o que difere é só a fonte do `Mundo` (criação procedural vs reconstrução). Extrair um helper `entrarNoJogo(mundo: Mundo)` privado que faça a parte comum (destruir menu → attach stage → instalar HUD → iniciar autosave) e os dois chamarem esse helper.

A assinatura antiga `iniciarJogo()` é removida. `main.ts` expõe `iniciarJogoNovo` e `carregarMundo` como callbacks pro main menu.

### 6.2 Tela "Mundos Salvos" — funcional

Passa a ler de `orbital_saves_index` (periódico) ou do store `mundos` via `getAll` (experimental). Abstração comum via `storageBackend.listarMundos()`.

- Lista ordenada por `salvoEm` desc.
- Cada card mostra: **nome**, **tipo de jogador** (com cor), **tempo jogado** (`2h 14min`), **salvo em** (relativo: "há 2 min", "há 3 horas", "ontem").
- Click → `carregarMundo(nome)`: lê do backend, passa pelo `reconstruirMundo()`, substitui o mundo do menu, entra no jogo.
- Ícone lixeira por card (revelado no hover). Click → confirm dialog → delete + refresh.
- Lista vazia: mantém mensagem "Nenhum mundo salvo ainda".

### 6.3 Botão "Salvar" in-game

Adicionar na sidebar. Click → `autosaveTick()` imediato + toast "Salvo" (ou "Erro: ..."). Toast usa o sistema de notificação do HUD se existir, senão spec adiciona `src/ui/toast.ts` mínimo.

### 6.4 Botão "Voltar ao Menu"

Adicionar na sidebar. Click → confirm ("Voltar ao menu? Seu progresso será salvo automaticamente.") → save final síncrono → **`destruirMundo(mundo, app)`** (função nova, inverso de `criarMundo`) → recria `mundoMenu` → mostra main menu.

### 6.5 Configurações — chaves mínimas

Módulo `src/core/config.ts`:

```ts
interface Config {
  autosaveIntervalMs: number;          // default 60000
  saveMode: 'periodic' | 'experimental'; // default 'periodic'
}
```

API: `getConfig()`, `setConfig(partial: Partial<Config>)`, persiste em `localStorage['orbital_config']`.

Tela provisória de Configurações em `src/ui/settings-panel.ts` com **dois controles**:

- Dropdown **Autosave**: Desligado / 30s / 1min / 2min / 5min
- Toggle **Save experimental em tempo real (IndexedDB)** — com descrição curta

Spec de Settings (próximo) expande essa tela com áudio/gráficos/jogabilidade sem reescrever — a estrutura fica pronta.

### 6.6 Loading screen

Reutiliza `loading-screen` atual. No carregamento de save, texto vira "Carregando mundo: &lt;nome&gt;".

### 6.7 Estado de erro visível

Banner discreto no topo do HUD quando `_ultimoSaveErro !== null`. Texto curto + botão "Detalhes" pra modal com stack. Some no próximo save bem-sucedido.

---

## 7. Versionamento, migrations, testes

### 7.1 Schema version

Cada DTO top-level tem `schemaVersion: number`. Começa em `1`.

Regra: mudança não-compatível (renomear, remover, mudar tipo ou estrutura de referência) incrementa. Adicionar campo opcional não incrementa.

### 7.2 Migrations

Arquivo: `src/world/save/migrations.ts`

```ts
const CURRENT_VERSION = 1;

// migrations[i] migra da versão (i+1) pra (i+2).
// Ou seja: v1 → v2 é migrations[0], v2 → v3 é migrations[1], etc.
const migrations: Array<(dto: any) => any> = [
  // Vazio no v1 — nenhuma migration necessária ainda.
];

export function migrarDto(raw: any): MundoDTO {
  let current = raw;
  const from = current.schemaVersion ?? 1;
  if (from > CURRENT_VERSION) {
    throw new Error(
      `Save é de versão ${from}, mais nova que a atual (${CURRENT_VERSION}). Atualize o jogo.`,
    );
  }
  for (let v = from; v < CURRENT_VERSION; v++) {
    const migrate = migrations[v - 1];
    if (!migrate) throw new Error(`Sem migration pra v${v}→v${v + 1}`);
    current = migrate(current);
    current.schemaVersion = v + 1;
  }
  return current as MundoDTO;
}
```

Quando `CURRENT_VERSION = 1` e `from = 1`, o loop não executa e retorna o DTO direto — identity migration. Correto.

Fluxo no load:

1. Parse → checa `schemaVersion`.
2. `< CURRENT_VERSION` → roda migrations.
3. `> CURRENT_VERSION` → modal "Save criado em versão mais nova do jogo — atualize o jogo pra abrir."
4. `=== CURRENT_VERSION` → direto pro `reconstruirMundo()`.

### 7.3 Save corrompido

Qualquer erro no load (parse, migration, reconstruir):

- Modal "Não foi possível carregar o mundo 'X'. Ele pode estar corrompido."
- Botões **Apagar mundo** e **Exportar save** (download do JSON cru pra debug).
- Log completo no `console.error`.

### 7.4 IndexedDB version separada

O `version` do `openDB` começa em `1`, é um segundo nível de versionamento (schema de stores), separado do `schemaVersion` do DTO. Futuras mudanças disparam `onupgradeneeded`.

### 7.5 Testing strategy

Runner: **adicionar `vitest`** como devDep. Cabe bem com Vite (zero config), `npm run test`. Tests em `src/world/save/__tests__/`.

**Unit tests**:

1. **Roundtrip DTO↔mundo**: mundo de teste pequeno (1 sistema, 3 planetas, 2 naves com estados variados) → `serializar` → `reconstruir` → `serializar` → DTOs idênticos. Cobre nave orbitando, nave viajando, nave com rotaCargueira, planeta com construção em andamento, planeta com pesquisa em andamento.
2. **Referências preservadas**: depois do reconstruir, `nave.origem === planetasById.get(nave.origemId)` é `true`.
3. **Migrations**: `migrarDto` em versão current é identity. Quando existir v1→v2, teste de input v1 → output v2 com campos esperados.
4. **Save corrupto**: JSON inválido, DTO com ref órfã, schemaVersion futuro — cada um lança erro esperado.
5. **Config**: get/set de `autosaveIntervalMs` e `saveMode`.

**Manual playtesting checklist** (documentado pro QA):

*Fluxo básico:*

1. Criar mundo "A", jogar 30s, F5 (reload hard) → volta no main menu → "Mundos Salvos" mostra A → carregar → estado igual.
2. Criar mundo "A", fechar aba → reabrir → carregar → mesmo.
3. Setar autosave 30s, jogar 31s, F5 → progresso dos últimos 31s presente.
4. Setar autosave = Desligado, jogar 1min, F5 → só o estado inicial volta.
5. Modo experimental on, jogar 10s, F5 → progresso dos 10s presente.
6. Apagar save da lista → não está mais lá.
7. Nome duplicado na criação → erro inline, modal não fecha.

*Cobertura de campos específicos do `Mundo` (cada caso exerce um pedaço do DTO):*

8. **Fog-of-war**: jogar até descobrir um planeta inimigo, afastar nave até o planeta sair do alcance de visão, esperar fog cobrir (fantasma com "há 20s atrás" visível). F5 e carregar. Checar: planeta ainda aparece como fantasma com texto de idade consistente (não zerou), dono/fábricas/naves do último avistamento preservados.
9. **Pesquisa em andamento**: começar uma pesquisa, esperar 40% de progresso, F5. Carregar. Barra de progresso continua em 40%, tempo restante correto.
10. **Construção em andamento**: começar uma fábrica, 50% de progresso, F5. Carregar. Construção continua de onde parou.
11. **Nave em survey**: enviar batedora pra planeta, entrar em `fazendo_survey`, 30% de progresso, F5. Carregar. Survey continua.
12. **Nave em piloting**: entrar em modo `pilotando` uma colonizadora com `thrustX/Y` ≠ 0, F5. Carregar. Nave volta em `pilotando` com os mesmos vetores de thrust.
13. **Cargueira mid-loop**: configurar rota de cargueira com `loop: true`, pegar a nave no meio da fase `destino` com carga parcial, F5. Carregar. Rota, fase, carga e loop preservados.
14. **Construção de nave na fila**: adicionar 3 itens na fila de produção de nave de um planeta, deixar a primeira 60% pronta, F5. Fila e progresso da atual preservados.
15. **Naves descobertas com memória**: planeta inimigo descoberto, nave dele capturada pelo fog com estado histórico, F5. A memória mostra o snapshot correto.

*Erros e fallback:*

16. `localStorage.clear()` no devtools durante jogo → próximo autosave mostra erro de quota.
17. (Experimental) Firefox modo privado → fallback automático pro periódico, toast de aviso.
18. (Experimental) Kill the tab durante jogo → reabrir → estado dos últimos segundos presente via emergency blob.
19. Corromper manualmente o JSON do save em devtools → tentar carregar → modal de erro com botão "Apagar mundo" e "Exportar save".
20. Criar vários mundos na mesma sessão (sem recarregar) → verificar que `_nomesUsados` foi resetado entre mundos (planetas não ganham nomes fora do padrão).

### 7.6 Performance budget

- **Periódico**: `autosaveTick()` ≤ 10ms p95 em mundo de 18 sistemas. Medido com `performance.now()`.
- **Experimental**: flush não impacta FPS. `app.ticker.FPS` ≥ 55 durante flushes.
- Instrumentação opcional: linha no debug menu mostrando tempo do último flush.
- Extrapolar requer investigação antes de merge.

---

## 8. Estrutura final de arquivos

**Novos** (~15):

```
src/core/config.ts
src/world/save/dto.ts
src/world/save/serializar.ts
src/world/save/reconstruir.ts
src/world/save/periodic-save.ts
src/world/save/experimental-save.ts
src/world/save/indexed-db.ts
src/world/save/migrations.ts
src/world/save/storage-backend.ts        # abstração comum listar/deletar mundos
src/world/save/index.ts                  # re-exports públicos
src/world/save/__tests__/roundtrip.test.ts
src/world/save/__tests__/migrations.test.ts
src/world/save/__tests__/config.test.ts
src/ui/new-world-modal.ts
src/ui/settings-panel.ts
src/ui/toast.ts                          # se não existir sistema de notificação
```

**Modificados** (~8):

```
src/world/mundo.ts          # extrair criarMundoVazio(app, tamanho),
                            # adicionar IDs em sol/planeta/sistema,
                            # destruirMundo(mundo, app) (novo)
src/world/sistema.ts        # IDs estáveis em sistema/sol/planeta na criação;
                            # expor factories pro reconstruir
src/world/planeta.ts        # campo id + nada mais
src/world/nevoa.ts          # expor getMemoria/setMemoria que reconstruir usa
                            # pra popular o WeakMap no load
src/world/nomes.ts          # nenhum (já expõe resetarNomesPlanetas)
src/ui/main-menu.ts         # lista saves real, flow com new-world-modal
src/ui/sidebar.ts           # botões Salvar e Voltar ao Menu
src/main.ts                 # iniciarJogoNovo + carregarMundo + entrarNoJogo
                            # helper comum, autosave wiring
```

**Config**:

```
package.json                # + vitest
vitest.config.ts            # novo
```

---

## 9. Riscos e mitigações

| Risco                                                       | Mitigação                                                              |
|-------------------------------------------------------------|------------------------------------------------------------------------|
| Shader/graphics recriado no load divergindo do original     | Extrair `criarMundoVazio` como helper compartilhado; `reconstruirMundo` reusa as mesmas factories (`criarEstrelaProcedural`, `criarPlanetaProceduralSprite`, `criarMemoriaVisualPlaneta`) que `criarMundo` usa. Testes manuais visuais no playtesting checklist. |
| Memória de fog-of-war perdida no load                       | Serializada como `MemoriaPlanetaDTO` por planeta; no load, `reconstruirMundo` chama `criarMemoriaVisualPlaneta` + popula o WeakMap com timestamp rebased via `idadeMs`. Caso de teste dedicado no playtesting (#8). |
| Timestamps `performance.now()` inválidos após reload        | Regra da §3.2: qualquer timestamp persistido é convertido pra `idadeMs` no save e rebased no load. `Mundo.ultimoTickMs` não persistido — valor fresco no load. |
| `_nomesUsados` global acumulando entre mundos da sessão     | `reconstruirMundo` chama `resetarNomesPlanetas()` e pré-registra nomes do save no Set. Caso de teste #20. |
| IndexedDB em modo privado Firefox falha silenciosa          | Fallback automático + toast. Documentado no tratamento de erro.        |
| `localStorage` cheio no meio da sessão                      | Modal de gerenciamento de saves, autosave pausado até liberar.         |
| Circular ref acidental no `serializarMundo`                 | Tipos DTO explícitos; `JSON.stringify` falha cedo em dev com stack.    |
| Save de versão futura aberto em build antiga                | Modal explícito pedindo atualização; não tenta processar.              |
| `beforeunload` no experimental não consegue flush async     | Emergency blob síncrono em `localStorage` + merge no próximo boot.     |
| Custo de flush "tudo dirty" no experimental ser alto        | Performance budget no spec; fase 2 (dirty granular) documentada como evolução se precisar. |

---

## 10. Dependências com outros specs

- **Settings (spec 2)**: expande `src/core/config.ts` e `src/ui/settings-panel.ts`. Este spec cria os dois com escopo mínimo; Settings adiciona chaves e controles sem reescrever.
- **Input system (spec 3)**: independente. Os botões novos da sidebar usam listeners diretos por ora; quando o sistema de input centralizado existir, migram pra ações nomeadas.
- **i18n (spec 4)**: independente. Strings novas deste spec são PT hardcoded como todo o resto do projeto. Spec de i18n vai extrair tudo junto.
- **GitHub Pages (spec 5)**: independente.
