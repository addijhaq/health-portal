# Patient Portal Backend — Architecture Plan

## Overview

A FHIR-native patient portal backend for a private medical practice, built on **Medplum** (open-source FHIR platform) with **PhenoML** for clinical AI/NLP tasks. The system prioritizes interoperability with major EMRs (Epic, Cerner/Oracle Health, athenahealth) and supports bidirectional HL7 v2 feeds for legacy system integration.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **FHIR Server / CDR** | [Medplum](https://github.com/medplum/medplum) (self-hosted or cloud) | Clinical data repository, FHIR R4 API, auth, subscriptions |
| **Clinical AI / NLP** | [PhenoML](https://developer.pheno.ml) | Lang2FHIR, Construe (medical coding), Agent API |
| **Runtime** | Node.js 20+ / TypeScript | All backend services |
| **Database** | PostgreSQL (via Medplum) | FHIR resource storage |
| **HL7 v2** | `node-hl7-client` + `node-hl7-server` | Bidirectional HL7 v2 message feeds |
| **Auth** | OAuth 2.0 / SMART on FHIR | Patient & provider authentication |
| **Infrastructure** | Docker / AWS CDK (Medplum-provided) | Deployment and orchestration |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PATIENT PORTAL                              │
│                     (Future Frontend - React)                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS / FHIR R4
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY LAYER                            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ Auth Service │  │ Rate Limiting │  │ SMART on FHIR Scopes      │ │
│  │ (OAuth 2.0) │  │ & Audit Log   │  │ (patient/*.read, etc.)    │ │
│  └─────────────┘  └──────────────┘  └────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     MEDPLUM FHIR SERVER (CDR)                       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    FHIR R4 REST API                           │   │
│  │  /Patient  /Encounter  /Observation  /Condition  /MedRequest │   │
│  │  /AllergyIntolerance  /DiagnosticReport  /DocumentReference  │   │
│  │  /Appointment  /Schedule  /Slot  /Communication              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐   │
│  │ Subscriptions  │  │  Medplum Bots   │  │  Access Policies   │   │
│  │ (Event-driven) │  │ (Server-side TS)│  │  (RBAC/ABAC)       │   │
│  └────────────────┘  └─────────────────┘  └────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────┬──────────────────────┬──────────────────────────┬─────────────┘
      │                      │                          │
      ▼                      ▼                          ▼
┌───────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
│  PhenoML AI   │  │  EMR Connectors  │  │   HL7 v2 Interface       │
│  Integration  │  │  (FHIR R4)       │  │   Engine                 │
│               │  │                  │  │                          │
│ • Lang2FHIR   │  │ • Epic           │  │ • node-hl7-server        │
│ • Construe    │  │ • Cerner/Oracle  │  │   (inbound listener)     │
│ • Agent API   │  │ • athenahealth   │  │ • node-hl7-client        │
│ • Workflows   │  │                  │  │   (outbound sender)      │
└───────────────┘  └──────────────────┘  └──────────────────────────┘
```

---

## Module Breakdown

> **Module ↔ Phase mapping:**
> | Module | Implemented in |
> |---|---|
> | Module 1 (Medplum Core) | Phase 1 |
> | Module 2 (EMR Interoperability) | Phase 3 |
> | Module 3 (HL7 v2 Engine) | Phase 2 |
> | Module 4 (PhenoML AI) | Phase 4 |
> | Module 5 (Bots & Events) | Phases 1–4 (incrementally) |
> | Module 6 (Security & Compliance) | Phase 1 (foundation) + Phase 5 (hardening) |

### Module 1: Medplum Core Setup

**Purpose:** Stand up the FHIR server, configure authentication, and define the core data model.

#### 1.1 — Medplum Server Configuration
- Self-hosted deployment using Docker Compose (dev) and AWS CDK (prod)
- PostgreSQL database for FHIR resource storage
- Redis for caching and job queues
- Configuration via `medplum.config.json`

#### 1.2 — FHIR Resource Definitions (Core Patient Portal)
These are the FHIR R4 resources the portal will manage:

| Resource | Use Case |
|---|---|
| `Patient` | Patient demographics, contact info, identifiers |
| `Practitioner` | Provider profiles |
| `PractitionerRole` | Provider specialties, availability |
| `Organization` | Practice information |
| `Encounter` | Visit records |
| `Appointment` | Scheduling |
| `Schedule` / `Slot` | Provider availability |
| `Condition` | Problem list / diagnoses |
| `Observation` | Vitals, lab results |
| `DiagnosticReport` | Lab reports, imaging reports |
| `MedicationRequest` | Prescriptions |
| `AllergyIntolerance` | Allergy records |
| `Immunization` | Vaccination records |
| `DocumentReference` | Clinical documents (CCDs, PDFs) |
| `Communication` | Secure messaging between patient & provider |
| `Coverage` | Insurance information |
| `Claim` / `ExplanationOfBenefit` | Billing data |
| `Consent` | Patient consent records |
| `AuditEvent` | Security audit trail |
| `RelatedPerson` | Emergency contacts, next of kin (from HL7 NK1) |
| `Provenance` | Tracks origin of imported/generated resources |
| `Task` | Manual review items (MPI ambiguous matches, conflict review) |
| `DetectedIssue` | Flagged data conflicts from multi-source sync |
| `Parameters` | Sync state storage (last sync timestamps per vendor) |

#### 1.3 — Authentication & Authorization
- OAuth 2.0 / SMART on FHIR implementation (built into Medplum)
- Patient-facing auth: SMART patient standalone launch
- Provider-facing auth: SMART EHR launch (for embedded apps in Epic/Cerner)
- Access policies: patients see only their own data; providers see their panel
- MFA support for patient login

---

### Module 2: EMR Interoperability (FHIR R4)

**Purpose:** Bidirectional FHIR-based data exchange with Epic, Cerner, and athenahealth.

#### 2.1 — Architecture Pattern

Each EMR connector follows the same pattern:
```
┌─────────────┐     FHIR R4 / SMART on FHIR     ┌──────────────┐
│   Medplum    │ ◄──────────────────────────────► │  External    │
│   CDR        │     OAuth 2.0 + REST API         │  EMR System  │
│              │                                   │  (Epic, etc) │
└──────┬───────┘                                   └──────────────┘
       │
       ▼
  Medplum Bot
  (Sync Logic)
```

#### 2.2 — Epic Integration
- **Protocol:** FHIR R4 via SMART on FHIR
- **Auth:** OAuth 2.0 backend client credentials or SMART EHR launch
- **Developer portal:** Epic App Orchard / Showroom registration
- **Key endpoints:** `fhir.epic.com` sandbox → production
- **Data flow:**
  - **Import:** Pull patient records, encounters, results via FHIR search/read
  - **Export:** Write back appointments, clinical notes, orders
- **Bulk data:** FHIR Bulk Data Access ($export) for population-level sync

#### 2.3 — Cerner / Oracle Health Integration
- **Protocol:** FHIR R4 (DSTU2 fully deprecated as of Dec 2025)
- **Auth:** OAuth 2.0 via Ignite APIs, SMART configuration
- **Developer portal:** Oracle Health Developer Program
- **Key endpoints:** Discoverable via `.well-known/smart-configuration`
- **Data flow:** Same import/export pattern as Epic
- **Bulk data:** Group and Patient-level $export

#### 2.4 — athenahealth Integration
- **Protocol:** FHIR R4 (upgraded from DSTU2)
- **Auth:** OAuth 2.0 via athenahealth API program
- **Note:** Athena historically lagged behind Epic/Cerner on FHIR maturity; may require supplemental proprietary API calls for full coverage
- **Data flow:** Import/export with mapping layer for any R4 gaps

#### 2.5 — Sync Engine (Medplum Bots)

A set of Medplum Bots that handle synchronization logic:

| Bot | Trigger | Purpose |
|---|---|---|
| `emr-sync-epic` | Cron (every 15 min) + Subscription | Pull/push data to Epic FHIR API |
| `emr-sync-cerner` | Cron (every 15 min) + Subscription | Pull/push data to Cerner FHIR API |
| `emr-sync-athena` | Cron (every 15 min) + Subscription | Pull/push data to athenahealth API |

**Note:** Patient matching (MPI) and conflict resolution are functions *within* each sync bot (see Phase 3c and 3d), not separate bots.

Each sync bot:
1. Authenticates with the external EMR using stored credentials
2. Queries for new/updated resources since last sync timestamp
3. Maps and transforms FHIR resources (handling vendor-specific extensions)
4. Writes to Medplum CDR (import) or external EMR (export)
5. Logs sync results to AuditEvent for traceability

#### 2.6 — USCDI Compliance
All integrations target **USCDI v1/v3** data elements to ensure regulatory compliance:
- Patient demographics, problems, medications, allergies, procedures, immunizations, vital signs, lab results, clinical notes, care team, goals, assessments, health concerns, social history, and provenance.

---

### Module 3: HL7 v2 Interface Engine

**Purpose:** Direct interface with legacy systems that communicate via HL7 v2 message feeds (ADT, ORM, ORU, SIU, MDM).

#### 3.1 — Inbound HL7 v2 Listener (`node-hl7-server`)
- TCP/TLS listener on configurable port (default: 2575)
- Receives HL7 v2 messages from hospital systems, labs, radiology
- Parses messages, sends ACK/NAK responses
- Routes to appropriate handler based on message type

#### 3.2 — Outbound HL7 v2 Sender (`node-hl7-client`)
- Sends HL7 v2 messages to downstream systems
- Connection pooling, retry with exponential backoff
- TLS encryption for PHI in transit

#### 3.3 — Message Types Supported

| Message Type | Direction | Purpose |
|---|---|---|
| **ADT** (A01–A08) | Inbound/Outbound | Admit, discharge, transfer, registration |
| **ORM** (O01) | Outbound | Order entry (labs, imaging) |
| **ORU** (R01) | Inbound | Lab/test results |
| **SIU** (S12–S15) | Inbound/Outbound | Scheduling information |
| **MDM** (T02) | Inbound | Document management (clinical documents) |
| **DFT** (P03) | Inbound | Charge posting / billing |
| **RDE** (O11) | Outbound | Pharmacy orders |
| **VXU** (V04) | Inbound | Immunization updates |

#### 3.4 — HL7 v2 → FHIR R4 Transformation

Each inbound HL7 v2 message is transformed to FHIR R4 resources before storage in Medplum:

```
HL7 v2 Message → Parser → Transformer → FHIR Bundle → Medplum FHIR API
```

| HL7 v2 Segment | FHIR R4 Resource |
|---|---|
| PID | Patient |
| PV1 | Encounter |
| OBX | Observation |
| OBR | DiagnosticReport / ServiceRequest |
| DG1 | Condition |
| AL1 | AllergyIntolerance |
| RXA | Immunization |
| SCH | Appointment |
| TXA | DocumentReference |
| IN1/IN2 | Coverage |

**Data flow:** The HL7 engine is a standalone TCP service (not a Medplum Bot). It receives raw HL7 messages, transforms them to FHIR Bundles, and writes them to Medplum via the FHIR API. Post-processing (e.g., Construe coding, EMR sync triggers) is handled by Medplum Bots triggered by FHIR Subscriptions on the created resources (see Module 5).

#### 3.5 — FHIR R4 → HL7 v2 Transformation (Outbound)
Reverse mapping for outbound messages — Medplum Subscription triggers a bot that:
1. Receives FHIR resource change event
2. Calls the HL7 engine's outbound transform functions to build an HL7 v2 message from the FHIR data
3. Sends via `node-hl7-client` to configured destination

---

### Module 4: PhenoML AI Integration

**Purpose:** Clinical NLP, automated coding, natural-language-to-FHIR conversion, and intelligent clinical workflows.

#### 4.1 — Lang2FHIR Integration
- **Create endpoint:** Convert free-text clinical notes into structured FHIR resources
  - Example: "Patient has type 2 diabetes, on metformin 500mg BID" → `Condition` + `MedicationRequest` FHIR resources
- **Search endpoint:** Convert natural language queries to FHIR search parameters
  - Example: "Show me all diabetic patients with A1C > 9" → FHIR search query
- **Connected to Medplum:** PhenoML has native Medplum integration — resources created by Lang2FHIR are written directly to the Medplum CDR

#### 4.2 — Construe Integration (Medical Coding)
- Extract standardized medical codes from unstructured clinical text
- Supported vocabularies: **ICD-10-CM**, **ICD-10-PCS**, **CPT**, **SNOMED CT**, **LOINC**, **RxNorm**, **HPO**
- Use cases:
  - Auto-code diagnoses from provider notes
  - Validate/suggest billing codes
  - Normalize imported data from external EMRs
  - Code lab results with proper LOINC codes

#### 4.3 — Agent API
- Deploy AI agents that orchestrate Lang2FHIR + Construe for complex tasks
- Example workflows:
  - **Intake automation:** Parse patient intake forms → create FHIR resources
  - **Clinical decision support:** Analyze patient data → surface relevant guidelines
  - **Referral processing:** Extract referral details from faxed documents → create ServiceRequest
  - **Prior auth support:** Compile clinical documentation for insurance pre-authorization

#### 4.4 — Workflows API
- Declarative workflow definitions for recurring clinical AI tasks
- Example: "When a new lab result arrives, check if it's critical, notify the provider, and update the patient's problem list if needed"

#### 4.5 — Implementation Pattern
```typescript
// PhenoML service wrapper
import { PhenoMLClient } from './lib/phenoml-client';

// Lang2FHIR: Convert clinical text to FHIR
const fhirResources = await phenoml.lang2fhir.create({
  text: "Patient presents with acute bronchitis, prescribed azithromycin 250mg",
  fhirServer: "medplum",  // Direct write to Medplum CDR
  patientId: "patient-123"
});

// Construe: Extract medical codes
const codes = await phenoml.construe.extract({
  text: "Type 2 diabetes mellitus with diabetic nephropathy",
  vocabularies: ["ICD-10-CM", "SNOMED"],
});

// Agent: Complex multi-step clinical task
const result = await phenoml.agents.run({
  task: "Review this patient's medications and flag any interactions",
  patientId: "patient-123",
  fhirServer: "medplum"
});
```

---

### Module 5: Medplum Bots & Event System

**Purpose:** Server-side automation, event-driven workflows, and integration orchestration.

#### 5.1 — Bot Inventory

| Bot Name | Trigger | Description |
|---|---|---|
| `patient-onboarding` | Subscription: new `Patient` | Run PhenoML intake processing, match against external EMRs |
| `lab-result-processor` | Subscription: `Observation?category=laboratory` | Run Construe for LOINC coding validation, check critical values, notify provider |
| `notification-sender` | Subscription: `Communication`, `Appointment` + Cron: daily | Send SMS/email notifications (new messages, appointment reminders, critical results) |
| `document-processor` | Subscription: new `DocumentReference` | Run PhenoML extraction on uploaded clinical documents |
| `emr-sync-epic` | Cron: 15 min + Subscription | Bidirectional sync with Epic |
| `emr-sync-cerner` | Cron: 15 min + Subscription | Bidirectional sync with Cerner |
| `emr-sync-athena` | Cron: 15 min + Subscription | Bidirectional sync with athenahealth |
| `hl7-adt-handler` | Subscription: `Encounter` | Post-process ADT-originated Encounters (validate demographics, trigger EMR sync) |
| `hl7-oru-handler` | Subscription: `DiagnosticReport` | Post-process ORU-originated results (run Construe for LOINC coding, check critical values) |
| `hl7-siu-handler` | Subscription: `Appointment` | Post-process SIU-originated appointments (sync to external EMRs, send confirmations) |
| `audit-logger` | Subscription: all writes | Enhanced audit logging for compliance |
| `consent-enforcer` | Subscription: `Consent` changes | Update access policies based on patient consent |

**HL7 data flow clarification:** The HL7 v2 interface engine (`packages/hl7-engine`) handles all raw HL7 message parsing and FHIR transformation. It writes FHIR resources to Medplum. The `hl7-*-handler` bots above are *post-processing* bots — they are triggered by FHIR subscriptions on the resources the HL7 engine creates, not by raw HL7 messages directly. The HL7 engine itself is not a Medplum Bot; it is a standalone TCP service.

**Subscription overlap note:** Both `siu-handler` and `notification-sender` subscribe to `Appointment`. To avoid duplicate processing, the HL7 engine should tag resources it creates with `meta.tag = { system: "http://health-portal/origin", code: "hl7-v2" }`. The `hl7-*-handler` bots should check for this tag and skip resources that don't have it. The `notification-sender` handles all appointment notifications regardless of origin.

#### 5.2 — Subscription Configuration
Each subscription is defined as a FHIR `Subscription` resource. The `criteria` field is a FHIR resource type (optionally with search parameters) — the subscription fires on any create/update matching that criteria:
```json
{
  "resourceType": "Subscription",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<bot-id>",
    "payload": "application/fhir+json"
  }
}
```

**Note:** Bot IDs in `medplum.config.json` are populated after creating Bot resources in Medplum (via the admin UI or `scripts/deploy-bots.ts`). The deploy script should create the Bot resource if it doesn't exist, then update the config file with the assigned ID.

---

### Module 6: Security & Compliance

#### 6.1 — HIPAA Compliance
- All PHI encrypted at rest (AES-256) and in transit (TLS 1.2+)
- Role-based access control (RBAC) via Medplum access policies
- Audit logging for all data access (`AuditEvent` resources)
- BAA with Medplum (if using hosted) or self-managed compliance (if self-hosted)
- Automatic session timeout and token expiration

#### 6.2 — Authentication Flows
- **Patient login:** OAuth 2.0 authorization code flow with PKCE
- **Provider login:** SMART EHR launch (embedded in Epic/Cerner) or standalone
- **System-to-system:** OAuth 2.0 client credentials (for bots, EMR sync)
- **MFA:** TOTP-based two-factor authentication for portal login

#### 6.3 — Access Policies
```
Patient → read own: Patient, Observation, Condition, MedicationRequest, AllergyIntolerance,
          Immunization, DiagnosticReport, DocumentReference, Encounter, Coverage, Schedule, Slot
          read/write own: Appointment, Communication, Consent
Provider → read/write panel: all clinical resources for assigned patients
Admin → full access with audit trail
Bot (EMR Sync) → scoped to clinical resources, AuditEvent, Parameters, DetectedIssue, Task
```

Admin and Bot access policies are defined in `config/fhir/access-policies.json` and uploaded to Medplum during Phase 1c via `scripts/setup-subscriptions.ts`.

---

## Project Structure

> Files marked with `✓` already exist. Unmarked files are planned and will be created during the indicated phase.

```
health-portal/
├── ARCHITECTURE.md              ✓   # This document
├── package.json                 ✓   # Root workspace config
├── tsconfig.json                ✓   # Root TypeScript config
├── docker-compose.yml           ✓   # Local dev environment
├── medplum.config.json          ✓   # Medplum bot deployment config
├── .env.example                 ✓   # Environment variable template
│
├── packages/
│   ├── core/                    ✓   # Shared types, utilities, constants
│   │   ├── src/
│   │   │   ├── types/index.ts   ✓
│   │   │   ├── constants/index.ts ✓
│   │   │   ├── utils/index.ts   ✓
│   │   │   └── index.ts         ✓
│   │   ├── package.json         ✓
│   │   └── tsconfig.json        ✓
│   │
│   ├── bots/                    ✓   # Medplum Bots (server-side logic)
│   │   ├── src/
│   │   │   ├── emr-sync/
│   │   │   │   ├── epic-sync.ts    ✓
│   │   │   │   ├── cerner-sync.ts  ✓
│   │   │   │   ├── athena-sync.ts  ✓
│   │   │   │   └── sync-utils.ts       # Phase 3d
│   │   │   ├── hl7-handlers/           # Post-processing bots (not HL7 parsing — see Module 3)
│   │   │   │   ├── adt-handler.ts  ✓
│   │   │   │   ├── oru-handler.ts  ✓
│   │   │   │   └── siu-handler.ts  ✓
│   │   │   ├── clinical/
│   │   │   │   ├── patient-onboarding.ts  ✓
│   │   │   │   ├── lab-result-processor.ts ✓
│   │   │   │   ├── document-processor.ts   # Phase 4b
│   │   │   │   └── notification-sender.ts  # Phase 5d
│   │   │   └── admin/
│   │   │       ├── audit-logger.ts         # Phase 5f
│   │   │       └── consent-enforcer.ts     # Phase 5e
│   │   ├── package.json         ✓
│   │   └── tsconfig.json        ✓
│   │
│   ├── hl7-engine/              ✓   # HL7 v2 interface engine (standalone TCP service)
│   │   ├── src/
│   │   │   ├── server.ts        ✓   # HL7 v2 MLLP listener
│   │   │   ├── client.ts        ✓   # HL7 v2 MLLP sender
│   │   │   ├── router.ts        ✓   # Message type routing
│   │   │   ├── transforms/          # HL7↔FHIR transformations
│   │   │   │   ├── adt-transform.ts    # Phase 2b
│   │   │   │   ├── oru-transform.ts    # Phase 2b
│   │   │   │   ├── orm-transform.ts    # Phase 2c (outbound)
│   │   │   │   ├── siu-transform.ts    # Phase 2b
│   │   │   │   └── common.ts       ✓  # PID→Patient, gender, timestamp maps
│   │   │   └── index.ts         ✓
│   │   ├── package.json         ✓
│   │   └── tsconfig.json        ✓
│   │
│   ├── phenoml/                 ✓   # PhenoML AI integration layer
│   │   ├── src/
│   │   │   ├── client.ts        ✓   # PhenoML API client
│   │   │   ├── lang2fhir.ts     ✓   # Lang2FHIR service
│   │   │   ├── construe.ts      ✓   # Construe medical coding service
│   │   │   ├── agents.ts        ✓   # Agent API integration
│   │   │   ├── workflows.ts         # Phase 4d (Workflows API)
│   │   │   └── index.ts         ✓
│   │   ├── package.json         ✓
│   │   └── tsconfig.json        ✓
│   │
│   └── emr-connectors/          ✓   # External EMR FHIR connectors
│       ├── src/
│       │   ├── base-connector.ts ✓   # Abstract connector class
│       │   ├── epic/
│       │   │   ├── epic-connector.ts ✓
│       │   │   ├── epic-auth.ts      # Phase 3b
│       │   │   └── epic-mappings.ts  # Phase 3b
│       │   ├── cerner/
│       │   │   ├── cerner-connector.ts ✓
│       │   │   ├── cerner-auth.ts    # Phase 3b
│       │   │   └── cerner-mappings.ts # Phase 3b
│       │   ├── athena/
│       │   │   ├── athena-connector.ts ✓
│       │   │   ├── athena-auth.ts    # Phase 3b
│       │   │   └── athena-mappings.ts # Phase 3b
│       │   └── index.ts         ✓
│       ├── package.json         ✓
│       └── tsconfig.json        ✓
│
├── config/
│   ├── fhir/
│   │   ├── access-policies.json ✓   # Medplum access policy definitions
│   │   ├── subscriptions.json   ✓   # Subscription definitions
│   │   └── search-params.json       # Phase 5g (custom search parameters)
│   └── hl7/
│       └── message-profiles.json    # Phase 2a (HL7 v2 message definitions)
│
├── scripts/                         # All created in Phase 1
│   ├── seed-data.ts                 # Phase 1d — Load test data into Medplum
│   ├── deploy-bots.ts               # Phase 1e — Deploy bots via Medplum CLI
│   └── setup-subscriptions.ts       # Phase 1c — Create FHIR subscriptions & access policies
│
└── tests/                           # Created incrementally per phase
    ├── unit/
    ├── integration/
    └── fixtures/                    # Sample HL7 messages, FHIR bundles
```

---

## Implementation Phases

> **Dependency note:** Phase 1 is a prerequisite for all other phases.
> Phases 2, 3, and 4 can run in parallel after Phase 1 is complete.
> Phase 5 depends on Phases 2–4 being substantially complete.

### Phase 1: Foundation (Weeks 1–3)

**Goal:** A running Medplum server with auth, access policies, and test data — enough for other phases to build against.

#### 1a. Infrastructure
- [ ] Launch Medplum server via `docker-compose up` (Medplum + PostgreSQL + Redis)
- [ ] Verify FHIR R4 API is reachable at `http://localhost:8103/fhir/R4/metadata`
- [ ] Create a Medplum project and admin user via the Medplum app (`localhost:3000`)
- [ ] Create a ClientApplication resource for system-to-system auth (bot deploys, sync jobs)
- [ ] Store client credentials in `.env` (not committed — use `.env.example` as template)

#### 1b. Monorepo & build pipeline
- [ ] Run `npm install` from root — verify all five workspaces resolve
- [ ] Confirm `npm run build` compiles all packages (fix any TypeScript project-reference issues)
- [ ] Add a basic Jest config to root and at least one smoke test per package

#### 1c. Access policies, subscriptions & auth
- [ ] Write `scripts/setup-subscriptions.ts` to automate uploading access policies and subscriptions to Medplum:
  - Read `config/fhir/access-policies.json` and POST each policy as an `AccessPolicy` resource via the Medplum FHIR API
  - Read `config/fhir/subscriptions.json` and create `Subscription` resources (requires bot IDs — run after 1e)
- [ ] Upload all four access policies (Patient Portal, Provider, Admin, Bot-EMR-Sync) from `config/fhir/access-policies.json`
- [ ] Create test Patient + Practitioner users and assign them the Patient Portal and Provider access policies respectively
- [ ] Verify compartment-scoped access: authenticated as test Patient, confirm `GET /fhir/R4/Patient` returns only that patient's record; confirm `GET /fhir/R4/Observation` returns only observations where `subject` is that patient
- [ ] Verify SMART on FHIR standalone launch flow works against Medplum's built-in OAuth server (use Postman/Insomnia against `<medplum>/auth/authorize`)
- [ ] Document the token scopes required for patient vs. provider vs. system clients in `.env.example` comments

#### 1d. Seed data
- [ ] Write `scripts/seed-data.ts` to populate Medplum with synthetic test data:
  - 10 Patients (varied demographics for MPI testing)
  - 3 Practitioners, 1 Organization
  - 20 Observations (vitals + lab results with LOINC codes)
  - 5 Conditions (ICD-10-CM coded)
  - 5 MedicationRequests (RxNorm coded)
  - 5 Appointments (future-dated for scheduling tests)
  - 3 DocumentReferences (with base64-encoded sample PDFs)
- [ ] Run seed script and verify data is queryable via FHIR search

#### 1e. Bot deployment pipeline
- [ ] Create a Bot resource in Medplum (via admin UI or FHIR API `POST /fhir/R4/Bot`) — note the returned ID
- [ ] Update `medplum.config.json` with the Bot's ID in the matching entry
- [ ] Deploy the bot code: `npx medplum bot deploy patient-onboarding` (requires `MEDPLUM_CLIENT_ID` + `MEDPLUM_CLIENT_SECRET` env vars)
- [ ] Create a Subscription pointing to that bot (criteria: `Patient`, channel endpoint: `Bot/<bot-id>`)
- [ ] Verify the bot fires when a new Patient is created via the FHIR API
- [ ] Write `scripts/deploy-bots.ts` to automate this: create Bot resources if missing, populate IDs in config, deploy all bots

#### 1f. External dependency registration (start early — these have lead times)
- [ ] Register for PhenoML API key at https://developer.pheno.ml (needed for Phase 4)
- [ ] Register Epic App Orchard / Showroom app (sandbox approval can take 1–2 weeks, needed for Phase 3)
- [ ] Register in Oracle Health Developer Program for Cerner sandbox credentials (needed for Phase 3)
- [ ] Register in athenahealth Developer Portal for API access (needed for Phase 3)

---

### Phase 2: HL7 v2 Interface Engine (Weeks 3–5)

**Goal:** Receive HL7 v2 messages over TCP, transform them to FHIR, and write to Medplum. Send outbound HL7 v2 messages when FHIR resources change.

> Can run in parallel with Phases 3 and 4.

#### 2a. Inbound listener
- [ ] Implement `Hl7Server.start()` using `node-hl7-server` — open MLLP listener on port 2575
- [ ] Parse inbound messages into segments using node-hl7-server's built-in parser
- [ ] Extract `Hl7MessageMeta` (MSH segment: message type, trigger event, control ID, sending/receiving facility, timestamp)
- [ ] Wire parsed messages through `Hl7Router.route()` to dispatch by message type
- [ ] Return ACK (MSA with code AA) on success, NAK (code AE/AR) on failure
- [ ] Add TLS support (optional, configured via `HL7_TLS_CERT_PATH` / `HL7_TLS_KEY_PATH`)

#### 2b. Inbound transforms (HL7 v2 → FHIR R4)
Each transform produces a FHIR `Bundle` of type `transaction` that is POSTed to Medplum:

- [ ] **ADT transform** (`adt-transform.ts`):
  - PID → Patient (create or update by MRN match)
  - PV1 → Encounter (set status based on trigger: A01=in-progress, A03=finished, A04=planned)
  - DG1 → Condition (attach to Encounter)
  - IN1/IN2 → Coverage
  - NK1 → RelatedPerson
- [ ] **ORU transform** (`oru-transform.ts`):
  - PID → Patient (lookup by MRN, do not create — if no matching Patient exists, return HL7 NAK with code AE and store the raw message in a `DocumentReference` with category `unmatched-oru` for manual resolution)
  - OBR → DiagnosticReport (one per OBR group)
  - OBX → Observation (one per OBX, linked to DiagnosticReport; parse value type: NM=valueQuantity, ST=valueString, CE=valueCodeableConcept)
  - Set Observation.status from OBX-11 (F=final, P=preliminary, C=corrected)
- [ ] **SIU transform** (`siu-transform.ts`):
  - SCH → Appointment (start/end from SCH-11, status from trigger: S12=booked, S13=booked, S14=booked, S15=cancelled)
  - AIG → Appointment.participant (provider reference)
  - PID → Patient reference
- [ ] **Common mappings** (`common.ts` — already scaffolded):
  - PID → Patient (demographics, identifiers, telecom, address)
  - Gender mapping (M/F/O/U → male/female/other/unknown)
  - HL7 timestamp ↔ FHIR dateTime conversion

#### 2c. Outbound sender (FHIR R4 → HL7 v2)
- [ ] Implement `Hl7Client.send()` using `node-hl7-client` — MLLP connection with retry (3 attempts, exponential backoff)
- [ ] Build reverse transforms for outbound messages:
  - **ORM^O01** (outbound lab/imaging orders): ServiceRequest → ORC + OBR segments
  - **ADT^A04** (outbound registration): Patient → MSH + PID + PV1 segments
  - **RDE^O11** (outbound pharmacy order): MedicationRequest → RXE + RXR segments
- [ ] Create a Medplum Subscription that triggers on new `ServiceRequest` resources and sends the ORM message to a configured downstream lab system

#### 2d. Testing
- [ ] Create HL7 v2 fixture files in `tests/fixtures/`:
  - `adt-a01-admit.hl7`, `adt-a03-discharge.hl7`, `adt-a04-register.hl7`
  - `oru-r01-cbc.hl7` (complete blood count), `oru-r01-bmp.hl7` (basic metabolic panel)
  - `siu-s12-new-appointment.hl7`, `siu-s15-cancel-appointment.hl7`
- [ ] Unit tests: each transform function receives a parsed HL7 message and returns the expected FHIR Bundle
- [ ] Integration test: send an HL7 message to the TCP listener, verify the corresponding FHIR resources appear in Medplum

---

### Phase 3: EMR Connectors & Sync (Weeks 3–8)

**Goal:** Authenticate with Epic, Cerner, and athenahealth sandbox FHIR APIs; pull and push patient data bidirectionally; resolve conflicts.

> Can run in parallel with Phases 2 and 4.

#### 3a. Vendor sandbox verification
Registration should already be initiated in Phase 1f. This step verifies sandbox access is working:
- [ ] **Epic:** Confirm App Orchard / Showroom approval. Generate RSA key pair for JWT auth. Verify token acquisition against the sandbox token endpoint. Make a test `GET /Patient` call.
- [ ] **Cerner:** Verify client credentials work against the Cerner open sandbox (`fhir-open.cerner.com`) for read-only access, and the registered app sandbox for write access. Make a test `GET /Patient` call.
- [ ] **athenahealth:** Verify API access is granted. Document which FHIR R4 resources are supported (run `GET /metadata` and parse the CapabilityStatement). List any gaps that require the proprietary Athena API as a fallback.

#### 3b. Connector implementation
The base connector class (`base-connector.ts`) is already scaffolded with `authenticate()`, `read()`, `search()`, `write()`, `pullChanges()`, and `bulkExport()`.

- [ ] **Epic auth** (`epic-auth.ts`): Implement JWT assertion flow — build JWT (iss=client_id, sub=client_id, aud=token_endpoint, jti=uuid, exp=5min), sign with RS384 using private key, POST to `/oauth2/token` with `grant_type=client_credentials` + `client_assertion`
- [ ] **Cerner auth** (`cerner-auth.ts`): Already scaffolded in `cerner-connector.ts` — verify against sandbox, handle token refresh
- [ ] **Athena auth** (`athena-auth.ts`): Same pattern as Cerner — verify against sandbox
- [ ] **Vendor-specific FHIR mappings** (`*-mappings.ts`): Each vendor returns FHIR R4 but with vendor-specific extensions. Write mapping functions that:
  - Strip vendor extensions on import (or store as Extension resources)
  - Map vendor identifier systems to local MRN identifiers
  - Normalize CodeableConcept codings (e.g., Epic may use proprietary code systems alongside SNOMED/ICD-10)

#### 3c. Patient matching (MPI)
- [ ] Implement deterministic matching: exact match on (lastName + dateOfBirth + gender), then confirm with an additional identifier (MRN, SSN last 4)
- [ ] Implement probabilistic matching: weighted scoring on (firstName Levenshtein distance, address similarity, phone number) with a configurable threshold (default: 0.85)
- [ ] When a new Patient arrives from an external EMR, check for existing matches in Medplum before creating a new record
- [ ] Link matched patients using `Patient.link` (type=`seealso`) to preserve both identities
- [ ] Log unresolved matches (score between 0.70–0.85) for manual review via a flagged `Task` resource

#### 3d. Sync engine
- [ ] Implement `sync-utils.ts` with:
  - `getLastSyncTimestamp(vendor)`: Read from a Medplum `Parameters` resource keyed by vendor name
  - `setLastSyncTimestamp(vendor, timestamp)`: Update after successful sync
  - `buildSyncAuditEvent(result: SyncResult)`: Create AuditEvent with sync stats
- [ ] **Import flow** (external EMR → Medplum):
  1. Call `connector.pullChanges(since, resourceTypes)` to get a Bundle of updated resources
  2. For each resource, run patient matching to find/create the local Patient
  3. Remap identifiers and references to local IDs
  4. POST the transaction Bundle to Medplum
- [ ] **Export flow** (Medplum → external EMR):
  1. Subscriptions are already defined in `config/fhir/subscriptions.json` (`epic-sync-trigger`, `cerner-sync-trigger`, `athena-sync-trigger`) — these fire on changes to Patient, Encounter, Observation, Condition, MedicationRequest
  2. When triggered, the sync bot maps the local resource to the vendor's expected format using the vendor mapping functions
  3. Call `connector.write()` to push to the external EMR
  4. Log the export result via `buildSyncAuditEvent()`
- [ ] **Conflict resolution strategy:**
  - Last-writer-wins by default (use `Resource.meta.lastUpdated` comparison)
  - For specific resource types (MedicationRequest, AllergyIntolerance), flag conflicts for provider review instead of auto-merging — create a `DetectedIssue` resource
  - Never auto-resolve conflicts on `Patient` demographics — always flag for review

#### 3e. Bulk import
- [ ] Implement `bulkExport()` for Epic and Cerner using FHIR Bulk Data Access IG:
  1. POST to `/$export` or `/Group/{id}/$export` with `_type` parameter
  2. Poll the status endpoint until `200 OK` with output URLs
  3. Download NDJSON files from output URLs
  4. Parse and import line-by-line into Medplum

#### 3f. Testing
- [ ] Unit tests for each auth flow (mock HTTP responses from vendor token endpoints)
- [ ] Unit tests for vendor mapping functions (sample vendor FHIR resources → normalized local format)
- [ ] Integration tests against vendor sandboxes (Epic sandbox, Cerner open sandbox) — these are slow and should be tagged for CI-only execution

---

### Phase 4: Clinical AI — PhenoML Integration (Weeks 3–7)

**Goal:** Use PhenoML APIs to automate clinical coding, FHIR resource creation from free text, and intelligent document processing.

> Can run in parallel with Phases 2 and 3. Depends only on Phase 1 (Medplum + PhenoML client library).

#### 4a. PhenoML client verification
API key registration should already be initiated in Phase 1f.
- [ ] Verify connectivity: call a simple Construe request with a known clinical phrase (e.g., "type 2 diabetes") and confirm a valid ICD-10-CM code is returned (E11.9)
- [ ] Configure the PhenoML → Medplum connection so Lang2FHIR can write directly to the Medplum CDR (pass Medplum base URL and system client credentials to PhenoML's fhirServer config)
- [ ] Verify end-to-end: call Lang2FHIR with a sample clinical note and confirm the resulting FHIR resources appear in Medplum

#### 4b. Lang2FHIR integration
- [ ] Wire the `Lang2FhirService.create()` method into a Medplum Bot (`document-processor`):
  - Input: `DocumentReference` with attached clinical note text
  - Output: FHIR Bundle (Conditions, MedicationRequests, AllergyIntolerances, Procedures) written to Medplum with references to the source Patient
- [ ] Wire the `Lang2FhirService.search()` method into a utility for provider-facing natural language queries (used in Phase 5 portal features)
- [ ] Validate generated resources: check that each Condition has an ICD-10-CM or SNOMED code, each MedicationRequest has an RxNorm code

#### 4c. Construe integration (medical coding)
- [ ] Wire `ConstructService.extract()` into the `lab-result-processor` bot:
  - When an Observation arrives without a LOINC code (e.g., from an HL7 feed that used local codes), call Construe to suggest the LOINC code
  - If Construe returns a result with confidence ≥ 0.90, auto-apply the code; otherwise flag for provider review
- [ ] Build a standalone coding utility for batch coding of imported data:
  - Input: list of Condition resources with free-text `Condition.code.text` but no structured codes
  - Output: each Condition enriched with ICD-10-CM and/or SNOMED codes from Construe

#### 4d. Agent API — clinical workflows
- [ ] **Intake automation bot** (`patient-onboarding`): When a new Patient is created with attached intake documents (questionnaires, prior records), run the PhenoML Agent to:
  1. Extract demographics, problem list, medication list, allergies from the documents
  2. Create corresponding FHIR resources (Condition, MedicationRequest, AllergyIntolerance)
  3. Flag any items that need provider confirmation (low confidence or ambiguous)
- [ ] **Referral processor**: Accept a scanned/faxed referral letter (DocumentReference with PDF), run PhenoML Agent to extract referring provider, reason for referral, urgency → create a ServiceRequest resource

#### 4e. Document processing pipeline
This handles the full lifecycle of clinical documents arriving as PDFs or faxes:
- [ ] Accept inbound documents via:
  - Direct upload (FHIR `DocumentReference` with `content.attachment.data` base64)
  - Fax-to-email integration (future — stub the email-to-DocumentReference ingestion)
- [ ] OCR / text extraction: If PhenoML Agent handles raw PDFs, send directly; otherwise integrate a pre-processing step (e.g., extract text with `pdf-parse` before sending to PhenoML)
- [ ] Chain: Document arrives → `document-processor` bot → PhenoML Agent → FHIR resources created → linked back to source DocumentReference via `Provenance` resource

#### 4f. Testing
- [ ] Unit tests with mocked PhenoML API responses (sample Lang2FHIR output, sample Construe codes)
- [ ] Integration tests with live PhenoML API using known clinical text:
  - "Type 2 diabetes mellitus" should return ICD-10 E11.9
  - "Metformin 500mg" should return RxNorm 860975
  - "Patient with penicillin allergy" should produce an AllergyIntolerance resource

---

### Phase 5: Portal Features & Hardening (Weeks 8–12)

**Goal:** Patient- and provider-facing portal features, notification delivery, and production readiness.

> Depends on Phases 2–4 being substantially complete.

#### 5a. Patient-facing API layer
Medplum already exposes the FHIR R4 API. This phase configures it for patient self-service:
- [ ] Verify access policies enforce patient compartment scoping (patient can only access resources where they are the subject)
- [ ] Create a SMART on FHIR app registration for the patient portal frontend (authorization code flow + PKCE)
- [ ] Implement a thin API proxy (or Medplum Bot) for patient-specific operations not covered by raw FHIR:
  - **My health summary**: Aggregate the patient's active Conditions, current MedicationRequests, recent Observations, and upcoming Appointments into a single response (FHIR `$everything` operation or custom Bundle)
  - **Download my records**: Generate a C-CDA or FHIR Bundle export of the patient's complete record

#### 5b. Appointment scheduling
- [ ] Populate `Schedule` and `Slot` resources for each Practitioner (based on configurable office hours)
- [ ] Build a booking flow: patient queries available Slots → selects one → creates Appointment (status=proposed) → bot notifies provider → provider confirms (status=booked)
- [ ] Handle cancellation: patient updates Appointment status=cancelled → bot sends cancellation to external EMR (if synced) and HL7 SIU^S15 to downstream systems

#### 5c. Secure messaging
- [ ] Patient creates a `Communication` resource (sender=Patient, recipient=Practitioner, payload=text)
- [ ] Subscription triggers notification to provider (see 5d)
- [ ] Provider replies by creating a `Communication` with `inResponseTo` reference
- [ ] Access policy ensures patients can only see Communications where they are sender or recipient

#### 5d. Notifications (SMS / email)
- [ ] Integrate a notification delivery service (AWS SES for email, AWS SNS or Twilio for SMS)
- [ ] Build a `notification-sender` bot triggered by:
  - New Communication → email/SMS to recipient
  - Appointment reminder (cron: daily) → SMS/email for appointments in the next 24–48 hours
  - Critical lab result → SMS to provider
- [ ] Store notification preferences on the Patient resource (extension or linked Communication preferences)

#### 5e. Consent management
- [ ] When a patient creates or updates a `Consent` resource (e.g., opts out of data sharing with a specific EMR), the `consent-enforcer` bot updates the corresponding Medplum access policy to block that data flow
- [ ] Support granular consent: per-resource-type opt-in/opt-out (e.g., share labs but not mental health records)
- [ ] Audit all consent changes via AuditEvent

#### 5f. Audit & compliance
- [ ] Verify that every FHIR API request generates an `AuditEvent` (Medplum does this by default — confirm it covers all access paths including Bot-initiated reads)
- [ ] Build an audit dashboard query: list all access to a specific Patient's data in the last 30 days (for patient "accounting of disclosures" requests per HIPAA)
- [ ] Review and harden all access policies — ensure no over-permissive rules
- [ ] Verify TLS is enforced on all external connections (FHIR APIs, HL7 v2, PhenoML)

#### 5g. Performance & load testing
- [ ] Load test the Medplum FHIR API: target 100 concurrent patient sessions, 50 req/sec sustained
- [ ] Load test the HL7 v2 listener: target 10 messages/sec sustained
- [ ] Profile EMR sync bots: ensure a full sync cycle completes within the 15-minute cron window
- [ ] Identify and index any slow FHIR search queries (custom SearchParameter resources if needed)

---

## Key Dependencies

```json
{
  "@medplum/core": "^3.2.0",
  "@medplum/fhirtypes": "^3.2.0",
  "node-hl7-client": "^2.3.0",
  "node-hl7-server": "^2.3.0"
}
```

PhenoML is accessed via REST API (API key auth at `https://api.pheno.ml`).

**Dev dependencies** (root `package.json`): TypeScript ^5.3, Jest, ESLint, ts-node.

**Version policy:** Pin major versions in `package.json` using `^` ranges. Run `npm audit` weekly and update patch/minor versions. Major upgrades require a dedicated PR with test verification.

---

## Environment Configuration

```env
# Medplum
MEDPLUM_BASE_URL=http://localhost:8103
MEDPLUM_CLIENT_ID=<client-id>
MEDPLUM_CLIENT_SECRET=<client-secret>

# PhenoML
PHENOML_API_KEY=<api-key>
PHENOML_BASE_URL=https://api.pheno.ml

# Epic FHIR
EPIC_FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
EPIC_CLIENT_ID=<epic-client-id>
EPIC_PRIVATE_KEY_PATH=./config/keys/epic-private-key.pem

# Cerner / Oracle Health
CERNER_FHIR_BASE_URL=https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d
CERNER_CLIENT_ID=<cerner-client-id>
CERNER_CLIENT_SECRET=<cerner-client-secret>

# athenahealth
ATHENA_FHIR_BASE_URL=https://api.platform.athenahealth.com/fhir/r4
ATHENA_CLIENT_ID=<athena-client-id>
ATHENA_CLIENT_SECRET=<athena-client-secret>

# HL7 v2
HL7_LISTEN_PORT=2575
HL7_TLS_CERT_PATH=./config/tls/cert.pem
HL7_TLS_KEY_PATH=./config/tls/key.pem
```

**Note:** The PostgreSQL database is managed entirely by Medplum's Docker Compose configuration (`docker-compose.yml`). No `DATABASE_URL` env var is needed in application code — Medplum handles its own database connection internally.

---

## References

- [Medplum Documentation](https://www.medplum.com/docs)
- [Medplum GitHub](https://github.com/medplum/medplum)
- [PhenoML Developer Portal](https://developer.pheno.ml/docs/overview)
- [PhenoML + Medplum Integration](https://github.com/PhenoML/medplum-provider-lang2fhir)
- [Epic on FHIR](https://fhir.epic.com/)
- [Cerner SMART on FHIR Tutorial](https://engineering.cerner.com/smart-on-fhir-tutorial/)
- [Medplum SMART on FHIR Demo](https://github.com/medplum/medplum-smart-on-fhir-demo)
- [Medplum External FHIR Servers](https://www.medplum.com/docs/cli/external-fhir-servers)
- [Medplum Integration Docs](https://www.medplum.com/docs/integration)
- [node-hl7-client](https://github.com/Bugs5382/node-hl7-client)
- [node-hl7-server](https://www.npmjs.com/package/node-hl7-server)
- [HL7 FHIR R4 Specification](https://hl7.org/fhir/R4/)
