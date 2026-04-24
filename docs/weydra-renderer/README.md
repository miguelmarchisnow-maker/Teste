# weydra-renderer

Custom 2D GPU renderer em Rust + wgpu. Substitui Pixi.js no jogo Orbital e roda em múltiplas plataformas via adapters.

## Platform Matrix

| Platform | Backend | Adapter | Status |
|---|---|---|---|
| Web (Chrome/Edge/Safari 17+) | WebGPU | `adapters/wasm` | ✅ Full (M1-M10) |
| Web (Firefox/Safari iOS) | WebGL2 | `adapters/wasm` | ✅ Full (M1-M10) |
| Linux desktop | Vulkan | `adapters/native` | 🟡 Skeleton (M1.5) / Full M11 |
| Windows desktop | DX12 / Vulkan | `adapters/native` | 🟡 Skeleton (M1.5) / Full M11 |
| macOS desktop | Metal | `adapters/native` | 🟡 Skeleton (M1.5) / Full M11 |
| Steam Deck | Vulkan | `adapters/native` | 🟡 Skeleton (M1.5) / Full M11 |
| Android | Vulkan + GLES | `adapters/android` | 🟡 Skeleton (M1.5) / Full M12 |
| iOS | Metal | `adapters/ios` | 🟡 Placeholder (M1.5) / Full M12 |

**Legend:** ✅ Playable · 🟡 cargo check passa, adapter incompleto · ⚫ planejado

## Build

- **Web:** `npm run build:renderer` na raiz do Orbital (usa wasm-pack)
- **Native desktop:** `cargo check --package weydra-renderer-native` ou `cargo run --package hello-clear` pro example
- **Android cross-check:** `cargo check --package weydra-renderer-android --target aarch64-linux-android` (precisa NDK)
- **All platforms:** `./scripts/check-all-platforms.sh`
- **Platform guards audit:** `./scripts/check-platform-guards.sh`

## Platform Guards

Ver [platform-guards.md](./platform-guards.md) pra invariantes de dependência por crate. Regra de ouro: `core/` só depende de `wgpu` + Rust puro; adapters têm todas as platform deps.
