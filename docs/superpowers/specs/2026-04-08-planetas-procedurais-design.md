# Planetas Procedurais — Design Spec

## Objetivo

Substituir os sprites PNG estáticos de planetas por geração procedural em tempo real via shaders GLSL, baseado no projeto [Deep-Fold/PixelPlanets](https://github.com/Deep-Fold/PixelPlanets).

## Escopo

- Portar 4 tipos de planeta: comum (Terran), marte (Dry Terran), roxo (Islands), gasoso (Gas Giant)
- Shader GLSL em tempo real via PixiJS 8 Filter
- Resolução 64x64 pixels (estilo pixel-art)
- Substituição completa dos PNGs — sem fallback

## Arquitetura do Shader

Um único fragment shader parametrizável. Pipeline:

1. UV → esferificação (simular esfera 3D via `sqrt(1.0 - dot(centered, centered))`)
2. UV esférico + time → FBM noise (3 octaves, seed-based)
3. Noise vs thresholds → selecionar cor da paleta
4. Distância do light_origin → iluminação dia/noite
5. Dithering ordenado (Bayer-like) → efeito pixel-art

### Uniforms compartilhados

| Uniform | Tipo | Descrição |
|---|---|---|
| `u_seed` | float | Seed único por planeta |
| `u_pixels` | float | Resolução (64.0) |
| `u_time` | float | Tempo para rotação/animação |
| `u_light_origin` | vec2 | Direção da luz (posição do sol) |
| `u_rotation` | float | Ângulo inicial aleatório |

### Uniforms por tipo

| Uniform | Tipo | Descrição |
|---|---|---|
| `u_colors` | vec4[6] | Paleta de cores do terreno |
| `u_land_cutoff` | float | Threshold de terreno |
| `u_river_cutoff` | float | Threshold de rios/detalhes |
| `u_cloud_cover` | float | Cobertura de nuvens |
| `u_dither_size` | float | Tamanho do dithering |

### Mapeamento de tipos

| Tipo atual | PixelPlanets | Paleta |
|---|---|---|
| comum | Terran/Rivers | azuis + verdes + marrons |
| marte | Dry Terran | vermelhos + laranjas + marrons |
| roxo | Islands | roxos + magentas + azuis |
| gasoso | Gas Giant | faixas horizontais, amarelos + laranjas |

## Integração com PixiJS

- Cada planeta será um `Sprite` com um `Filter` customizado (não mais `AnimatedSprite`)
- O game loop atualiza `u_time` nos filtros a cada frame
- `u_light_origin` é calculado a partir da posição relativa do sol do sistema

## Arquivos

### Novos

- `src/shaders/planeta.frag` — fragment shader GLSL
- `src/shaders/planeta.vert` — vertex shader passthrough
- `src/world/planeta-procedural.ts` — criação de planetas procedurais, paletas, uniforms

### Modificados

- `src/world/planeta.ts` — `criarPlanetaSprite()` passa a usar shader em vez de AnimatedSprite
- `src/world/sistema.ts` — passa light_origin, atualiza u_time

### Inalterados

- `src/types.ts`, `src/world/naves.ts`, `src/world/recursos.ts` — dados de produção, órbitas, etc.

## Noise

FBM com 3 octaves baseado em hash pseudo-random: `sin(dot(coord, vec2(12.9898, 78.233))) * 15.5453`. Cada octave dobra a frequência e halva a amplitude.

## Dithering

Dithering ordenado nas bordas entre cores e na transição dia/noite: `mod(uv.x + uv.y, 2.0 / pixels)` cria padrão Bayer-like para efeito pixel-art.
