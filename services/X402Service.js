require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');

// ─── x402 / Superfluid configuration ─────────────────────────────────────────
// Superfluid x402 facilitator endpoint (Base mainnet)
const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402.superfluid.org';
// CDP x402 Bazaar service directory
const X402_BAZAAR_URL = process.env.X402_BAZAAR_URL || 'https://api.developer.coinbase.com/rpc/v1/base';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// ─── x402 protocol helpers ───────────────────────────────────────────────────

/**
 * Build a standard x402 service listing payload.
 * This is submitted to both the Superfluid facilitator and the CDP Bazaar.
 *
 * @param {object} opts
 * @param {string}   opts.agentName         Human-readable name
 * @param {string}   opts.agentAddress      Wallet address that receives payments
 * @param {string}   opts.serviceEndpoint   HTTPS URL of the agent's HTTP endpoint
 * @param {string}   opts.description       Short description of the service
 * @param {string[]} opts.skills            Array of skill names offered
 * @param {string}   opts.pricePerRequest   Price per request (string, e.g. "0.001")
 * @param {string}   [opts.superToken]      Super-token symbol (default: USDCx)
 * @param {number}   [opts.tokenDecimals]   Decimal places for the super-token (default: 6 for USDCx)
 * @returns {object} x402 service payload
 */
function buildServicePayload(opts) {
  const {
    agentName,
    agentAddress,
    serviceEndpoint,
    description,
    skills = [],
    pricePerRequest = '0.001',
    superToken = 'USDCx',
    tokenDecimals = 6, // USDCx uses 6; override for 18-decimal tokens (e.g. DAIx)
  } = opts;

  return {
    name: agentName,
    description,
    endpoint: serviceEndpoint,
    paymentConfig: {
      type: 'x402',
      version: 1,
      network: 'base-mainnet',
      payTo: agentAddress,
      maxAmountRequired: ethers.utils.parseUnits(pricePerRequest, tokenDecimals).toString(),
      asset: superToken,
      extra: {
        description: `Payment for ${agentName} service`,
        mimeType: 'application/json',
      },
    },
    skills,
    version: '1.0.0',
  };
}

/**
 * Register (or update) this agent as an x402-compatible service with the
 * Superfluid x402 facilitator on Base.
 *
 * @param {object} serviceOpts  Same shape as buildServicePayload opts
 * @returns {Promise<object>}   Registration response from the facilitator
 */
async function registerWithSuperfluidX402(serviceOpts) {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');

  const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const payload = buildServicePayload(serviceOpts);

  // Sign the registration payload so the facilitator can verify ownership
  const payloadStr = JSON.stringify(payload);
  const signature = await wallet.signMessage(payloadStr);

  const body = { payload, signature, signer: wallet.address };

  console.log('X402Service: registering with Superfluid x402 facilitator...');
  const resp = await axios.post(`${X402_FACILITATOR_URL}/register`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
  });

  console.log('X402Service: Superfluid x402 registration response:', resp.data);
  return resp.data;
}

/**
 * List this agent's service in the CDP x402 Bazaar (service directory).
 *
 * @param {object} serviceOpts  Same shape as buildServicePayload opts
 * @param {string} [apiKey]     CDP API key (falls back to CDP_API_KEY env var)
 * @returns {Promise<object>}   Bazaar listing response
 */
async function listInX402Bazaar(serviceOpts, apiKey) {
  const key = apiKey || process.env.CDP_API_KEY;
  if (!key) throw new Error('CDP_API_KEY not set in .env — required for Bazaar listing.');

  const payload = buildServicePayload(serviceOpts);

  console.log('X402Service: listing service in CDP x402 Bazaar...');
  const resp = await axios.post(`${X402_BAZAAR_URL}/bazaar/services`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    timeout: 20000,
  });

  console.log('X402Service: Bazaar listing response:', resp.data);
  return resp.data;
}

/**
 * Verify that the x402 payment header sent by a client is valid.
 * Call this from your HTTP server middleware before fulfilling a paid request.
 *
 * @param {string} paymentHeader   Value of the `X-PAYMENT` request header
 * @param {string} expectedPayTo   Wallet address that should receive funds
 * @param {string} minAmount       Minimum accepted amount in USDC micro-units (string)
 * @returns {Promise<boolean>}
 */
async function verifyX402Payment(paymentHeader, expectedPayTo, minAmount) {
  try {
    const resp = await axios.post(`${X402_FACILITATOR_URL}/verify`, {
      paymentHeader,
      expectedPayTo,
      minAmount,
    }, { timeout: 10000 });
    return resp.data && resp.data.valid === true;
  } catch (err) {
    console.error('X402Service: payment verification failed:', err.message || err);
    return false;
  }
}

module.exports = {
  buildServicePayload,
  registerWithSuperfluidX402,
  listInX402Bazaar,
  verifyX402Payment,
};
