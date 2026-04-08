# PhantomOperator

Created by normancomics — normancomics.eth · normancomics.base.eth · normancomics.reserve.superfluid.eth · 0x3d95d4a6dbae0cd0643a82b13a13b08921d6adf7

**PhantomOperator** is a **multi-operator privacy and OPSEC framework** for people who want to *vanish* from data brokers, minimize surveillance, and maintain stealth online.

- Agentic swarms coordinate:
  - Automated data-broker opt-outs and prioritized threat remediation
  - OSINT / PII threat scans
  - OPSEC exposure scoring
  - Metadata and tracking audits
  - Breach checks via k-anonymity
- Monetized on **Base** (USDCx / ERC-20 via x402).
- Optional **Monero payments** for users who do not want any public-chain correlation.
- Designed for integration with RAG and MCP so other agents / LLMs can call PhantomOperator as a backend.
- Intended for listing on **CryptoSkill**, **Coinbase CDP Bazaar**, **8004scan.io**, and other agent registries.

---

## Architecture Overview

PhantomOperator is **not** a single agent. It is an **agentic framework** composed of cooperating operators and swarms.

### 1. OrchestratorOperator (Core Brain)

The `OrchestratorOperator` coordinates everything:

- Receives high-level intents via:
  - HTTP API (`/skills/...`)
  - Future: scheduled jobs (Postgres + `pg_cron`)
  - Future: MCP tool calls
- Decomposes work into sub-tasks:
  - Which data brokers to target
  - Which OSINT surfaces to scan
  - Which breach / metadata checks to run
- Delegates tasks to domain operators.
- Tracks job status and aggregates results for the caller.

### 2. Domain Operators

Each operator focuses on a specific piece of the privacy / OPSEC surface:

- **SearchOperator**  
  (backed by `SearchAgent`)  
  OSINT / PII search and threat discovery.

- **BrokerOperator**  
  (backed by `BrokerAgent`)  
  Data-broker opt-outs and prioritized threat remediation.

- **OpsecOperator**  
  (backed by `OpsecAgent`)  
  Multi-vector OPSEC exposure scoring (handles, emails, names).

- **BreachOperator**  
  (backed by `BreachAgent`)  
  Email/password breach checks via k-anonymity APIs.

- **MetadataOperator**  
  (backed by `MetadataAgent`)  
  HTTP/HTML metadata, trackers, and fingerprinting audits.

Existing `/skills/*` endpoints already map to these capabilities; over time they will be internally routed through `OrchestratorOperator`.

### 3. Sub-Operators & Swarms (Planned)

PhantomOperator extends into swarms of smaller operators:

- **Broker-specific sub-operators**
  - One per broker (Spokeo, Whitepages, BeenVerified, etc.).
  - Encapsulates URLs, form flows, and required PII.
- **Scraper sub-operators**
  - Focused crawlers / scrapers for specific OSINT surfaces.
- **Swarms**
  - A swarm is a set of sub-operators executing in parallel across a target identity.
  - Triggered by:
    - Direct calls like `POST /skills/full-privacy-sweep`
    - Scheduled pg_cron jobs (e.g. weekly sweeps)
    - Events (e.g. a new breach detection).

### 4. Storage, Jobs & Scheduling (Planned)

Planned job system (optional but recommended):

- **Postgres** as a central store:
  - `jobs` table — queued tasks with type, payload, status, timestamps.
  - `job_results` table — normalized results per operator run.
- **`pg_cron`** for scheduling recurring tasks:
  - e.g. daily OSINT sweeps, weekly broker re-checks, breach monitoring.
- **Worker processes**:
  - One or more Node.js workers poll `jobs` where `status = 'pending'`,
    delegate to operators, and write back `status` and results.

PhantomOperator runs as a regular Node.js HTTP server; Postgres is only required when you enable scheduled jobs and persistence.

---

## Payments & Monetization

### On-chain (Base via x402)

PhantomOperator uses an x402-compatible payment middleware (HTTP 402 Payment Required):

