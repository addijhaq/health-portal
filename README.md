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
└── packages/
    ├── core/                    # Shared types, constants, utilities
    ├── hl7-engine/              # HL7 v2 MLLP server, router, client, transforms
    ├── emr-connectors/          # Epic, Cerner, athena FHIR connectors
    ├── phenoml/                 # PhenoML API client (Lang2FHIR, Construe, Agents)
    └── bots/                    # Medplum bot handlers (clinical, EMR sync, HL7)
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
| `emr-connectors` | `emr-connectors.smoke.test.ts` | 9 | All 3 connectors instantiate as `BaseEmrConnector` subclasses with correct vendor property |
| `phenoml` | `phenoml.smoke.test.ts` | 8 | `PhenoMlClient`, `Lang2FhirService`, `ConstructService`, `AgentService` instantiation |
| `bots` | `bots.smoke.test.ts` | 9 | All 8 exported bot handler functions exist |

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
- **Types**: `EmrVendor`, `EmrConnectionConfig`, `SyncResult`, `Hl7MessageMeta`, `PhenoMlConfig`, `PatientMatchCriteria`
- **Utilities**: `extractMatchCriteria()`, `resourceHash()`, `toHl7Timestamp()`, `fromHl7Timestamp()`

### `@health-portal/hl7-engine`

HL7 v2 interface engine for inbound/outbound messaging via MLLP protocol.

- **`Hl7Server`**: TCP listener for inbound HL7 v2 messages (uses `node-hl7-server`)
- **`Hl7Router`**: Routes messages by type+event (e.g., `ADT^A01`) to registered handlers
- **`Hl7Client`**: TCP client for outbound HL7 v2 messages (uses `node-hl7-client`)
- **`pidToPatient()`**: Maps HL7 PID segment fields to FHIR Patient resource

### `@health-portal/emr-connectors`

FHIR R4 connectors for external EMR systems.

- **`BaseEmrConnector`**: Abstract base with OAuth token management and `fhirRequest()` helper
- **`EpicConnector`**: JWT-based backend services auth (RS384)
- **`CernerConnector`**: OAuth 2.0 client credentials (Ignite FHIR R4)
- **`AthenaConnector`**: OAuth 2.0 client credentials (FHIR R4)

All connectors implement: `authenticate()`, `searchPatient()`, `read()`, `search()`, `write()`, `pullChanges()`, `bulkExport()`

### `@health-portal/phenoml`

PhenoML AI API integration for clinical NLP.

- **`PhenoMlClient`**: HTTP client with Bearer token auth
- **`Lang2FhirService`**: Natural language to FHIR resource conversion
- **`ConstructService`**: Medical code extraction (ICD-10, SNOMED, LOINC, RxNorm, CPT)
- **`AgentService`**: Orchestrated AI agent for complex clinical tasks

### `@health-portal/bots`

Medplum bot handlers triggered by FHIR Subscriptions.

| Bot | Trigger | Description |
|-----|---------|-------------|
| `patient-onboarding` | Patient created | MPI matching, intake processing |
| `lab-result-processor` | Observation (lab) | LOINC validation, critical value alerts |
| `epic-sync` | Cron + resource changes | Bidirectional Epic FHIR sync |
| `cerner-sync` | Cron + resource changes | Bidirectional Cerner FHIR sync |
| `athena-sync` | Cron + resource changes | Bidirectional athena FHIR sync |
| `adt-handler` | Encounter created | ADT post-processing |
| `oru-handler` | DiagnosticReport created | ORU post-processing |
| `siu-handler` | Appointment created | SIU post-processing |
