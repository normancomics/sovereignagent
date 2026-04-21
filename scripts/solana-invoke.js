/**
 * scripts/solana-invoke.js
 *
 * Node.js client for the PhantomOperator Solana program.
 *
 * Supports three sub-commands:
 *
 *   init-registry   – Initialise the operator's on-chain registry PDA.
 *   invoke-skill    – Invoke a skill (transfers SOL + records the invocation).
 *   read-registry   – Read and print the current registry state.
 *
 * Prerequisites
 *   npm install @solana/web3.js
 *
 * Usage (set env vars or pass flags)
 *   SOLANA_CLUSTER=devnet \
 *   SOLANA_KEYPAIR_PATH=~/.config/solana/id.json \
 *   SOLANA_PROGRAM_ID=<deployed-program-id> \
 *   node scripts/solana-invoke.js init-registry
 *
 *   node scripts/solana-invoke.js invoke-skill --skill-id 0 --amount 1000000
 *
 *   node scripts/solana-invoke.js read-registry
 */

'use strict';

require('dotenv').config();

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
  clusterApiUrl,
} = require('@solana/web3.js');

const fs   = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const CLUSTER      = process.env.SOLANA_CLUSTER      || 'devnet';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH ||
                     path.join(process.env.HOME || '~', '.config', 'solana', 'id.json');
const PROGRAM_ID   = process.env.SOLANA_PROGRAM_ID;

// Matches REGISTRY_SEED in lib.rs
const REGISTRY_SEED = Buffer.from('phantom_registry');

// Matches SKILL_MIN_PRICES in lib.rs
const SKILL_MIN_PRICES = [
  1_000_000,  // 0: threat-scan
  5_000_000,  // 1: data-removal
  10_000_000, // 2: full-privacy-sweep
  5_000_000,  // 3: opsec-score
  2_000_000,  // 4: breach-check
  1_000_000,  // 5: metadata-audit
];

const SKILL_NAMES = [
  'threat-scan',
  'data-removal',
  'full-privacy-sweep',
  'opsec-score',
  'breach-check',
  'metadata-audit',
];

// Instruction discriminants (Borsh enum variant indices)
const IX_INIT_REGISTRY = 0;
const IX_INVOKE_SKILL  = 1;

// ── Borsh helpers (minimal, no external dependency) ──────────────────────────

/**
 * Encode a u8 enum variant with no fields.
 */
function encodeInitRegistry() {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(IX_INIT_REGISTRY, 0);
  return buf;
}

/**
 * Encode InvokeSkill { skill_id: u8, amount_lamports: u64 }.
 * Layout: [variant:1][skill_id:1][amount:8] = 10 bytes
 */
function encodeInvokeSkill(skillId, amountLamports) {
  const buf = Buffer.alloc(10);
  buf.writeUInt8(IX_INVOKE_SKILL, 0);
  buf.writeUInt8(skillId, 1);
  // Write u64 little-endian
  const bigAmt = BigInt(amountLamports);
  buf.writeBigUInt64LE(bigAmt, 2);
  return buf;
}

/**
 * Decode the on-chain RegistryState from raw account data.
 * Layout: [is_initialized:1][owner:32][total_invocations:8][total_fees:8]
 */
function decodeRegistryState(data) {
  if (!data || data.length < 49) {
    throw new Error(`Registry account data too short: ${data?.length ?? 0} bytes (expected 49)`);
  }
  const isInitialized    = data.readUInt8(0) === 1;
  const owner            = new PublicKey(data.slice(1, 33));
  const totalInvocations = data.readBigUInt64LE(33);
  const totalFees        = data.readBigUInt64LE(41);
  return { isInitialized, owner, totalInvocations, totalFees };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadKeypair(filePath) {
  const resolved = filePath.startsWith('~')
    ? filePath.replace('~', process.env.HOME || '')
    : filePath;
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function getRegistryPda(programId, ownerPubkey) {
  return PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, ownerPubkey.toBuffer()],
    programId,
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] || true;
      i++;
    }
  }
  return args;
}

// ── Sub-commands ──────────────────────────────────────────────────────────────

async function cmdInitRegistry(connection, payer, programId) {
  const [registryPda] = getRegistryPda(programId, payer.publicKey);

  console.log(`Initialising registry for operator: ${payer.publicKey.toBase58()}`);
  console.log(`Registry PDA                       : ${registryPda.toBase58()}`);

  const data = encodeInitRegistry();

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey,  isSigner: true,  isWritable: true  },
      { pubkey: registryPda,      isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log(`\nRegistry initialised! Tx signature: ${sig}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`);
}

