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
  sistemaId: number;
  x: number;
  y: number;
  orbita: OrbitaPlaneta;          // já é plain data
  dados: DadosPlaneta;            // já é plain data — copy raso
  visivelAoJogador: boolean;
  descobertoAoJogador: boolean;
}

interface NaveDTO {
  id: string;
  tipo: string;
  tier: number;
  dono: string;
  x: number;
  y: number;
  estado: Nave['estado'];
  carga: Recursos;
  configuracaoCarga: Recursos;
  orbita: OrbitaNave | null;
  surveyTempoRestanteMs?: number;
  surveyTempoTotalMs?: number;
  thrustX?: number;
  thrustY?: number;
  origemId: string;
  alvo: AlvoDTO | null;
  rotaManual: AlvoPontoDTO[];
  rotaCargueira: RotaCargueiraDTO | null;
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

- `Nave.alvo` → discriminated union `AlvoDTO`:
  - `_tipoAlvo === 'planeta'` → `{ tipo: 'planeta', id: alvo.id }`
  - `_tipoAlvo === 'sol'` → `{ tipo: 'sol', id: alvo.id }`
  - `_tipoAlvo === 'ponto'` → `{ tipo: 'ponto', x, y }`
  - `null` → `null`
- `Nave.origem` → `origemId: origem.id`
- `Nave.rotaCargueira.origem/destino` → IDs ou `null`
- `Sistema.sol` → `solId`
- `Sistema.planetas` → `planetaIds[]`
- Ordem estável: sistemas, sóis, planetas, naves **ordenados por ID**. Isso torna diffs de save inspecionáveis e simplifica testes de roundtrip.

A função retorna um novo objeto; não muta o mundo.

### 3.3 `reconstruirMundo(dto, app): Promise<Mundo>`

Arquivo: `src/world/save/reconstruir.ts`

Contraparte de `criarMundo()`. Segue a mesma ordem de montagem pra minimizar divergência de comportamento.

Fluxo:

1. **Containers base**: cria `container`, `fundo`, `navesContainer`, `rotasContainer`, `visaoContainer`, `frotasContainer`, `orbitasContainer`, `memoriaPlanetasContainer`. O código atual em `criarMundo` que faz isso deve ser extraído pra um helper `criarMundoVazio(app)` que os dois consomem.
2. **Sóis**: pra cada `SolDTO`, recria `Container`, aplica shader procedural de estrela, seta `_raio`, `_cor`, `_visivelAoJogador`, `_descobertoAoJogador`, position. Monta `solsById: Map<string, Sol>`.
3. **Planetas**: pra cada `PlanetaDTO`, recria `Container`, graphics de órbita e anel, aplica shader procedural de planeta, copia `dados` do DTO (com clone de `pesquisas`), seta `_orbita`, visibilidade, position. Monta `planetasById: Map<string, Planeta>`.
4. **Sistemas**: pra cada `SistemaDTO`, usa os mapas pra resolver `solId` → `Sol` e `planetaIds[]` → `Planeta[]`. Monta o objeto `Sistema`.
5. **Naves**: pra cada `NaveDTO`, cria o objeto `Nave` com campos planos, resolve `origemId` → `planetasById.get(origemId)`, resolve `alvo` conforme o discriminator (`planeta`/`sol`/`ponto`), resolve `rotaCargueira.origemId/destinoId`. Cria `gfx: Container` vazio, `rotaGfx: Graphics` vazio. Sprites podem iniciar `undefined` — o código existente de sprite async pending cuida do resto.
6. **Mundo**: monta o objeto `Mundo` com os arrays, containers, e campos top-level do DTO (`tamanho`, `tipoJogador`, `ultimoTickMs`, `fontesVisao`).
7. **Stage**: adiciona `mundo.container` ao `app.stage` e retorna.

**Erros de referência**: se `origemId` ou qualquer ID referenciado não existe no save, lança `Error('Save corrompido: referência órfã <id>')`. Não tenta consertar.

---

## 4. Modo periódico (default)

Arquivo: `src/world/save/periodic-save.ts`

### 4.1 Cadência

`setInterval` fora do ticker do Pixi. Intervalo lido de `config.autosaveIntervalMs` (default `60000`). Se `=== 0`, autosave desligado.

Por que não usar o ticker: ticker roda a 60Hz, é pausável pelo debug menu, e autosave não precisa sync de frame.

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

Index secundário `mundoNome` em cada store pra listar/apagar eficientemente por mundo.

Load de um mundo: 1 `get` em `mundos` + 4 `getAll` filtrados por `mundoNome`. DTOs remontados em memória, passam pelo `reconstruirMundo()` igual ao modo periódico.

Partitioned (não um blob único) porque structured clone custa proporcional ao tamanho do registro — registros pequenos são ordens de magnitude mais baratos.

### 5.3 Dirty tracking

Três níveis:

- **Per-entity**: `planeta._dirty: boolean`, `nave._dirty: boolean`, etc. Não serializado, só memória.
- **Per-category**: `mundoDirty: { sistemas: Set<string>; sois: Set<string>; planetas: Set<string>; naves: Set<string>; header: boolean }`. Reseta a cada flush.
- **Header**: qualquer alteração em campos top-level (`ultimoTickMs`, `fontesVisao`, `tempoJogadoMs`).

**Fase 1 (deste spec — pragmática)**: ao final de cada `atualizarMundo()`, marca **tudo como dirty** (todas as naves, todos os planetas, todos os sóis, header). Força flush completo por ciclo. Zero instrumentação nos pontos de mutação. Simples, entrega valor.

**Fase 2 (não implementada neste spec)**: instrumentar pontos de mutação reais (conclusão de fábrica, troca de estado de nave, etc.) pra flush verdadeiramente granular. Só vale se profiling mostrar custo de flush. Documentada como caminho evolutivo.

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

**Solução**: em `beforeunload`, serializa estado dirty pra um blob JSON e grava **sincronamente** em `localStorage` na chave `orbital_emergency:<nome>`. No próximo boot, o sistema detecta essa chave e faz merge: aplica o emergency blob por cima do IndexedDB (que provavelmente tava até 500ms atrasado), apaga o emergency. Garante zero perda mesmo em shutdown abrupto.

### 5.6 Tratamento de erro

- **IndexedDB falha ao abrir** (ex: Firefox modo privado): fallback automático pro modo periódico, toast "Modo experimental indisponível — usando save padrão". Config **não muda** — próxima tentativa repete.
- **`QuotaExceededError`**: mesma UI do modo periódico.
- **3 flushes consecutivos falhando**: desativa modo experimental automaticamente, escala pro periódico, aviso persistente.

### 5.7 Custo esperado

Flush por tick com "tudo dirty" = ~100 `put()` numa transaction + 1 `put()` de header. IndexedDB processa em <10ms em worker interno do browser. Async = zero impacto main thread. Impacto em FPS = 0.

---

## 6. UI e fluxo do usuário

### 6.1 Criação de mundo — nome obrigatório

Hoje "Novo Jogo" chama `iniciarJogo()` direto. Muda pra:

1. Click em **Novo Jogo** → abre modal `new-world-modal.ts` (overlay sobre o main menu, estilo dos cards HUD existentes).
2. Modal tem:
   - Campo texto **Nome do mundo** (required, 1–40 chars, trim, único entre saves existentes — colisão mostra erro inline).
   - Dropdown/radio **Tipo de jogador** (o `getTipos()[0]` atual como default; move-se da seleção atual pra cá).
   - Preview do nome no título do card, estilo `menu-title`.
   - Botões **Criar** (primary) e **Cancelar**.
3. Click em Criar → valida → chama `iniciarJogo(nome, tipoJogador)` (assinatura nova).
4. `iniciarJogo` recebe os params, seta `mundo.nome`, registra no índice, inicia o autosave.

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

const migrations: Array<(dto: any) => any> = [
  // migrations[0]: v1 → v2 (vazio por enquanto)
];

export function migrarDto(raw: any): MundoDTO {
  let current = raw;
  const from = current.schemaVersion ?? 0;
  for (let v = from; v < CURRENT_VERSION; v++) {
    const migrate = migrations[v - 1];
    if (!migrate) throw new Error(`Sem migration pra v${v}→v${v + 1}`);
    current = migrate(current);
    current.schemaVersion = v + 1;
  }
  return current as MundoDTO;
}
```

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

1. Criar mundo "A", jogar 30s, F5 (reload hard) → volta no main menu → "Mundos Salvos" mostra A → carregar → estado igual.
2. Criar mundo "A", fechar aba → reabrir → carregar → mesmo.
3. Setar autosave 30s, jogar 31s, F5 → progresso dos últimos 31s presente.
4. Setar autosave = Desligado, jogar 1min, F5 → só o estado inicial volta.
5. Modo experimental on, jogar 10s, F5 → progresso dos 10s presente.
6. Apagar save da lista → não está mais lá.
7. Nome duplicado na criação → erro inline, modal não fecha.
8. `localStorage.clear()` no devtools durante jogo → próximo autosave mostra erro de quota.
9. (Experimental) Firefox modo privado → fallback automático pro periódico, toast de aviso.
10. (Experimental) Kill the tab durante jogo → reabrir → estado dos últimos segundos presente via emergency blob.

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

**Modificados** (~6):

```
src/world/mundo.ts          # criarMundoVazio helper, IDs, destruirMundo
src/world/planeta.ts        # campo id
src/world/naves.ts          # refs já por ID implícito via DTO
src/ui/main-menu.ts         # lista saves real, flow com new-world-modal
src/ui/sidebar.ts           # botões Salvar e Voltar ao Menu
src/main.ts                 # iniciarJogo(nome, tipo), carregarMundo, autosave wiring
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
| Shader/graphics recriado no load divergindo do original     | Extrair `criarMundoVazio` como helper compartilhado; garantir que `criarMundo` e `reconstruirMundo` usam o mesmo caminho. Testes manuais visuais no playtesting checklist. |
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
