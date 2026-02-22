# Health Portal Backend

Patient portal backend for a private medical practice, built on [Medplum](https://www.medplum.com/) (FHIR R4 CDR) with [PhenoML](https://developer.pheno.ml/) AI integration, HL7 v2 interface engine, and multi-vendor EMR connectivity (Epic, Cerner, athenahealth).

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Building](#building)
- [Testing](#testing)
- [Mocking and Test Patterns](#mocking-and-test-patterns)
- [Infrastructure Setup](#infrastructure-setup)
- [Bot Deployment](#bot-deployment)
- [Seed Data](#seed-data)
- [Development Guides](#development-guides)
- [Scripts Reference](#scripts-reference)
- [Package Details](#package-details)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The system has four main layers that connect through Medplum's FHIR R4 API:

```
                   ┌────────────────────┐
                   │  Patient Portal    │  (future React frontend)
                   └────────┬───────────┘
                            │ FHIR R4
                            ▼
┌───────────────────────────────────────────────────────┐
│                  MEDPLUM FHIR SERVER                  │
│                                                       │
│  FHIR R4 API  ·  Subscriptions  ·  Access Policies   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │              Medplum Bots (packages/bots)        │  │
│  │  clinical/ · emr-sync/ · hl7-handlers/ · admin/ │  │
│  └─────────────────────────────────────────────────┘  │
└──────┬──────────────────┬──────────────────┬──────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌───────────────┐  ┌──────────────────┐
│  PhenoML AI  │  │ EMR Connectors│  │  HL7 v2 Engine   │
│ (phenoml/)   │  │(emr-connectors│  │  (hl7-engine/)   │
│              │  │               │  │                  │
│ Lang2FHIR    │  │ Epic          │  │ MLLP Server/     │
│ Construe     │  │ Cerner        │  │ Client           │
│ Agents       │  │ athenahealth  │  │ ADT/ORU/SIU/ORM  │
│ Workflows    │  │               │  │ transforms       │
└──────────────┘  └───────────────┘  └──────────────────┘
```

**Data flow examples:**

1. **Inbound HL7 message** (e.g., a lab result from a hospital LIS):
   `HL7 TCP → hl7-engine parses + transforms → FHIR Bundle → Medplum API → oru-handler bot triggers → Construe enriches LOINC codes → notification-sender alerts provider`

2. **EMR sync** (e.g., pulling patient data from Epic):
   `Cron fires epic-sync bot → EpicConnector authenticates with JWT → pulls changes via FHIR API → ID remapping pipeline rewrites vendor refs → writes to Medplum → Provenance resource created`

3. **Clinical document processing** (e.g., a scanned referral arrives):
   `DocumentReference created in Medplum → document-processor bot triggers → extracts text → PhenoML Lang2FHIR converts to FHIR resources → Conditions/MedicationRequests created → Provenance links back to source`

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 9 (ships with Node 20+)
- **Docker** and **Docker Compose** (for Medplum server, PostgreSQL, Redis)

Verify your setup:

```bash
node --version   # Should print v20.x.x or higher
npm --version    # Should print 9.x.x or higher
docker --version # Should print Docker version 24.x.x or higher
```

---

## Project Structure

```
health-portal/
├── package.json                 # Root monorepo config (npm workspaces)
├── tsconfig.json                # Solution-style TS config with project references
├── jest.config.ts               # Multi-project Jest config (5 projects)
├── .env.example                 # Environment variable template (never commit .env)
├── docker-compose.yml           # Medplum + PostgreSQL + Redis
├── medplum.config.json          # Bot definitions (12 bots, name → ID mapping)
│
├── config/
│   └── fhir/
│       ├── access-policies.json # 4 role-based access policies (Patient, Provider, Admin, Bot)
│       └── subscriptions.json   # 13 FHIR subscription triggers for bot execution
│
├── scripts/
│   ├── deploy-bots.ts           # Register and deploy bots to Medplum
│   ├── setup-subscriptions.ts   # Create AccessPolicy + Subscription resources in Medplum
│   └── seed-data.ts             # Create 49 synthetic FHIR resources with real medical codes
│
├── tests/
│   └── fixtures/                # 7 sample HL7 v2 messages for testing transforms
│       ├── adt-a01-admit.hl7
│       ├── adt-a03-discharge.hl7
│       ├── adt-a04-register.hl7
│       ├── oru-r01-cbc.hl7      # Complete blood count
│       ├── oru-r01-bmp.hl7      # Basic metabolic panel
│       ├── siu-s12-new-appointment.hl7
│       └── siu-s15-cancel-appointment.hl7
│
└── packages/
    ├── core/                    # Shared types, constants, utilities
    ├── hl7-engine/              # HL7 v2 MLLP server, router, client, transforms
    ├── emr-connectors/          # Epic, Cerner, athena FHIR R4 connectors + auth + mappings
    ├── phenoml/                 # PhenoML API client (Lang2FHIR, Construe, Agents, Workflows)
    └── bots/                    # Medplum bot handlers (clinical, EMR sync, HL7, admin)
```

Each package has its own `package.json`, `tsconfig.json`, `jest.config.ts`, and `src/__tests__/` directory.

---

## Quick Start

### Without infrastructure (build + test only)

If you just want to build and run tests without a running Medplum server:

```bash
# 1. Clone and install
git clone <repo-url> && cd health-portal
npm install

# 2. Build all packages
npm run build

# 3. Run the full test suite (141 tests, no external services required)
npm test
```

All tests use mocked dependencies and run entirely in-process. No Docker, no Medplum, no external APIs needed.

### With infrastructure (full local development)

```bash
# 1. Install dependencies
npm install

# 2. Start Medplum + PostgreSQL + Redis
docker compose up -d

# 3. Wait for services to be healthy (all three should show "healthy")
docker compose ps

# 4. Create a Medplum project:
#    - Open http://localhost:8103 in your browser
#    - Create a project and admin user
#    - Go to Admin > ClientApplication, create one, note the Client ID and Secret

# 5. Configure environment
cp .env.example .env
# Edit .env and set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET

# 6. Deploy bots to Medplum (registers Bot resources and uploads compiled code)
npm run build
npm run deploy:bots

# 7. Create access policies and subscription triggers
npx ts-node scripts/setup-subscriptions.ts

# 8. Seed test data (49 FHIR resources with real medical codes)
npm run seed

# 9. Verify everything works
curl http://localhost:8103/fhir/R4/Patient | jq '.total'
# Should return 10
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. The application reads these at runtime.

```bash
cp .env.example .env
```

### Required (for local development with Medplum)

These are needed for any operation that talks to the Medplum server (bot deployment, seeding, scripts):

| Variable | Description | Default |
|----------|-------------|---------|
| `MEDPLUM_BASE_URL` | Medplum FHIR server URL | `http://localhost:8103` |
| `MEDPLUM_CLIENT_ID` | ClientApplication ID created in Medplum admin console | _(none — must create)_ |
| `MEDPLUM_CLIENT_SECRET` | ClientApplication secret from Medplum admin console | _(none — must create)_ |

### EMR connector variables

These are only needed when running EMR sync bots against live vendor sandboxes. Tests mock these entirely — you do not need vendor credentials to build or test.

| Variable | When Needed | Description |
|----------|-------------|-------------|
| `EPIC_FHIR_BASE_URL` | Epic sync | Epic FHIR R4 endpoint (sandbox: `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`) |
| `EPIC_CLIENT_ID` | Epic sync | App Orchard / Showroom client ID |
| `EPIC_PRIVATE_KEY_PATH` | Epic sync | Path to RS384 private key `.pem` file for JWT signing |
| `EPIC_FHIR_ID_SYSTEM` | Epic sync | Epic's FHIR identifier system OID (varies per organization; fallback: `urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.0`) |
| `CERNER_FHIR_BASE_URL` | Cerner sync | Cerner/Oracle Health FHIR R4 endpoint |
| `CERNER_CLIENT_ID` | Cerner sync | Cerner app client ID |
| `CERNER_CLIENT_SECRET` | Cerner sync | Cerner app client secret |
| `CERNER_FHIR_ID_SYSTEM` | Cerner sync | Cerner identifier system OID (varies per site; fallback: `urn:oid:2.16.840.1.113883.6.1000`) |
| `ATHENA_FHIR_BASE_URL` | athena sync | athenahealth FHIR R4 endpoint |
| `ATHENA_CLIENT_ID` | athena sync | athenahealth app client ID |
| `ATHENA_CLIENT_SECRET` | athena sync | athenahealth app client secret |
| `ATHENA_FHIR_ID_SYSTEM` | athena sync | athenahealth identifier system OID (varies per practice; fallback: `urn:oid:2.16.840.1.113883.3.666.5.2`) |

### AI and HL7 variables

| Variable | When Needed | Description |
|----------|-------------|-------------|
| `PHENOML_API_KEY` | PhenoML AI features | API key from [developer.pheno.ml](https://developer.pheno.ml) |
| `PHENOML_BASE_URL` | PhenoML AI features | API base URL (default: `https://api.pheno.ml`) |
| `HL7_LISTEN_PORT` | HL7 v2 engine | MLLP listener port (default: `2575`) |
| `HL7_TLS_CERT_PATH` | HL7 v2 with TLS | Path to TLS certificate `.pem` file |
| `HL7_TLS_KEY_PATH` | HL7 v2 with TLS | Path to TLS private key `.pem` file |

---

## Building

The project uses TypeScript project references for incremental builds across all 5 packages.

```bash
# Build all packages (compiles to packages/*/dist/)
npm run build

# Clean all build artifacts
npm run clean

# Rebuild from scratch
npm run clean && npm run build

# Build a single package (useful during development)
npx tsc -b packages/hl7-engine
```

Build order is determined automatically by `tsconfig.json` project references. You do not need to build packages individually — `npm run build` handles the dependency graph:

```
core  (no dependencies — builds first)
  ├── phenoml         (depends on core)
  ├── hl7-engine      (depends on core)
  ├── emr-connectors  (depends on core)
  └── bots            (depends on core, phenoml, emr-connectors — builds last)
```

---

## Testing

Tests use [Jest](https://jestjs.io/) with [ts-jest](https://kulshekhar.github.io/ts-jest/) for direct TypeScript execution. Tests run against source `.ts` files, so **you do not need to build before testing**.

### Running tests

```bash
# Run all 141 tests across all 5 packages
npm test

# Run tests for a specific package
npx jest --selectProjects core
npx jest --selectProjects hl7-engine
npx jest --selectProjects emr-connectors
npx jest --selectProjects phenoml
npx jest --selectProjects bots

# Run a single test file
npx jest packages/hl7-engine/src/__tests__/adt-transform.test.ts

# Run tests matching a pattern
npx jest --testPathPattern="sync-utils"

# Run tests in watch mode (re-runs on file changes)
npx jest --watch

# Run with coverage report
npx jest --coverage
```

### Test suites (15 suites, 141 tests)

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

### Where to put new tests

Test files go in `packages/<pkg>/src/__tests__/` and must match the pattern `**/*.test.ts`.

Each package has its own `jest.config.ts` with:
- `ts-jest` preset for TypeScript support
- `node` test environment
- `moduleNameMapper` for workspace dependency resolution (e.g., `@health-portal/core` maps to source, not `dist/`)

---

## Mocking and Test Patterns

All tests run without external services. Here are the patterns used throughout the codebase.

### Loading HL7 fixture files

Transform tests load real HL7 v2 messages from `tests/fixtures/`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');

function loadFixture(filename: string): string {
  // HL7 messages use \r as segment delimiter
  return fs.readFileSync(path.join(FIXTURES, filename), 'utf-8').replace(/\n/g, '\r');
}

// Usage in a test:
const raw = loadFixture('adt-a01-admit.hl7');
const bundle = await transformAdt(raw, meta);
expect(bundle.type).toBe('transaction');
```

### Creating HL7 message metadata

Tests construct `Hl7MessageMeta` objects to simulate parsed MSH headers:

```typescript
import type { Hl7MessageMeta } from '@health-portal/core';

function makeMeta(overrides: Partial<Hl7MessageMeta> = {}): Hl7MessageMeta {
  return {
    messageType: 'ADT',
    triggerEvent: 'A01',
    messageControlId: 'MSG00001',
    sendingFacility: 'HOSP_FAC',
    receivingFacility: 'PORTAL_FAC',
    timestamp: '20240115103000',
    ...overrides,
  };
}
```

### Mocking MedplumClient for bot tests

Bot handlers receive a `MedplumClient` instance. Create a mock with jest:

```typescript
import { MedplumClient } from '@medplum/core';

function createMockMedplum(): jest.Mocked<MedplumClient> {
  return {
    createResource: jest.fn().mockResolvedValue({ id: 'new-id', resourceType: 'Patient' }),
    updateResource: jest.fn().mockResolvedValue({}),
    readResource: jest.fn().mockResolvedValue({ resourceType: 'Patient', id: 'p1' }),
    searchResources: jest.fn().mockResolvedValue([]),
    search: jest.fn().mockResolvedValue({ entry: [] }),
    executeBatch: jest.fn().mockResolvedValue({ entry: [] }),
  } as unknown as jest.Mocked<MedplumClient>;
}

// Usage in a test:
const medplum = createMockMedplum();
medplum.searchResources.mockResolvedValue([mockPatient]);
await patientOnboardingHandler(medplum, mockEvent);
expect(medplum.createResource).toHaveBeenCalledWith(expect.objectContaining({
  resourceType: 'Task',
}));
```

### Mocking BotEvent for bot tests

```typescript
import type { BotEvent } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

function createMockBotEvent<T>(resource: T): BotEvent<T> {
  return {
    input: resource,
    contentType: 'application/fhir+json',
    secrets: {},
  } as BotEvent<T>;
}

// Usage:
const patient: Patient = {
  resourceType: 'Patient',
  id: 'test-patient-1',
  name: [{ family: 'Smith', given: ['John'] }],
  birthDate: '1990-01-15',
  gender: 'male',
};
const event = createMockBotEvent(patient);
await patientOnboardingHandler(mockMedplum, event);
```

### Testing EMR vendor mappings

Vendor mapping tests create FHIR resources with vendor-specific extensions and verify normalization:

```typescript
import { normalizeEpicResource } from '../epic/epic-mappings';

it('strips proprietary Epic extensions', () => {
  const resource = {
    resourceType: 'Observation',
    status: 'final',
    code: { text: 'test' },
    extension: [
      { url: 'http://epic.com/fhir/extension/custom', valueString: 'proprietary' },
      { url: 'http://hl7.org/fhir/StructureDefinition/standard', valueString: 'keep' },
    ],
  };

  const normalized = normalizeEpicResource(resource);
  // Only standard extensions remain
  expect(normalized.extension).toHaveLength(1);
  expect(normalized.extension[0].url).toContain('hl7.org');
});
```

### Testing the ID remapping pipeline

```typescript
import { buildIdMap, remapReferences } from '../emr-sync/sync-utils';

it('rewrites vendor references to Medplum IDs', () => {
  // 1. Build the mapping table
  const idMap = buildIdMap('epic', [
    { vendorId: 'P123', medplumId: 'med-patient-001', resourceType: 'Patient' },
    { vendorId: 'E456', medplumId: 'med-encounter-001', resourceType: 'Encounter' },
  ]);

  // 2. Remap an Observation that references vendor IDs
  const observation = {
    resourceType: 'Observation',
    status: 'final',
    code: { text: 'test' },
    subject: { reference: 'Patient/P123' },        // vendor ID
    encounter: { reference: 'Encounter/E456' },     // vendor ID
  };

  const { resource, unresolvedRefs } = remapReferences(observation, idMap, 'epic');

  // 3. References now point to Medplum IDs
  expect(resource.subject.reference).toBe('Patient/med-patient-001');
  expect(resource.encounter.reference).toBe('Encounter/med-encounter-001');
  expect(unresolvedRefs).toHaveLength(0);
});
```

### Testing patient matching (MPI)

```typescript
import { deterministicMatch, probabilisticMatch } from '../emr-sync/sync-utils';

const existingPatients = [
  {
    resourceType: 'Patient', id: 'p1',
    name: [{ family: 'Smith', given: ['John'] }],
    birthDate: '1990-01-15', gender: 'male',
  },
];

// Deterministic: exact match on lastName + DOB + gender
const match = deterministicMatch(incomingPatient, existingPatients);
expect(match?.id).toBe('p1');

// Probabilistic: weighted scoring with configurable threshold
const results = probabilisticMatch(incomingPatient, existingPatients, 0.85);
expect(results[0].score).toBeGreaterThanOrEqual(0.85);
```

---

## Infrastructure Setup

### 1. Start Docker services

```bash
docker compose up -d
```

This launches three containers:
- **Medplum Server** (v3.2) on port `8103` — FHIR R4 CDR with built-in OAuth, RBAC, and subscriptions
- **PostgreSQL** (16-alpine) on port `5432` — Medplum's data store
- **Redis** (7-alpine) on port `6379` — Medplum's cache and job queue

Wait for health checks to pass:

```bash
docker compose ps
```

All three services should show `healthy` status. First startup may take 30-60 seconds while PostgreSQL initializes.

Verify the FHIR API is reachable:

```bash
curl http://localhost:8103/fhir/R4/metadata | jq '.resourceType'
# Should return "CapabilityStatement"
```

### 2. Create Medplum project and credentials

1. Open `http://localhost:8103` in your browser
2. Create a new project and admin user (first-time setup wizard)
3. Navigate to **Admin > ClientApplication**
4. Click **Create New** — note the **Client ID** and **Client Secret**

These credentials are used by scripts and bots to authenticate with the Medplum API.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:
```
MEDPLUM_CLIENT_ID=<your-client-id>
MEDPLUM_CLIENT_SECRET=<your-client-secret>
```

### 4. Stop infrastructure

```bash
# Stop all services (data is preserved in Docker volumes)
docker compose down

# Stop and remove all data volumes (full reset — deletes all FHIR data)
docker compose down -v
```

---

## Bot Deployment

Medplum Bots are server-side TypeScript functions that execute in response to FHIR Subscription triggers. This project defines 12 bots in `medplum.config.json`.

### Deploy bots

```bash
# Build first (bots are deployed from compiled JS)
npm run build

# Deploy to Medplum
npm run deploy:bots
```

The deploy script (`scripts/deploy-bots.ts`):
1. Authenticates with Medplum using `.env` credentials
2. For each bot in `medplum.config.json`, searches by name — creates the Bot resource if it does not exist
3. Writes the Medplum-assigned Bot IDs back to `medplum.config.json`
4. Uploads the compiled bot code to Medplum

### Create subscriptions and access policies

After deploying bots, create the FHIR Subscription triggers and AccessPolicy resources:

```bash
npx ts-node scripts/setup-subscriptions.ts
```

This creates:
- **4 Access Policies**: Patient Portal, Provider, Admin, Bot-EMR-Sync
- **25 Subscriptions**: Each subscription links a FHIR resource criteria (e.g., `Patient`, `Observation?category=laboratory`) to a Bot endpoint. Multi-criteria entries in `subscriptions.json` (e.g., `Patient,Encounter,Observation`) are split into individual subscriptions as required by Medplum.

### Verify a bot fires

After deployment, test that a bot triggers correctly:

```bash
# Create a Patient — should trigger the patient-onboarding bot
curl -X POST http://localhost:8103/fhir/R4/Patient \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"resourceType": "Patient", "name": [{"family": "Test", "given": ["Bot"]}]}'

# Check Medplum admin console for bot execution logs
```

---

## Seed Data

Populate the FHIR server with synthetic test data for development:

```bash
npm run seed
```

This creates **49 FHIR R4 resources** with real, verifiable medical codes:

| Resource | Count | Details |
|----------|-------|---------|
| Organization | 1 | NPI-identified practice |
| Practitioner | 3 | NPI identifiers, qualification codes |
| Patient | 10 | Varied demographics (for MPI matching tests), MRN identifiers |
| Observation | 20 | 10 vitals + 10 labs, all LOINC-coded (e.g., `4548-4` = HbA1c, `2093-3` = total cholesterol) |
| Condition | 5 | Dual-coded with ICD-10-CM + SNOMED CT (e.g., `E11.9` = Type 2 DM) |
| MedicationRequest | 5 | RxNorm-coded (e.g., `860975` = Metformin 500mg) |
| Appointment | 5 | Future-dated, 30-minute, status=booked |
| DocumentReference | 3 | LOINC-typed with base64-encoded sample content |

Verify the data loaded:

```bash
# Count patients
curl http://localhost:8103/fhir/R4/Patient?_summary=count | jq '.total'

# Search for a specific condition by ICD-10 code
curl "http://localhost:8103/fhir/R4/Condition?code=E11.9" | jq '.entry[].resource.code.coding'
```

---

## Development Guides

### Writing a new Medplum Bot

1. **Create the handler file** in the appropriate subdirectory of `packages/bots/src/`:

```typescript
// packages/bots/src/clinical/my-new-bot.ts
import type { MedplumClient, BotEvent } from '@medplum/core';
import type { Observation } from '@medplum/fhirtypes';

export async function myNewBotHandler(
  medplum: MedplumClient,
  event: BotEvent<Observation>
): Promise<void> {
  const observation = event.input;

  // Your logic here — use medplum client to read/write FHIR resources
  const patient = await medplum.readReference(observation.subject!);

  await medplum.createResource({
    resourceType: 'Communication',
    subject: { reference: `Patient/${patient.id}` },
    payload: [{ contentString: `New observation: ${observation.code?.text}` }],
  });
}
```

2. **Export it** from `packages/bots/src/index.ts`:

```typescript
export { myNewBotHandler } from './clinical/my-new-bot';
```

3. **Add bot entry** in `medplum.config.json`:

```json
{
  "name": "my-new-bot",
  "id": "",
  "source": "packages/bots/src/clinical/my-new-bot.ts",
  "dist": "packages/bots/dist/clinical/my-new-bot.js"
}
```

4. **Add subscription** in `config/fhir/subscriptions.json`:

```json
{
  "name": "my-new-bot-trigger",
  "bot": "my-new-bot",
  "criteria": "Observation?category=vital-signs"
}
```

5. **Deploy**: `npm run build && npm run deploy:bots && npx ts-node scripts/setup-subscriptions.ts`

### Starting the HL7 v2 engine

The HL7 engine is a standalone TCP service (not a Medplum Bot). It listens for inbound HL7 v2 messages over MLLP, transforms them to FHIR, and writes to Medplum.

```typescript
import { Hl7Router, Hl7Server, transformAdt, transformOru, transformSiu } from '@health-portal/hl7-engine';

// 1. Create a router and register transform handlers
const router = new Hl7Router();
router.on('ADT', 'A01', transformAdt);  // Admit
router.on('ADT', 'A03', transformAdt);  // Discharge
router.on('ADT', 'A04', transformAdt);  // Register
router.on('ORU', 'R01', transformOru);  // Lab results
router.on('SIU', 'S12', transformSiu);  // New appointment
router.on('SIU', 'S15', transformSiu);  // Cancel appointment

// 2. Start the MLLP server
const server = new Hl7Server(router, {
  port: 2575,            // default
  tls: {                 // optional — omit for plaintext
    certPath: './config/tls/cert.pem',
    keyPath: './config/tls/key.pem',
  },
});

await server.start();
// "HL7 v2 server listening on port 2575"

// 3. To stop:
await server.stop();
```

Each registered handler receives the raw HL7 message string and parsed metadata, and returns a FHIR `Bundle` of type `transaction`. The server automatically sends ACK (AA) on success or NAK (AE/AR) on failure.

### Sending outbound HL7 v2 messages

```typescript
import { Hl7Client, buildOrm, buildAdtA04, buildRde } from '@health-portal/hl7-engine';

const client = new Hl7Client({
  host: 'lab-system.hospital.local',
  port: 2575,
  retryAttempts: 3,      // default
  retryDelayMs: 1000,    // default, uses exponential backoff
});

// Build an ORM order from a FHIR ServiceRequest
const ormMessage = buildOrm(serviceRequest);
const ack = await client.send(ormMessage);
```

### Using EMR connectors

```typescript
import { EpicConnector, CernerConnector, AthenaConnector } from '@health-portal/emr-connectors';

const epic = new EpicConnector({
  vendor: 'epic',
  fhirBaseUrl: process.env.EPIC_FHIR_BASE_URL!,
  clientId: process.env.EPIC_CLIENT_ID!,
  tokenUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token',
  privateKeyPath: process.env.EPIC_PRIVATE_KEY_PATH,
});

// Authenticate (JWT assertion with RS384 signing)
await epic.authenticate();

// Search for a patient
const results = await epic.searchPatient({ family: 'Smith', birthdate: '1990-01-15' });

// Pull all changes since last sync
const changes = await epic.pullChanges('2024-01-01T00:00:00Z', [
  'Patient', 'Encounter', 'Observation', 'Condition',
]);

// Write a resource back
await epic.write(updatedPatient);
```

### Using PhenoML for clinical AI

```typescript
import { PhenoMlClient, Lang2FhirService, ConstructService, AgentService } from '@health-portal/phenoml';

const client = new PhenoMlClient({
  apiKey: process.env.PHENOML_API_KEY!,
  baseUrl: process.env.PHENOML_BASE_URL || 'https://api.pheno.ml',
});

// Convert clinical text to FHIR resources
const lang2fhir = new Lang2FhirService(client);
const bundle = await lang2fhir.create({
  text: 'Patient has type 2 diabetes, on metformin 500mg BID',
  patientId: 'patient-123',
  fhirServer: 'medplum',
});
// Returns Bundle with Condition (E11.9) + MedicationRequest (RxNorm 860975)

// Extract medical codes from text
const construe = new ConstructService(client);
const results = await construe.extract({
  text: 'Type 2 diabetes mellitus with diabetic nephropathy',
  vocabularies: ['ICD-10-CM', 'SNOMED'],
});
// Returns: [{ code: 'E11.21', display: '...', system: 'http://hl7.org/fhir/sid/icd-10-cm', confidence: 0.95 }]

// Run a complex clinical AI agent
const agents = new AgentService(client);
const result = await agents.run({
  task: 'Review this patient\'s medications and flag any interactions',
  patientId: 'patient-123',
  fhirServer: 'medplum',
});
```

### Using the sync utilities

```typescript
import {
  buildIdMap, remapReferences, reverseRemapReferences,
  preserveVendorIdentifier, sortByDependencyTier,
  deterministicMatch, probabilisticMatch, findOrCreatePatient,
  getLastSyncTimestamp, setLastSyncTimestamp,
  createImportProvenance, buildSyncAuditEvent,
} from '@health-portal/bots/emr-sync/sync-utils';

// Full import flow:
// 1. Sort imported resources by dependency tier
const sorted = sortByDependencyTier(bundle.entry);

// 2. Build ID mapping table from imported resources
const idMap = buildIdMap('epic', importedMappings);

// 3. For each Patient, match against existing Medplum patients
const localPatient = await findOrCreatePatient(medplum, vendorPatient, 'epic');

// 4. Rewrite all vendor references to Medplum IDs
const { resource, unresolvedRefs } = remapReferences(observation, idMap, 'epic');

// 5. Preserve vendor identifier on imported patients
const enriched = preserveVendorIdentifier(patient, 'epic', 'TnOZ.abc', epicOid);

// 6. Create provenance to track data origin
await createImportProvenance(medplum, importedResource, 'epic', 'Patient/TnOZ.abc');

// For export (reverse direction):
const { resource: exportReady } = reverseRemapReferences(localResource, idMap, 'epic');
```

---

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Compile all 5 packages via TypeScript project references |
| `test` | `npm test` | Run all 141 Jest tests across 15 test suites |
| `lint` | `npm run lint` | ESLint across all source files |
| `clean` | `npm run clean` | Remove all `dist/` directories |
| `deploy:bots` | `npm run deploy:bots` | Register and deploy 12 Medplum bots |
| `seed` | `npm run seed` | Create 49 synthetic FHIR resources |
| `setup-subscriptions` | `npx ts-node scripts/setup-subscriptions.ts` | Create 4 AccessPolicies + 25 Subscriptions |

---

## Package Details

### `@health-portal/core`

Shared foundation used by all other packages. No external runtime dependencies beyond Medplum types.

- **Constants**:
  - `IDENTIFIER_SYSTEMS` — FHIR identifier system URIs (MRN, NPI, SSN, Epic/Cerner/Athena OIDs). Epic, Cerner, and Athena OIDs read from `process.env` with hardcoded fallback defaults.
  - `CODE_SYSTEMS` — Medical code system URIs (ICD-10-CM, SNOMED CT, LOINC, RxNorm, CPT, CVX)
  - `HL7_DEFAULTS` — Default HL7 v2 config (port 2575, UTF-8, v2.5.1)
  - `HL7_MESSAGE_TYPES` — 10 supported HL7 v2 message types with their FHIR resource mappings
  - `PHENOML_VOCABULARIES` — 7 supported code vocabularies for Construe
- **Types**: `EmrVendor`, `EmrConnectionConfig`, `SyncResult`, `Hl7MessageMeta`, `PhenoMlConfig`, `PatientMatchCriteria`, `IdMappingEntry`
- **Utilities**:
  - `extractMatchCriteria(patient)` — Pull name, DOB, gender from a FHIR Patient for MPI matching
  - `resourceHash(type, system, value)` — Deterministic hash for deduplication by business identifier
  - `toHl7Timestamp(date)` / `fromHl7Timestamp(string)` — Convert between JS Date and HL7 `YYYYMMDDHHmmss` format

### `@health-portal/hl7-engine`

HL7 v2 interface engine for bidirectional messaging via MLLP protocol.

- **`Hl7Server`**: MLLP listener using `node-hl7-server`. Parses inbound messages, extracts MSH metadata, routes through `Hl7Router`, returns ACK/NAK. Supports optional TLS.
- **`Hl7Router`**: Maps message type + trigger event pairs (e.g., `ADT^A01`) to handler functions. Handlers receive the raw HL7 string and parsed `Hl7MessageMeta`, and return a FHIR `Bundle`.
- **`Hl7Client`**: MLLP client using `node-hl7-client`. Sends outbound messages with configurable retry (default: 3 attempts, exponential backoff). Parses ACK/NAK from MSA segment.
- **Inbound Transforms** (HL7 v2 → FHIR R4 transaction Bundle):
  - `transformAdt()` — ADT A01/A03/A04/A08 → Patient, Encounter, Condition, Coverage, RelatedPerson
  - `transformOru()` — ORU R01 → DiagnosticReport + Observations. Parses OBX value types: NM=valueQuantity, ST=valueString, CE=valueCodeableConcept. If no matching Patient found by MRN, stores raw message as DocumentReference with `unmatched-oru` category.
  - `transformSiu()` — SIU S12-S15 → Appointment with participant references. S12/S13/S14=booked, S15=cancelled.
- **Outbound Transforms** (FHIR R4 → HL7 v2 messages):
  - `buildOrm(serviceRequest)` — ServiceRequest → ORM^O01 with ORC + OBR segments
  - `buildAdtA04(patient)` — Patient → ADT^A04 with EVN + PID + PV1 segments
  - `buildRde(medicationRequest)` — MedicationRequest → RDE^O11 with ORC + RXE + RXR segments
- **Common Mappings**: `pidToPatient()`, `mapGender()` (M/F/O/U → male/female/other/unknown), `parseHl7Date()`, HL7 timestamp conversion

All inbound-transformed resources are tagged with `meta.tag = { system: "http://health-portal/origin", code: "hl7-v2" }` so downstream bots can distinguish HL7-originated data.

### `@health-portal/emr-connectors`

FHIR R4 connectors for bidirectional data exchange with external EMR systems.

- **`BaseEmrConnector`**: Abstract base class providing OAuth token lifecycle management (stores token, checks expiry, auto-refreshes) and an authenticated `fhirRequest()` helper that all vendor connectors inherit.
- **`EpicConnector`**: JWT assertion auth — builds a JWT with RS384 signing using the configured private key, exchanges it for an access token at Epic's token endpoint.
- **`CernerConnector`**: Standard OAuth 2.0 client credentials flow against Cerner/Oracle Health's token endpoint.
- **`AthenaConnector`**: Same OAuth 2.0 client credentials pattern as Cerner.
- **Vendor Mappings** (per-vendor FHIR normalization):
  - `epic-mappings.ts` — Strips proprietary `epic.com` extensions, handles Epic's opaque FHIR ID tokens (non-numeric strings), maps `type.text="MRN"` for cross-system matching and `type.text="FHIR"` for the ID mapping table.
  - `cerner-mappings.ts` — Prefers CMRN (Community MRN) identifier for cross-facility matching when available, skips remapping for contained `#fragment` resources, handles numeric IDs.
  - `athena-mappings.ts` — Strips athena-specific extensions (e.g., `athena-subscription-extension-owner`, `athena-coverage-extension-coverage-type`), handles non-standard identifier search format.
  - Each mapping module includes `discoverIdentifierSystem(samplePatient)` — reads a Patient response from the vendor and extracts the identifier system OID, so you can configure the correct OID for your organization.

All connectors implement: `authenticate()`, `searchPatient()`, `read()`, `search()`, `write()`, `pullChanges()`, `bulkExport()`

### `@health-portal/phenoml`

PhenoML AI API integration for clinical NLP tasks.

- **`PhenoMlClient`**: HTTP client that handles Bearer token authentication and request/response serialization for the PhenoML REST API.
- **`Lang2FhirService`**: Converts natural language clinical text into structured FHIR resources (`create()`) or FHIR search parameters (`search()`).
- **`ConstructService`**: Extracts standardized medical codes (ICD-10-CM, SNOMED CT, LOINC, RxNorm, CPT, HPO) from unstructured clinical text. Returns codes with confidence scores. Uses RAG-based lookup to prevent hallucinated codes.
- **`AgentService`**: Orchestrates multi-step clinical AI tasks by combining Lang2FHIR + Construe capabilities (e.g., intake processing, referral extraction, medication interaction checking).
- **`WorkflowService`**: Manages declarative workflow definitions for recurring clinical AI tasks. Supports create, execute, list, and get operations.

### `@health-portal/bots`

Medplum bot handlers triggered by FHIR Subscriptions. Each handler has the signature `(medplum: MedplumClient, event: BotEvent<T>) => Promise<void>`.

| Bot | Trigger | What It Does |
|-----|---------|--------------|
| `patient-onboarding` | Patient created | Searches for attached DocumentReferences, runs PhenoML Agent to extract problem list/medications/allergies, creates FHIR resources, flags low-confidence items via Task resources for provider review |
| `lab-result-processor` | Observation (lab) | Calls Construe to validate/enrich LOINC codes (auto-applies if confidence >= 0.90, otherwise creates review Task), checks for critical values, creates urgent Communication to notify provider |
| `document-processor` | DocumentReference created | Extracts text from base64 attachments, sends to Lang2FHIR for FHIR resource generation, validates coding (ICD-10, SNOMED, RxNorm), creates Provenance linking generated resources to source document |
| `epic-sync` | Cron (15 min) + resource changes | Full bidirectional sync cycle: authenticates with Epic JWT, pulls changes via FHIR API, runs ID remapping pipeline, writes to Medplum, creates Provenance, updates sync timestamp, logs AuditEvent |
| `cerner-sync` | Cron (15 min) + resource changes | Same sync pipeline as Epic, using CernerConnector with OAuth 2.0 auth |
| `athena-sync` | Cron (15 min) + resource changes | Same sync pipeline as Epic, using AthenaConnector with OAuth 2.0 auth |
| `adt-handler` | Encounter created | Post-processes HL7-originated Encounters: checks for `hl7-v2` origin tag, validates Patient demographics consistency, triggers EMR sync if patient is linked to an external system |
| `oru-handler` | DiagnosticReport created | Post-processes HL7-originated results: checks for `hl7-v2` origin tag, runs Construe for LOINC enrichment on Observations, checks critical values, alerts provider |
| `siu-handler` | Appointment created | Post-processes HL7-originated appointments: checks for `hl7-v2` origin tag, validates participant references, syncs to external EMRs if patient is linked, sends confirmation/cancellation notifications |
| `notification-sender` | Communication, Appointment, Cron | Dispatches notifications: email/SMS on new Communication, daily appointment reminders (24-48h lookahead), critical lab result alerts. Uses stub delivery service (plug in AWS SES/SNS/Twilio). |
| `audit-logger` | All writes | Enhanced audit logging beyond Medplum's default AuditEvent. Includes `queryPatientAuditTrail(medplum, patientId, days)` helper for HIPAA "accounting of disclosures" queries. |
| `consent-enforcer` | Consent changes | When a patient updates their Consent resource, modifies Medplum access policies accordingly. Supports granular per-resource-type opt-in/opt-out (e.g., share labs but not mental health records). Audits all consent changes. |

**Sync Utilities** (`sync-utils.ts`) — shared logic used by all EMR sync bots:
- **ID Remapping Pipeline**: `buildIdMap()`, `persistIdMap()`, `loadIdMap()` — manages the `(vendor, resourceType, vendorId) → medplumId` mapping table stored as a FHIR Parameters resource. `remapReferences()` rewrites all vendor refs to Medplum IDs during import. `reverseRemapReferences()` does the inverse for export.
- **Patient Matching (MPI)**: `deterministicMatch()` performs exact match on lastName + DOB + gender. `probabilisticMatch()` uses weighted scoring (firstName Levenshtein distance, address similarity, phone number) with configurable threshold (default 0.85). `findOrCreatePatient()` orchestrates both, linking matched patients via `Patient.link` (type=seealso) and creating Task resources for ambiguous matches (score 0.70-0.85).
- **Sync State**: `getLastSyncTimestamp()` / `setLastSyncTimestamp()` — read/write sync timestamps from Medplum Parameters resources. `buildSyncAuditEvent()` — creates AuditEvent with sync stats.
- **Import Helpers**: `sortByDependencyTier()` sorts resources in 6-tier dependency order (Organization/Practitioner → Patient → Encounter → Conditions/Allergies → Observations/Reports → MedicationRequests/Coverage). `preserveVendorIdentifier()` injects the vendor's identifier into the imported Patient. `createImportProvenance()` creates Provenance resources linking imports to their vendor origin.

---

## Troubleshooting

### `npm run build` fails with project reference errors

```bash
# Clean build artifacts and rebuild
npm run clean && npm run build
```

If a specific package fails, build it individually to see the full error:

```bash
npx tsc -b packages/hl7-engine --verbose
```

### Tests fail with "Cannot find module '@health-portal/core'"

Each package's `jest.config.ts` includes a `moduleNameMapper` that maps workspace packages to their source directories. If you add a new package, add a corresponding entry:

```typescript
moduleNameMapper: {
  '^@health-portal/core$': '<rootDir>/../core/src',
  '^@health-portal/your-new-package$': '<rootDir>/../your-new-package/src',
},
```

### Docker services won't start

```bash
# Check if ports are already in use
lsof -i :8103  # Medplum
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# View container logs
docker compose logs medplum
docker compose logs postgres

# Full reset (removes all data)
docker compose down -v && docker compose up -d
```

### Bot deployment fails with authentication errors

Verify your `.env` has valid Medplum credentials:

```bash
# Test authentication directly
curl -X POST http://localhost:8103/auth/login \
  -H "Content-Type: application/json" \
  -d '{"clientId": "<your-client-id>", "clientSecret": "<your-client-secret>"}'
```

If the ClientApplication was deleted, create a new one in the Medplum admin console and update `.env`.

### HL7 v2 server "address already in use" error

The default port is 2575. If it is in use:

```bash
# Find what is using port 2575
lsof -i :2575

# Use a different port
HL7_LISTEN_PORT=2576 npx ts-node your-script.ts
```

### EMR sync returns "token endpoint" errors

Vendor sandbox credentials may have expired or your app registration may need renewal. Check:
- **Epic**: Verify your App Orchard / Showroom registration is active and the RSA key pair matches
- **Cerner**: Verify client credentials against the sandbox at `fhir-open.cerner.com`
- **athenahealth**: Verify API access at the athenahealth Developer Portal
