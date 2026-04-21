# PhantomOperator — Solana Deployment Guide

This directory contains everything needed to build and deploy the
PhantomOperator on-chain program to Solana.

---

## Directory structure

```text
solana/
├── programs/
│   └── phantom_operator/
│       ├── Cargo.toml        Rust project manifest
│       └── src/
│           └── lib.rs        BPF/SBF program source code
├── deploy/                   (created by build.sh) compiled .so artifacts
├── scripts/
│   ├── check-solana.sh       Verify toolchain prerequisites
│   ├── build.sh              Compile the program into a .so binary
│   └── deploy.sh             Deploy (or upgrade) the program on-chain
└── README.md                 ← you are here
```

---

## Prerequisites

### 1. Rust toolchain

```bash
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
```

### 2. Solana CLI tool suite

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

Add the Solana bin directory to your `PATH` (the installer prints the exact
command — typically `export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"`).

Verify the installation:

```bash
solana --version
cargo-build-sbf --version
```

### 3. Check everything at once

```bash
./solana/scripts/check-solana.sh
```

---

## Generating a deployment keypair

If you do not already have a Solana keypair, generate one:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

For a dedicated program keypair (lets you redeploy to the same address):

```bash
solana-keygen new --outfile solana/deploy/phantom_operator-keypair.json
```

> **Security:** Never commit keypair files to source control.  
> `solana/deploy/` is excluded by `.gitignore`.

---

## Building the program

```bash
# Default (release build)
./solana/scripts/build.sh

# Debug build (larger binary, more log output)
./solana/scripts/build.sh --debug
```

The compiled `phantom_operator.so` is written to `solana/deploy/`.

You can also build manually:

```bash
cd solana/programs/phantom_operator
cargo build-sbf
# Output: ../../target/deploy/phantom_operator.so
```

---

## Deploying to devnet

1. Configure the Solana CLI to use devnet and your keypair:

   ```bash
   solana config set --url devnet --keypair ~/.config/solana/id.json
   ```

2. Fund your wallet (devnet only):

   ```bash
   solana airdrop 2
   ```

3. Deploy:

   ```bash
   ./solana/scripts/deploy.sh --cluster devnet
   ```

   Or with explicit flags:

   ```bash
   ./solana/scripts/deploy.sh \
     --cluster devnet \
     --keypair ~/.config/solana/id.json \
     --so-file solana/deploy/phantom_operator.so
   ```

4. The script prints the deployed **Program ID**.  
   Copy it into your `.env`:

   ```env
   SOLANA_PROGRAM_ID=<printed-program-id>
   ```

---

## Deploying to mainnet-beta

> Deploying to mainnet requires real SOL.  
> Ensure your wallet is funded before proceeding.

```bash
./solana/scripts/deploy.sh --cluster mainnet-beta
```

---

## Upgrading an existing deployment

Pass the program keypair used during the initial deploy to preserve the
program address:

```bash
./solana/scripts/deploy.sh \
  --cluster devnet \
  --program-id solana/deploy/phantom_operator-keypair.json
```

---

## Interacting with the program from Node.js

Install the Solana web3.js client:

```bash
npm install @solana/web3.js
```

### Initialise the operator registry (once per operator)

```bash
SOLANA_PROGRAM_ID=<your-program-id> \
node scripts/solana-invoke.js init-registry
```

### Invoke a skill

```bash
SOLANA_PROGRAM_ID=<your-program-id> \
node scripts/solana-invoke.js invoke-skill \
  --skill-id 0 \
  --amount 1000000
```

Skill IDs:

| ID | Slug                 | Min price (lamports) |
|----|----------------------|----------------------|
|  0 | threat-scan          |          1 000 000   |
|  1 | data-removal         |          5 000 000   |
|  2 | full-privacy-sweep   |         10 000 000   |
|  3 | opsec-score          |          5 000 000   |
|  4 | breach-check         |          2 000 000   |
|  5 | metadata-audit       |          1 000 000   |

### Read registry state

```bash
SOLANA_PROGRAM_ID=<your-program-id> \
node scripts/solana-invoke.js read-registry
```

---

## Program overview

The on-chain program (`lib.rs`) exposes two instructions:

### `InitRegistry`

Creates a PDA account (`seeds = [b"phantom_registry", operator_pubkey]`) that
stores:

| Field                 | Type    | Description                              |
|-----------------------|---------|------------------------------------------|
| `is_initialized`      | bool    | Set to `true` after init                 |
| `owner`               | Pubkey  | Operator wallet that receives payments   |
| `total_invocations`   | u64     | Running count of all invocations         |
| `total_fees_lamports` | u64     | Running sum of all lamports received     |

### `InvokeSkill { skill_id: u8, amount_lamports: u64 }`

- Validates `skill_id` (0–5) and `amount_lamports ≥ SKILL_MIN_PRICES[skill_id]`.
- Transfers `amount_lamports` from the caller to the operator wallet.
- Increments the registry counters.
- Emits a program log with the skill name, payer, amount, and slot.

---

## Running unit tests

```bash
cd solana/programs/phantom_operator
cargo test
```

---

## Environment variables

Add these to your `.env` (see `.env.example` for all variables):

```env
# Solana cluster: devnet | testnet | mainnet-beta
SOLANA_CLUSTER=devnet

# Path to the deployer / payer keypair JSON file
SOLANA_KEYPAIR_PATH=~/.config/solana/id.json

# Program ID returned by deploy.sh
SOLANA_PROGRAM_ID=

# (optional) Custom RPC URL for mainnet-beta (Alchemy, QuickNode, etc.)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `cargo-build-sbf: command not found` | Solana CLI not in PATH | Re-source your shell or open a new terminal after installing the CLI |
| `Error: RPC response error -32002` | Account not found | Run `init-registry` before `invoke-skill` |
| `Error: insufficient funds` | Wallet balance too low | Airdrop on devnet, or fund mainnet wallet |
| `.so file not found` | Build step skipped | Run `./solana/scripts/build.sh` first |
| `PDA mismatch` | Wrong program ID or owner | Check `SOLANA_PROGRAM_ID` and `--operator` flag |
