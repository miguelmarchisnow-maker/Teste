# Orbital — Roadmap

## Vision

Space strategy game focused on outsmarting opponents through expansion, tech superiority, and domination. Single-player vs personality-driven AI, with multiplayer as a future goal. Pixel art aesthetic.

---

## Phase 1 — Core Game Loop (Foundation)

The game should be playable end-to-end: start a match, expand, fight, win or lose.

- [ ] Win/lose condition: detect when a player controls all planets (or all opponents eliminated)
- [ ] Match setup screen: choose map size, number of opponents, difficulty
- [ ] Planet capture mechanic: ships arrive at enemy planet, auto-resolve combat (numbers-based)
- [ ] Basic AI: expand to nearby unclaimed planets, build ships, attack when stronger
- [ ] Planet ownership visuals: clear color/indicator per player
- [ ] Game over screen with stats

## Phase 2 — Planet Specialization & Economy

Planets feel different and matter strategically.

- [ ] Planet traits system: each planet has innate bonuses (production, research, resource-rich, etc.)
- [ ] Planet trait visibility: show traits in planet info panel
- [ ] Resource production tied to planet traits
- [ ] Building effectiveness influenced by planet traits
- [ ] Strategic value: some planets are worth fighting for, others are filler

## Phase 3 — Research Tree

Tech is a major strategic axis.

- [ ] Redesign research into a proper tech tree (not just linear tiers)
- [ ] Branching paths: military, economy, expansion, special
- [ ] Meaningful unlocks: new ship types, building upgrades, combat bonuses, economic boosts
- [ ] Research speed tied to planet specialization (research planets matter)
- [ ] AI uses research strategically based on personality

## Phase 4 — AI Personalities

Replayability through varied opponents.

- [ ] AI personality types:
  - Aggressive — rushes early, attacks frequently
  - Turtle — defends, builds up, strikes late
  - Expansionist — grabs planets fast, spreads thin
  - Balanced — adapts to the situation
- [ ] Difficulty tiers per personality (easy/medium/hard)
- [ ] AI decision-making: when to expand, when to attack, when to defend
- [ ] AI scouting behavior (respects fog of war)

## Phase 5 — Fog of War & Scouting

Information warfare is core.

- [ ] Fog of war fully enforced: can't see enemy planets/ships without vision
- [ ] Scout ships are essential for intel
- [ ] Vision radius per planet and ship
- [ ] Reveal mechanics: scouts reveal temporarily, planets reveal permanently in radius
- [ ] AI must scout too (no cheating on easy, partial cheating on hard)
- [ ] Strategic tension: unknown enemy strength, surprise attacks

## Phase 6 — Pixel Art Visual Overhaul

Shift from procedural shaders to pixel art.

- [ ] Define pixel art style guide (resolution, palette, style references)
- [ ] Planet sprites (replace shader-generated planets)
- [ ] Ship sprites per type
- [ ] Star/background pixel art
- [ ] UI redesign in pixel art style
- [ ] Building/infrastructure sprites
- [ ] Animations: ship movement, combat, explosions, construction
- [ ] Particle effects in pixel style

## Phase 7 — Match Configuration & Polish

Make the game feel complete for single-player.

- [ ] Match settings: map size (small/medium/large), opponent count, AI personalities, difficulty
- [ ] Game speed control (pause, 1x, 2x, 3x)
- [ ] Minimap improvements
- [ ] Tutorial/onboarding flow
- [ ] Sound effects and music
- [ ] Save/load game state
- [ ] Balance pass: ship costs, research times, planet output, AI fairness

## Phase 8 — Multiplayer

The long-term goal.

- [ ] Networking architecture (client-server or P2P)
- [ ] Game state synchronization
- [ ] Lobby system: create/join matches
- [ ] Multiplayer match settings
- [ ] Latency handling and reconnection
- [ ] Anti-cheat basics (fog of war integrity)

---

## Principles

- **Playable first, pretty later** — get the game loop working before visual overhaul
- **AI makes the game** — invest in AI personalities, they are the content
- **Simple economy, deep strategy** — complexity comes from decisions, not resource management
- **Fog of war is non-negotiable** — hidden information creates the tension
- **Pixel art is the identity** — commit to the aesthetic fully when the time comes
