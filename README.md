# Health Portal Backend

Patient portal backend for a private medical practice, built on [Medplum](https://www.medplum.com/) (FHIR R4 CDR) with [PhenoML](https://developer.pheno.ml/) AI integration, HL7 v2 interface engine, and multi-vendor EMR connectivity (Epic, Cerner, athenahealth).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Building](#building)
- [Testing](#testing)
- [Infrastructure Setup](#infrastructure-setup)
- [Bot Deployment](#bot-deployment)
- [Seed Data](#seed-data)
- [Scripts Reference](#scripts-reference)
- [Package Details](#package-details)

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 9 (ships with Node 20+)
- **Docker** and **Docker Compose** (for Medplum server, PostgreSQL, Redis)

## Project Structure

```
health-portal/
├── package.json                 # Root monorepo config (npm workspaces)
├── tsconfig.json                # Solution-style TS config with project references
├── jest.config.ts               # Multi-project Jest config
├── docker-compose.yml           # Medplum + PostgreSQL + Redis
├── medplum.config.json          # Bot definitions (12 bots, name → ID mapping)
├── config/
│   └── fhir/
│       ├── access-policies.json # 4 role-based access policies
│       └── subscriptions.json   # 13 FHIR subscription triggers
├── scripts/
│   ├── deploy-bots.ts           # Register and deploy bots to Medplum
│   ├── setup-subscriptions.ts   # Create AccessPolicy + Subscription resources
│   └── seed-data.ts             # Create synthetic FHIR test data (49 resources)
├── tests/
│   └── fixtures/                # HL7 v2 sample messages (ADT, ORU, SIU)
└── packages/
    ├── core/                    # Shared types, constants, utilities
    ├── hl7-engine/              # HL7 v2 MLLP server, router, client, transforms
    ├── emr-connectors/          # Epic, Cerner, athena FHIR connectors
    ├── phenoml/                 # PhenoML API client (Lang2FHIR, Construe, Agents, Workflows)
    └── bots/                    # Medplum bot handlers (clinical, EMR sync, HL7, admin)
```

## Quick Start

```bash
# 1. Install dependencies (all 5 workspaces resolved automatically)
npm install

# 2. Build all packages
npm run build

# 3. Run tests
npm test

# 4. Start infrastructure (see "Infrastructure Setup" below)
docker compose up -d

# 5. Configure environment (see "Environment Variables" below)
cp .env.example .env
# Edit .env with your Medplum credentials

# 6. Deploy bots, create subscriptions, and seed data
npm run deploy:bots
npx ts-node scripts/setup-subscriptions.ts
npm run seed
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

### Required (for local development)

| Variable | Description | Default |
|----------|-------------|---------|
| `MEDPLUM_BASE_URL` | Medplum FHIR server URL | `http://localhost:8103` |
| `MEDPLUM_CLIENT_ID` | ClientApplication ID from Medplum | _(create in Medplum admin)_ |
| `MEDPLUM_CLIENT_SECRET` | ClientApplication secret | _(create in Medplum admin)_ |

### Optional (for EMR + AI features)

| Variable | Description |
|----------|-------------|
| `PHENOML_API_KEY` | PhenoML API key for AI features |
| `PHENOML_BASE_URL` | PhenoML API base URL (default: `https://api.pheno.ml`) |
| `EPIC_FHIR_BASE_URL` | Epic FHIR R4 sandbox endpoint |
| `EPIC_CLIENT_ID` | Epic developer app client ID |
| `EPIC_PRIVATE_KEY_PATH` | Path to Epic JWT signing key (`.pem`) |
| `CERNER_FHIR_BASE_URL` | Cerner/Oracle Health FHIR R4 endpoint |
| `CERNER_CLIENT_ID` | Cerner app client ID |
| `CERNER_CLIENT_SECRET` | Cerner app client secret |
| `ATHENA_FHIR_BASE_URL` | athenahealth FHIR R4 endpoint |
| `ATHENA_CLIENT_ID` | athenahealth app client ID |
| `ATHENA_CLIENT_SECRET` | athenahealth app client secret |
| `HL7_LISTEN_PORT` | HL7 v2 MLLP listener port (default: `2575`) |
| `HL7_TLS_CERT_PATH` | TLS certificate for HL7 server |
| `HL7_TLS_KEY_PATH` | TLS private key for HL7 server |
| `EPIC_FHIR_ID_SYSTEM` | Epic FHIR identifier system OID (varies per organization) |
| `CERNER_FHIR_ID_SYSTEM` | Cerner FHIR identifier system OID (varies per site) |
| `ATHENA_FHIR_ID_SYSTEM` | athenahealth FHIR identifier system OID (varies per practice) |

## Building

The project uses TypeScript project references for incremental builds across all 5 packages.

```bash
# Build all packages (compiles to packages/*/dist/)
npm run build

# Clean all build artifacts
npm run clean

# Rebuild from scratch
npm run clean && npm run build
```

Build order is determined automatically by `tsconfig.json` project references:

```
core  (no deps)
  ├── phenoml         (depends on core)
  ├── hl7-engine      (depends on core)
  ├── emr-connectors  (depends on core)
  └── bots            (depends on core, phenoml, emr-connectors)
```

## Testing

Tests use [Jest](https://jestjs.io/) with [ts-jest](https://kulshekhar.github.io/ts-jest/) for direct TypeScript execution (no build step required for tests).

```bash
# Run all tests across all 5 packages
npm test

# Run tests for a specific package
npx jest --selectProjects core
npx jest --selectProjects hl7-engine
npx jest --selectProjects emr-connectors
npx jest --selectProjects phenoml
npx jest --selectProjects bots

# Run tests in watch mode
npx jest --watch

# Run with coverage
npx jest --coverage

# Run a specific test file
npx jest packages/core/src/__tests__/core.smoke.test.ts

# Show Jest configuration (useful for debugging)
npx jest --showConfig
```

### Test Suites

| Package | Test File | Tests | What's Covered |
|---------|-----------|-------|----------------|
| `core` | `core.smoke.test.ts` | 14 | Constants (LOINC/ICD-10/SNOMED URIs), utility functions (`extractMatchCriteria`, `toHl7Timestamp`/`fromHl7Timestamp` round-trip), type compilation |
| `hl7-engine` | `hl7-engine.smoke.test.ts` | 9 | `Hl7Router` routing, `Hl7Server`/`Hl7Client` instantiation, `pidToPatient` PID→FHIR Patient mapping |
| `hl7-engine` | `adt-transform.test.ts` | 9 | ADT A01/A03/A04 → Patient, Encounter, Condition, Coverage, RelatedPerson with origin tags |
| `hl7-engine` | `oru-transform.test.ts` | 8 | ORU R01 → DiagnosticReport + Observations, OBX value types (NM/ST/CE), unmatched patient handling |
| `hl7-engine` | `siu-transform.test.ts` | 5 | SIU S12/S15 → Appointment booking/cancellation with participant references |
| `hl7-engine` | `orm-transform.test.ts` | 14 | Outbound ORM^O01, ADT^A04, RDE^O11 message construction from FHIR resources |
| `hl7-engine` | `server.test.ts` | 4 | Server start/stop lifecycle, port configuration |
| `hl7-engine` | `client.test.ts` | 2 | Client instantiation, send failure handling |
| `emr-connectors` | `emr-connectors.smoke.test.ts` | 9 | All 3 connectors instantiate as `BaseEmrConnector` subclasses with correct vendor property |
| `emr-connectors` | `epic-mappings.test.ts` | 10 | Epic extension stripping, opaque ID handling, MRN/FHIR identifier mapping, OID discovery |
| `emr-connectors` | `cerner-mappings.test.ts` | 6 | CMRN preference, contained resource handling, numeric ID mapping |
| `emr-connectors` | `athena-mappings.test.ts` | 6 | Vendor extension stripping, identifier normalization |
| `phenoml` | `phenoml.smoke.test.ts` | 8 | `PhenoMlClient`, `Lang2FhirService`, `ConstructService`, `AgentService` instantiation |
| `bots` | `bots.smoke.test.ts` | 10 | All 11 exported bot handler functions exist |
| `bots` | `sync-utils.test.ts` | 27 | ID mapping (build/persist/load), reference remapping, reverse remapping, vendor identifier preservation, dependency tier sorting, deterministic/probabilistic MPI matching, ambiguous match flagging |

### Adding New Tests

Test files go in `packages/<pkg>/src/__tests__/` and must match the pattern `**/*.test.ts`.

Each package has its own `jest.config.ts` with:
- `ts-jest` preset for TypeScript support
- `node` test environment
- `moduleNameMapper` for workspace dependency resolution (e.g., `@health-portal/core` maps to source)

## Infrastructure Setup

### 1. Start Docker Services

```bash
docker compose up -d
```

This launches:
- **Medplum Server** (v3.2) on port `8103` — FHIR R4 CDR
- **PostgreSQL** (16-alpine) on port `5432` — Medplum data store
- **Redis** (7-alpine) on port `6379` — Medplum cache

Wait for health checks to pass:

```bash
docker compose ps
```

All three services should show `healthy` status.

### 2. Create Medplum Project

1. Open `http://localhost:8103` in your browser
2. Create a new project and admin user
3. Navigate to **Admin > ClientApplication**
4. Create a new ClientApplication — note the **Client ID** and **Client Secret**

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
```
MEDPLUM_CLIENT_ID=<your-client-id>
MEDPLUM_CLIENT_SECRET=<your-client-secret>
```

### 4. Stop Infrastructure

```bash
# Stop all services
docker compose down

# Stop and remove all data volumes (full reset)
docker compose down -v
```

## Bot Deployment

The project includes 12 Medplum bot definitions in `medplum.config.json`. Deploy them to your Medplum server:

```bash
npm run deploy:bots
```

This script:
1. Authenticates with Medplum using your `.env` credentials
2. Searches for each bot by name; creates it if missing
3. Writes the assigned bot IDs back to `medplum.config.json`
4. Deploys compiled bot code for bots whose source files exist

### Setup Subscriptions and Access Policies

After deploying bots, create the FHIR Subscription triggers and AccessPolicy resources:

```bash
npx ts-node scripts/setup-subscriptions.ts
```

This creates:
- **4 Access Policies**: Patient Portal, Provider, Admin, Bot-EMR-Sync
- **25 Subscriptions**: Triggers for bot execution on resource changes (multi-criteria entries like `Patient,Encounter,Observation` are split into individual subscriptions as required by Medplum)

## Seed Data

Populate the FHIR server with synthetic test data:

```bash
npm run seed
```

This creates **49 FHIR R4 resources** with real medical codes:

| Resource | Count | Coding Systems |
|----------|-------|---------------|
| Organization | 1 | NPI |
| Practitioner | 3 | NPI, qualification codes |
| Patient | 10 | MRN identifiers, varied demographics |
| Observation | 20 | LOINC (10 vitals + 10 labs) |
| Condition | 5 | ICD-10-CM + SNOMED CT dual-coded |
| MedicationRequest | 5 | RxNorm |
| Appointment | 5 | Future-dated, 30-min, booked |
| DocumentReference | 3 | LOINC-typed with base64 content |

All medical codes are real and verifiable (e.g., LOINC `4548-4` = HbA1c, ICD-10 `E11.9` = Type 2 DM, RxNorm `860975` = Metformin 500mg).

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Compile all packages to `dist/` |
| `test` | `npm test` | Run all Jest test suites |
| `lint` | `npm run lint` | ESLint across all packages |
| `clean` | `npm run clean` | Remove all `dist/` directories |
| `deploy:bots` | `npm run deploy:bots` | Register and deploy Medplum bots |
| `seed` | `npm run seed` | Create synthetic FHIR test data |
| `setup-subscriptions` | `npx ts-node scripts/setup-subscriptions.ts` | Create AccessPolicies and Subscriptions |

## Package Details

### `@health-portal/core`

Shared foundation used by all other packages.

- **Constants**: `IDENTIFIER_SYSTEMS` (MRN, NPI, SSN, Epic/Cerner/Athena FHIR IDs), `CODE_SYSTEMS` (ICD-10-CM, SNOMED, LOINC, RxNorm, CPT, CVX), `HL7_DEFAULTS`, `HL7_MESSAGE_TYPES`, `PHENOML_VOCABULARIES`
- **Types**: `EmrVendor`, `EmrConnectionConfig`, `SyncResult`, `Hl7MessageMeta`, `PhenoMlConfig`, `PatientMatchCriteria`, `IdMappingEntry`
- **Utilities**: `extractMatchCriteria()`, `resourceHash()`, `toHl7Timestamp()`, `fromHl7Timestamp()`

### `@health-portal/hl7-engine`

HL7 v2 interface engine for inbound/outbound messaging via MLLP protocol.

- **`Hl7Server`**: MLLP listener for inbound HL7 v2 messages with ACK/NAK responses and optional TLS (uses `node-hl7-server`)
- **`Hl7Router`**: Routes messages by type+event (e.g., `ADT^A01`) to registered handlers
- **`Hl7Client`**: MLLP client for outbound HL7 v2 messages with retry and exponential backoff (uses `node-hl7-client`)
- **Inbound Transforms** (HL7 v2 → FHIR R4):
  - `transformAdt()` — ADT A01/A03/A04/A08 → Patient, Encounter, Condition, Coverage, RelatedPerson
  - `transformOru()` — ORU R01 → DiagnosticReport + Observations (NM/ST/CE value types, unmatched patient handling)
  - `transformSiu()` — SIU S12-S15 → Appointment with participant references
- **Outbound Transforms** (FHIR R4 → HL7 v2):
  - `buildOrm()` — ServiceRequest → ORM^O01
  - `buildAdtA04()` — Patient → ADT^A04
  - `buildRde()` — MedicationRequest → RDE^O11
- **Common Mappings**: `pidToPatient()`, `mapGender()`, `parseHl7Date()`, HL7 timestamp conversion

### `@health-portal/emr-connectors`

FHIR R4 connectors for external EMR systems.

- **`BaseEmrConnector`**: Abstract base with OAuth token management and `fhirRequest()` helper
- **`EpicConnector`**: JWT assertion auth (RS384 signing via `epic-auth.ts`)
- **`CernerConnector`**: OAuth 2.0 client credentials (via `cerner-auth.ts`)
- **`AthenaConnector`**: OAuth 2.0 client credentials (via `athena-auth.ts`)
- **Vendor Mappings** (per-vendor FHIR normalization):
  - `epic-mappings.ts` — Strips proprietary extensions, handles opaque FHIR ID tokens, maps MRN/FHIR identifier types
  - `cerner-mappings.ts` — Prefers CMRN for cross-facility matching, handles contained `#fragment` resources, numeric IDs
  - `athena-mappings.ts` — Strips athena-specific extensions, handles non-standard identifier search format
  - Each includes `discoverIdentifierSystem()` for auto-detecting vendor OIDs from sample Patient responses

All connectors implement: `authenticate()`, `searchPatient()`, `read()`, `search()`, `write()`, `pullChanges()`, `bulkExport()`

### `@health-portal/phenoml`

PhenoML AI API integration for clinical NLP.

- **`PhenoMlClient`**: HTTP client with Bearer token auth
- **`Lang2FhirService`**: Natural language to FHIR resource conversion (create + search)
- **`ConstructService`**: Medical code extraction (ICD-10, SNOMED, LOINC, RxNorm, CPT)
- **`AgentService`**: Orchestrated AI agent for complex clinical tasks
- **`WorkflowService`**: Declarative workflow definitions for recurring clinical AI tasks (create, execute, list, get)

### `@health-portal/bots`

Medplum bot handlers triggered by FHIR Subscriptions.

| Bot | Trigger | Description |
|-----|---------|-------------|
| `patient-onboarding` | Patient created | PhenoML Agent intake processing, document extraction, problem/medication/allergy creation, low-confidence flagging |
| `lab-result-processor` | Observation (lab) | Construe LOINC code enrichment (auto-apply at >= 0.90 confidence), critical value detection, provider notification |
| `document-processor` | DocumentReference created | Extract text from attachments, Lang2FHIR conversion, coding validation, Provenance linking |
| `epic-sync` | Cron + resource changes | Full import/export cycle: authenticate, pull changes, ID remapping, write, Provenance, audit |
| `cerner-sync` | Cron + resource changes | Same sync pipeline as Epic, using CernerConnector |
| `athena-sync` | Cron + resource changes | Same sync pipeline as Epic, using AthenaConnector |
| `adt-handler` | Encounter created | HL7 origin tag validation, demographics consistency check, EMR sync trigger |
| `oru-handler` | DiagnosticReport created | HL7 origin tag validation, Construe LOINC enrichment, critical value alerts |
| `siu-handler` | Appointment created | HL7 origin tag validation, participant reference validation, EMR sync, notifications |
| `notification-sender` | Communication, Appointment, Cron | Email/SMS delivery for messages, appointment reminders (24-48h), critical lab results |
| `audit-logger` | All writes | Enhanced audit logging, `queryPatientAuditTrail()` for HIPAA accounting of disclosures |
| `consent-enforcer` | Consent changes | Granular per-resource-type opt-in/opt-out, access policy updates, consent change auditing |

**Sync Utilities** (`sync-utils.ts`):
- **ID Remapping Pipeline**: `buildIdMap()`, `persistIdMap()`, `loadIdMap()`, `remapReferences()`, `reverseRemapReferences()`
- **Patient Matching (MPI)**: `deterministicMatch()` (exact name+DOB+gender), `probabilisticMatch()` (weighted scoring, configurable threshold), `findOrCreatePatient()`
- **Sync State**: `getLastSyncTimestamp()`, `setLastSyncTimestamp()`, `buildSyncAuditEvent()`
- **Import Helpers**: `sortByDependencyTier()` (6-tier resource ordering), `preserveVendorIdentifier()`, `createImportProvenance()`