- For a paid skill:
  1. Client calls `POST /skills/{id}` without payment.
  2. Server responds with `402` and a JSON x402 descriptor:
     - network: Base mainnet
     - asset: payment token (e.g. USDCx)
     - payTo: receiver address
     - maxAmountRequired: skill price
  3. Client pays and submits a signed proof in the `X-PAYMENT` header.
  4. PhantomOperator validates the proof and serves the response.

See [`server.js`](server.js) for:

- `SKILL_PRICES`
- `validatePayment(...)`
- x402 enforcement in `handlePaidSkill(...)`

### Monero (True Privacy Path)

For users who do **not** want any public-chain trace:

- Primary Monero address:

  `83povooYdUgEArc13ZzaVp5vqGpDpKJ6WJ971NL94sbRcneqBtXB7N3XLN57v1fqddbinPjYCcwjk7AkrrwVJupFNU84XCq`

#### Intended Monero Flow (Design)

1. Client requests a Monero quote:

   `POST /billing/monero-quote`  
   `{ "skillId": "full-privacy-sweep" }`

2. PhantomOperator (or a trusted Monero bridge service) returns:

   - XMR amount
   - Monero address or subaddress
   - One-time invoice token.

3. Client pays from their Monero wallet.

4. Bridge service detects payment and issues a signed proof (JSON/JWT) bound to the invoice token.

5. Client calls `POST /skills/{id}` with:

   - `X-PAYMENT-METHOD: monero`
   - `X-PAYMENT: <base64(moneroProofJson)>`

6. PhantomOperator verifies the proof via the bridge:

   - If valid and unused → executes the skill.
   - Otherwise → returns `402` with payment instructions.

> Implementation detail: Monero wallet/node operations are intended to run in a separate service; this repo focuses on integration and validation hooks.

---

## RAG & MCP Integration

PhantomOperator can be used as a **back-end OPSEC engine** for other agents via RAG and MCP.

### RAG (Retrieval-Augmented Generation)

Two retrieval layers:

1. **Broker / Legal Knowledge**
   - Vector index of:
     - Broker privacy policies
     - Opt-out documentation
     - Data protection laws (GDPR, CCPA, etc.).
   - Operators query this index to generate:
     - Correct removal flows
     - Compliant letters / emails / webform payloads.

2. **User Context**
   - Per-identity “case file”:
     - Known brokers with profiles removed
     - Successful / pending removals
     - Preferred channels and previous findings.
   - RAG ensures each new action builds on history; reduces redundant work.

### MCP (Model Context Protocol)

PhantomOperator exposes skills as MCP tools, so LLMs and agent frameworks can call it directly:

Planned MCP tools (examples):

- `phantom_threat_scan`
- `phantom_data_removal`
- `phantom_full_privacy_sweep`
- `phantom_opsec_score`
- `phantom_breach_check`
- `phantom_metadata_audit`

MCP manifests and tool schemas live under `/mcp/` and map to:

- HTTP endpoints (e.g. `/skills/threat-scan`)
- JSON parameter/response schemas
- Pricing hints (x402 + Monero paths)

---

## Agent Registries & Discovery

PhantomOperator is built to integrate with:

- **CryptoSkill** (x402 skill registry)
- **Coinbase CDP Bazaar** (agent registry on Base)
- **8004scan.io** (autonomous agent explorer)
- Other agent registries.

Registry manifests live under:

```text
/registry-manifests
  cryptoskill.json
  cdp-bazaar.json
  8004scan.json
```

Each manifest defines:

- Name, description, maintainer
- Public base URL
- List of skills, paths, and methods
- Chain (Base), token address, and payment receiver
- Optional Monero payment details.

Your deployment just needs to expose:

- `GET /health`
- `GET /manifest`

and host at a stable public URL.

---

## HTTP API (Current)

Public endpoints:

- `GET  /health`
- `GET  /manifest`

Paid skill endpoints (x402 / Monero):

- `POST /skills/threat-scan`
- `POST /skills/data-removal`
- `POST /skills/full-privacy-sweep`
- `POST /skills/opsec-score`
- `POST /skills/breach-check`
- `POST /skills/metadata-audit`

See [`server.js`](server.js) for expected request bodies and validation.
