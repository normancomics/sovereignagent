#!/usr/bin/env bash
# solana/scripts/build.sh
#
# Compile the PhantomOperator Solana program into a deployable .so binary.
#
# Prerequisites
#   - Rust toolchain  (https://rustup.rs)
#   - Solana CLI      (https://docs.solana.com/cli/install-solana-cli-tools)
#
# Usage
#   ./solana/scripts/build.sh [--release]   (default: release build)
#   ./solana/scripts/build.sh --debug

set -euo pipefail

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROGRAM_DIR="$REPO_ROOT/solana/programs/phantom_operator"
OUT_DIR="$REPO_ROOT/solana/deploy"

# ── Parse arguments ───────────────────────────────────────────────────────────
BUILD_TYPE="release"
for arg in "$@"; do
  case "$arg" in
    --debug)   BUILD_TYPE="debug"   ;;
    --release) BUILD_TYPE="release" ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--release|--debug]"
      exit 1
      ;;
  esac
done

echo ""
echo "PhantomOperator — Solana program build"
echo "======================================="
echo "Program dir : $PROGRAM_DIR"
echo "Output dir  : $OUT_DIR"
echo "Build type  : $BUILD_TYPE"
echo ""

# ── Prerequisite check ────────────────────────────────────────────────────────
for cmd in cargo cargo-build-sbf; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found."
    echo "Run solana/scripts/check-solana.sh for setup instructions."
    exit 1
  fi
done

# ── Build ─────────────────────────────────────────────────────────────────────
cd "$PROGRAM_DIR"

if [[ "$BUILD_TYPE" == "release" ]]; then
  cargo build-sbf
else
  cargo build-sbf --debug
fi

# ── Copy artifacts ────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"

SBF_OUT="$PROGRAM_DIR/../../target/deploy"
SO_FILE="$SBF_OUT/phantom_operator.so"

if [[ ! -f "$SO_FILE" ]]; then
  # cargo-build-sbf 1.18 writes to target/deploy relative to the workspace root
  SO_FILE="$REPO_ROOT/target/deploy/phantom_operator.so"
fi

if [[ -f "$SO_FILE" ]]; then
  cp "$SO_FILE" "$OUT_DIR/phantom_operator.so"
  echo ""
  echo "Built artifact: $OUT_DIR/phantom_operator.so"
  ls -lh "$OUT_DIR/phantom_operator.so"
else
  # Report where cargo-build-sbf placed the file so the user can find it.
  echo ""
  echo "NOTE: .so file not found at expected paths. Searching…"
  find "$REPO_ROOT/target" -name "phantom_operator.so" 2>/dev/null || true
  echo "Check the output above for the compiled .so path."
fi

echo ""
echo "Build complete. Next: run solana/scripts/deploy.sh to deploy."
