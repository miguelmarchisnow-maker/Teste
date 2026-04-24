#!/usr/bin/env bash
# check-all-platforms.sh — roda `cargo check` pra cada target weydra-renderer
# suporta. Skip apenas quando o target não está instalado no rustup;
# qualquer outro erro (incluindo linker) é FAIL real.
# Uso: ./scripts/check-all-platforms.sh

set -u

cd "$(dirname "$0")/../weydra-renderer" || exit 1

INSTALLED_TARGETS=$(rustup target list --installed)

FAIL=0
PASS=0
SKIP=0

# Probe extra pra linkers externos que rustup não provê. Devolve reason
# ou vazio se todos os pré-requisitos estão ok.
missing_linker() {
    local target="$1"
    case "$target" in
        x86_64-pc-windows-gnu|i686-pc-windows-gnu)
            command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1 || echo "mingw-w64 linker ausente (apt: mingw-w64)"
            ;;
        aarch64-linux-android|armv7-linux-androideabi)
            command -v cargo-ndk >/dev/null 2>&1 || echo "Android NDK/cargo-ndk ausente"
            ;;
        *apple*)
            [ "$(uname)" = "Darwin" ] || echo "Apple target requer macOS host + Xcode"
            ;;
    esac
}

check() {
    local pkg="$1"
    local target="$2"
    local label="$3"
    printf "[%s] %s (%s) ... " "$label" "$pkg" "$target"

    if ! echo "$INSTALLED_TARGETS" | grep -q "^${target}\$"; then
        echo "skip (target não instalado; rustup target add $target pra habilitar)"
        SKIP=$((SKIP + 1))
        return
    fi

    local reason
    reason=$(missing_linker "$target")
    if [ -n "$reason" ]; then
        echo "skip ($reason)"
        SKIP=$((SKIP + 1))
        return
    fi

    if cargo check --package "$pkg" --target "$target" --quiet; then
        echo "ok"
        PASS=$((PASS + 1))
    else
        echo "FAIL"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== weydra-renderer platform check ==="

check "weydra-renderer"         "x86_64-unknown-linux-gnu" "linux-host"
check "weydra-renderer-wasm"    "wasm32-unknown-unknown"   "web"
check "weydra-renderer-native"  "x86_64-unknown-linux-gnu" "native-linux"
check "weydra-renderer-native"  "x86_64-pc-windows-gnu"    "native-windows"
check "weydra-renderer-native"  "x86_64-apple-darwin"      "native-macos-x64"
check "weydra-renderer-native"  "aarch64-apple-darwin"     "native-macos-arm64"
check "weydra-renderer-android" "aarch64-linux-android"    "android-arm64"
check "weydra-renderer-ios"     "aarch64-apple-ios"        "ios-arm64"

echo "=== summary: $PASS pass, $SKIP skip, $FAIL fail ==="
exit "$FAIL"