async function cmdInvokeSkill(connection, payer, programId, args) {
  const skillId = parseInt(args['skill-id'] ?? '0', 10);
  if (isNaN(skillId) || skillId < 0 || skillId >= SKILL_NAMES.length) {
    console.error(`Invalid --skill-id. Choose 0–${SKILL_NAMES.length - 1}:`);
    SKILL_NAMES.forEach((n, i) =>
      console.error(`  ${i}: ${n}  (min ${SKILL_MIN_PRICES[i]} lamports)`));
    process.exit(1);
  }

  const minPrice = SKILL_MIN_PRICES[skillId];
  const amount   = parseInt(args['amount'] ?? String(minPrice), 10);
  if (isNaN(amount) || amount < minPrice) {
    console.error(`--amount must be >= ${minPrice} lamports for skill '${SKILL_NAMES[skillId]}'`);
    process.exit(1);
  }

  // Operator wallet = registry owner = same payer in simple setups.
  // Override with --operator if needed.
  const operatorPubkey = args['operator']
    ? new PublicKey(args['operator'])
    : payer.publicKey;

  const [registryPda] = getRegistryPda(programId, operatorPubkey);

  console.log(`Invoking skill: ${SKILL_NAMES[skillId]} (id=${skillId})`);
  console.log(`Amount        : ${amount} lamports`);
  console.log(`Operator      : ${operatorPubkey.toBase58()}`);
  console.log(`Registry PDA  : ${registryPda.toBase58()}`);

  const data = encodeInvokeSkill(skillId, amount);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey,           isSigner: true,  isWritable: true  },
      { pubkey: registryPda,               isSigner: false, isWritable: true  },
      { pubkey: operatorPubkey,            isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId,   isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY,       isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx  = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log(`\nSkill invoked! Tx signature: ${sig}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`);
}

async function cmdReadRegistry(connection, payer, programId, args) {
  const ownerPubkey = args['owner']
    ? new PublicKey(args['owner'])
    : payer.publicKey;

  const [registryPda] = getRegistryPda(programId, ownerPubkey);
  console.log(`Reading registry PDA: ${registryPda.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(registryPda);
  if (!accountInfo) {
    console.error('Registry account not found. Run init-registry first.');
    process.exit(1);
  }

  const state = decodeRegistryState(Buffer.from(accountInfo.data));
  console.log('\nRegistry state:');
  console.log(`  is_initialized      : ${state.isInitialized}`);
  console.log(`  owner               : ${state.owner.toBase58()}`);
  console.log(`  total_invocations   : ${state.totalInvocations}`);
  console.log(`  total_fees_lamports : ${state.totalFees}`);
  console.log(`  total_fees_SOL      : ${Number(state.totalFees) / 1e9} SOL`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [, , subCommand, ...rest] = process.argv;
  const args = parseArgs(rest);

  const validSubCommands = ['init-registry', 'invoke-skill', 'read-registry'];
  if (!subCommand || !validSubCommands.includes(subCommand)) {
    console.log('Usage: node scripts/solana-invoke.js <sub-command> [options]');
    console.log('');
    console.log('Sub-commands:');
    console.log('  init-registry                        Initialise the on-chain registry');
    console.log('  invoke-skill --skill-id <n> --amount <lamports>  Invoke a skill');
    console.log('  read-registry [--owner <pubkey>]     Read registry state');
    console.log('');
    console.log('Environment variables:');
    console.log('  SOLANA_CLUSTER      devnet|testnet|mainnet-beta  (default: devnet)');
    console.log('  SOLANA_KEYPAIR_PATH path to keypair JSON          (default: ~/.config/solana/id.json)');
    console.log('  SOLANA_PROGRAM_ID   deployed program public key   (required)');
    console.log('');
    console.log('Skill IDs:');
    SKILL_NAMES.forEach((n, i) =>
      console.log(`  ${i}: ${n.padEnd(22)} min ${SKILL_MIN_PRICES[i]} lamports`));
    process.exit(subCommand ? 1 : 0);
  }

  if (!PROGRAM_ID) {
    console.error('ERROR: SOLANA_PROGRAM_ID is not set.');
    console.error('Deploy the program first with solana/scripts/deploy.sh, then set SOLANA_PROGRAM_ID in .env');
    process.exit(1);
  }

  const programId   = new PublicKey(PROGRAM_ID);
  const rpcUrl      = CLUSTER === 'mainnet-beta'
    ? (process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'))
    : clusterApiUrl(CLUSTER);
  const connection  = new Connection(rpcUrl, 'confirmed');
  const payer       = loadKeypair(KEYPAIR_PATH);

  console.log(`Cluster   : ${CLUSTER}`);
  console.log(`Program ID: ${PROGRAM_ID}`);
  console.log(`Payer     : ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance   : ${balance / 1e9} SOL`);
  console.log('');

  switch (subCommand) {
    case 'init-registry':
      await cmdInitRegistry(connection, payer, programId);
      break;
    case 'invoke-skill':
      await cmdInvokeSkill(connection, payer, programId, args);
      break;
    case 'read-registry':
      await cmdReadRegistry(connection, payer, programId, args);
      break;
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
