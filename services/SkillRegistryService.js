require('dotenv').config();
const axios = require('axios');

// CryptoSkill.org public API base (submit agent + skill manifests)
const CRYPTOSKILL_API = process.env.CRYPTOSKILL_API || 'https://cryptoskill.org/api/v1';
const CRYPTOSKILL_API_KEY = process.env.CRYPTOSKILL_API_KEY;

/**
 * Build a CryptoSkill agent manifest.
 * This is the standardised JSON object submitted to cryptoskill.org for indexing.
 *
 * @param {object} opts
 * @param {string}   opts.agentName          Human-readable agent name
 * @param {string}   opts.agentAddress        On-chain wallet / contract address
 * @param {string}   opts.description         Short description of the agent
 * @param {string[]} opts.skills              Skill names the agent provides
 * @param {string}   [opts.metadataURI]       URI to full agent metadata JSON
 * @param {string}   [opts.serviceEndpoint]   HTTPS URL clients call
 * @param {string}   [opts.onChainRegistryId] agentId from the identity registry
 * @returns {object}
 */
function buildAgentManifest(opts) {
  const {
    agentName,
    agentAddress,
    description,
    skills = [],
    metadataURI = '',
    serviceEndpoint = '',
    onChainRegistryId = '',
  } = opts;

  return {
    name: agentName,
    address: agentAddress,
    description,
    skills: skills.map(s => (typeof s === 'string' ? { name: s } : s)),
    metadataURI,
    serviceEndpoint,
    onChainRegistryId,
    registeredAt: new Date().toISOString(),
  };
}

/**
 * Register an agent (and its skills) with CryptoSkill.org.
 *
 * @param {object} manifestOpts  Options passed to buildAgentManifest()
 * @returns {Promise<object>}    API response from cryptoskill.org
 */
async function registerWithCryptoSkill(manifestOpts) {
  const manifest = buildAgentManifest(manifestOpts);

  const headers = { 'Content-Type': 'application/json' };
  if (CRYPTOSKILL_API_KEY) {
    headers['Authorization'] = `Bearer ${CRYPTOSKILL_API_KEY}`;
  }

  console.log(`SkillRegistryService: registering "${manifest.name}" with CryptoSkill.org...`);
  const resp = await axios.post(`${CRYPTOSKILL_API}/agents`, manifest, { headers, timeout: 20000 });

  console.log('SkillRegistryService: CryptoSkill registration response:', resp.data);
  return resp.data;
}

/**
 * Register an individual novel skill under an already-registered agent.
 *
 * @param {string} agentAddress     Agent's wallet address
 * @param {object} skillOpts
 * @param {string}   skillOpts.name          Skill name, e.g. "DataBrokerOptOut"
 * @param {string}   skillOpts.description   Human-readable description
 * @param {string}   [skillOpts.category]    Category tag (e.g. "privacy", "data", "search")
 * @param {string}   [skillOpts.metadataURI] URI to skill manifest / ABI / docs
 * @returns {Promise<object>}
 */
async function registerSkillWithCryptoSkill(agentAddress, skillOpts) {
  const headers = { 'Content-Type': 'application/json' };
  if (CRYPTOSKILL_API_KEY) {
    headers['Authorization'] = `Bearer ${CRYPTOSKILL_API_KEY}`;
  }

  const body = {
    agentAddress,
    skill: skillOpts,
    registeredAt: new Date().toISOString(),
  };

  console.log(`SkillRegistryService: registering skill "${skillOpts.name}" for ${agentAddress}...`);
  const resp = await axios.post(`${CRYPTOSKILL_API}/skills`, body, { headers, timeout: 20000 });

  console.log('SkillRegistryService: skill registration response:', resp.data);
  return resp.data;
}

/**
 * Fetch the current listing for an agent from CryptoSkill.org.
 * @param {string} agentAddress
 * @returns {Promise<object|null>}
 */
async function getAgentListing(agentAddress) {
  const headers = {};
  if (CRYPTOSKILL_API_KEY) headers['Authorization'] = `Bearer ${CRYPTOSKILL_API_KEY}`;
  try {
    const resp = await axios.get(`${CRYPTOSKILL_API}/agents/${agentAddress}`, { headers, timeout: 10000 });
    return resp.data;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err;
  }
}

module.exports = {
  buildAgentManifest,
  registerWithCryptoSkill,
  registerSkillWithCryptoSkill,
  getAgentListing,
};
