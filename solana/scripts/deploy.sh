#!/usr/bin/env bash
# solana/scripts/deploy.sh
#
# Deploy (or upgrade) the PhantomOperator Solana program to devnet, testnet,
# or mainnet-beta.
#
# Prerequisites
#   - Solana CLI configured: `solana config set --url <cluster>`
#   - A funded Solana keypair at ~/.config/solana/id.json (or SOLANA_KEYPAIR_PATH)
#   - The compiled .so file at solana/deploy/phantom_operator.so
#     (run solana/scripts/build.sh first)
#
# Usage
#   ./solana/scripts/deploy.sh [--cluster devnet|testnet|mainnet-beta]
#                              [--keypair <path>]
#                              [--program-id <path-to-keypair.json>]

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SO_FILE="$REPO_ROOT/solana/deploy/phantom_operator.so"

CLUSTER="${SOLANA_CLUSTER:-devnet}"
KEYPAIR="${SOLANA_KEYPAIR_PATH:-$HOME/.config/solana/id.json}"
PROGRAM_KEYPAIR=""  # Optional: path to the program's keypair .json for upgrades

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cluster)
      CLUSTER="$2"
      shift 2
      ;;
    --keypair)
      KEYPAIR="$2"
      shift 2
      ;;
    --program-id)
      PROGRAM_KEYPAIR="$2"
      shift 2
      ;;
    --so-file)
      SO_FILE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--cluster devnet|testnet|mainnet-beta] [--keypair <path>] [--program-id <keypair.json>] [--so-file <path>]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Run '$0 --help' for usage."
      exit 1
      ;;
  esac
done

# ── Validate cluster ──────────────────────────────────────────────────────────
case "$CLUSTER" in
  devnet|testnet|mainnet-beta) ;;
  *)
    echo "ERROR: --cluster must be one of: devnet, testnet, mainnet-beta"
    exit 1
    ;;
esac

echo ""
echo "PhantomOperator — Solana program deployment"
echo "============================================"
echo "Cluster    : $CLUSTER"
echo "Keypair    : $KEYPAIR"
echo ".so file   : $SO_FILE"
[[ -n "$PROGRAM_KEYPAIR" ]] && echo "Program ID : $PROGRAM_KEYPAIR"
echo ""

# ── Prerequisite checks ───────────────────────────────────────────────────────
if ! command -v solana &>/dev/null; then
  echo "ERROR: 'solana' CLI not found."
  echo "Run solana/scripts/check-solana.sh for setup instructions."
  exit 1
fi

if [[ ! -f "$SO_FILE" ]]; then
  echo "ERROR: .so file not found at $SO_FILE"
  echo "Run solana/scripts/build.sh first."
  exit 1
fi

if [[ ! -f "$KEYPAIR" ]]; then
  echo "ERROR: keypair not found at $KEYPAIR"
  echo "Generate one with: solana-keygen new --outfile $KEYPAIR"
  exit 1
fi

# ── Configure cluster ─────────────────────────────────────────────────────────
solana config set --url "$CLUSTER" --keypair "$KEYPAIR"

# ── Airdrop on devnet / testnet if balance is low ────────────────────────────
if [[ "$CLUSTER" == "devnet" || "$CLUSTER" == "testnet" ]]; then
  BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}' || echo "0")
  if [[ "$BALANCE" -lt 1000000000 ]]; then
    echo "Balance is low ($BALANCE lamports). Requesting airdrop…"
    solana airdrop 2 || echo "Airdrop may have failed (rate-limited). Continue anyway."
  fi
fi

echo "Deployer wallet: $(solana address)"
echo "Balance        : $(solana balance)"
echo ""

# ── Deploy ────────────────────────────────────────────────────────────────────
DEPLOY_CMD=(solana program deploy "$SO_FILE" --keypair "$KEYPAIR")

if [[ -n "$PROGRAM_KEYPAIR" ]]; then
  # Upgrade an existing program (preserves the program ID).
  DEPLOY_CMD+=(--program-id "$PROGRAM_KEYPAIR")
fi

echo "Running: ${DEPLOY_CMD[*]}"
echo ""

DEPLOY_OUTPUT=$("${DEPLOY_CMD[@]}" 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract and display the program ID.
PROGRAM_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -1 || true)
if [[ -n "$PROGRAM_ID" ]]; then
  echo ""
  echo "============================================"
  echo "Deployed program ID: $PROGRAM_ID"
  echo ""
  echo "Set this in your .env:"
  echo "  SOLANA_PROGRAM_ID=$PROGRAM_ID"
  echo ""
  echo "Verify on explorer:"
  case "$CLUSTER" in
    devnet)       echo "  https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet" ;;
    testnet)      echo "  https://explorer.solana.com/address/$PROGRAM_ID?cluster=testnet" ;;
    mainnet-beta) echo "  https://explorer.solana.com/address/$PROGRAM_ID" ;;
  esac
  echo "============================================"
fi
