#!/usr/bin/env bash
# check-platform-guards.sh — verifica invariantes de dependência por crate
# (ver docs/weydra-renderer/platform-guards.md). Grep detecta `use`,
# `extern crate`, `pub use` em código Rust, e deps declaradas em Cargo.toml.
# Rodar localmente antes de commit.

set -u
cd "$(dirname "$0")/../weydra-renderer" || exit 1

FAIL=0

# forbid_crate <dir> <crate_name>...
forbid_crate() {
    local src="$1/src"
    local cargo="$1/Cargo.toml"
    shift
    for forbidden in "$@"; do
        # Patterns em código Rust — uso via use/extern crate/pub use.
        # Regex word-boundary evita false positives (ex: web_sys_foo).
        if [ -d "$src" ]; then
            if grep -rnE -w "$forbidden" "$src" 2>/dev/null | grep -E "^[^:]+:[0-9]+:[[:space:]]*(pub[[:space:]]+)?(use|extern crate)" >/dev/null; then
                echo "VIOLAÇÃO: '$forbidden' usado em $src"
                grep -rnE -w "$forbidden" "$src" | grep -E "^[^:]+:[0-9]+:[[:space:]]*(pub[[:space:]]+)?(use|extern crate)"
                FAIL=$((FAIL + 1))
            fi
        fi
        # Pattern no Cargo.toml — dep declarada em qualquer forma TOML:
        #   `foo = ...` ou `  foo = ...` (inline, possivelmente indentado em [target.cfg.dependencies])
        #   `[dependencies.foo]` ou `[target.'cfg(...)'.dependencies.foo]` (section header)
        # Testamos ambas variantes dash/underscore do nome.
        local dash="${forbidden//_/-}"
        if [ -f "$cargo" ] && grep -Eq "(^|[[:space:]])(${forbidden}|${dash})[[:space:]]*=|dependencies\.(${forbidden}|${dash})(\]|\.)" "$cargo"; then
            echo "VIOLAÇÃO: '$forbidden' declarado como dep em $cargo"
            FAIL=$((FAIL + 1))
        fi
    done
}

echo "=== platform-guards check ==="

# core não pode ter NADA platform-specific
forbid_crate "core"             web_sys js_sys wasm_bindgen wasm_bindgen_futures winit

# native: sem deps browser
forbid_crate "adapters/native"  wasm_bindgen web_sys js_sys

# android: sem deps browser
forbid_crate "adapters/android" wasm_bindgen web_sys js_sys

# ios: sem browser nem winit (UIKit direto)
forbid_crate "adapters/ios"     wasm_bindgen web_sys js_sys winit

# wasm: sem winit
forbid_crate "adapters/wasm"    winit

echo "=== $FAIL violations ==="
exit "$FAIL"
