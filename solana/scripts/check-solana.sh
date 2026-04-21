#!/usr/bin/env bash
# solana/scripts/check-solana.sh
#
# Verify that all required tools are present before attempting a build or
# deployment.  Prints a summary and exits non-zero if anything is missing.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  local min_version="${3:-}"

  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>&1 | head -1)
    echo -e "${GREEN}[OK]${NC}  $name — $version"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}[MISSING]${NC}  $name ($cmd) — not found in PATH"
    if [[ -n "$min_version" ]]; then
      echo -e "        ${YELLOW}Install hint:${NC} $min_version"
    fi
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "PhantomOperator — Solana toolchain check"
echo "========================================="

check "Rust / cargo"   cargo   "curl https://sh.rustup.rs -sSf | sh"
check "rustfmt"        rustfmt "rustup component add rustfmt"
check "clippy"         clippy  "rustup component add clippy"
check "Solana CLI"     solana  "sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
check "cargo-build-sbf" cargo-build-sbf "Installed automatically with the Solana CLI tool suite"

# Check Rust BPF/SBF target
if rustup target list --installed 2>/dev/null | grep -q "bpfel-unknown-none"; then
  echo -e "${GREEN}[OK]${NC}  Rust target — bpfel-unknown-none"
  PASS=$((PASS + 1))
else
  echo -e "${YELLOW}[WARN]${NC} Rust target bpfel-unknown-none not explicitly listed"
  echo        "        (cargo build-sbf will install it automatically on first run)"
fi

echo ""
echo "-----------------------------------------"
echo -e "Passed: ${GREEN}$PASS${NC}  |  Failed: ${RED}$FAIL${NC}"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}Please install the missing tools before running build.sh or deploy.sh.${NC}"
  echo "See solana/README.md for detailed setup instructions."
  exit 1
fi

echo -e "${GREEN}All required tools are present. You are ready to build.${NC}"
