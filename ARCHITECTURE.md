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
| `epic-sync-bot` | Cron (every 15 min) + Subscription | Pull/push data to Epic FHIR API |
| `cerner-sync-bot` | Cron (every 15 min) + Subscription | Pull/push data to Cerner FHIR API |
| `athena-sync-bot` | Cron (every 15 min) + Subscription | Pull/push data to athenahealth API |
| `conflict-resolver-bot` | Subscription (on merge conflict) | Resolve conflicting updates across systems |
| `patient-match-bot` | Subscription (new Patient) | MPI-style matching across systems |

Each bot:
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

#### 3.5 — FHIR R4 → HL7 v2 Transformation (Outbound)
Reverse mapping for outbound messages — Medplum Subscription triggers a bot that:
1. Receives FHIR resource change event
2. Builds HL7 v2 message from FHIR data
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
| `lab-result-processor` | HL7 ORU inbound | Transform HL7 → FHIR, run Construe for LOINC coding, notify provider |
| `appointment-reminder` | Cron: daily | Send SMS/email reminders for upcoming appointments |
| `document-processor` | Subscription: new `DocumentReference` | Run PhenoML extraction on uploaded clinical documents |
| `emr-sync-epic` | Cron: 15 min + Subscription | Bidirectional sync with Epic |
| `emr-sync-cerner` | Cron: 15 min + Subscription | Bidirectional sync with Cerner |
| `emr-sync-athena` | Cron: 15 min + Subscription | Bidirectional sync with athenahealth |
| `hl7-adt-handler` | HL7 ADT inbound | Process admit/discharge/transfer events |
| `hl7-oru-handler` | HL7 ORU inbound | Process lab results |
| `hl7-siu-handler` | HL7 SIU inbound | Process scheduling events |
| `audit-logger` | Subscription: all writes | Enhanced audit logging for compliance |
| `consent-enforcer` | Subscription: `Consent` changes | Update access policies based on patient consent |

#### 5.2 — Subscription Configuration
Each subscription is defined as a FHIR `Subscription` resource:
```json
{
  "resourceType": "Subscription",
  "status": "active",
  "criteria": "Patient?_lastUpdated=gt2024-01-01",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<bot-id>",
    "payload": "application/fhir+json"
  }
}
```

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
Patient → can read/write own: Patient, Appointment, Communication, Consent
Provider → can read/write panel: all clinical resources for assigned patients
Admin → full access with audit trail
System (Bots) → scoped access per bot function
```

---

## Project Structure

```
health-portal/
├── ARCHITECTURE.md                  # This document
├── package.json                     # Root workspace config
├── tsconfig.json                    # Root TypeScript config
├── docker-compose.yml               # Local dev environment
├── medplum.config.json              # Medplum bot deployment config
│
├── packages/
│   ├── core/                        # Shared types, utilities, constants
│   │   ├── src/
│   │   │   ├── types/               # FHIR type extensions, custom types
│   │   │   ├── constants/           # Code systems, identifiers, config
│   │   │   ├── utils/               # Shared utility functions
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── bots/                        # Medplum Bots (server-side logic)
│   │   ├── src/
│   │   │   ├── emr-sync/
│   │   │   │   ├── epic-sync.ts
│   │   │   │   ├── cerner-sync.ts
│   │   │   │   ├── athena-sync.ts
│   │   │   │   └── sync-utils.ts
│   │   │   ├── hl7-handlers/
│   │   │   │   ├── adt-handler.ts
│   │   │   │   ├── oru-handler.ts
│   │   │   │   ├── siu-handler.ts
│   │   │   │   └── hl7-fhir-mapper.ts
│   │   │   ├── clinical/
│   │   │   │   ├── patient-onboarding.ts
│   │   │   │   ├── lab-result-processor.ts
│   │   │   │   ├── document-processor.ts
│   │   │   │   └── appointment-reminder.ts
│   │   │   └── admin/
│   │   │       ├── audit-logger.ts
│   │   │       └── consent-enforcer.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── hl7-engine/                  # HL7 v2 interface engine
│   │   ├── src/
│   │   │   ├── server.ts            # HL7 v2 TCP listener
│   │   │   ├── client.ts            # HL7 v2 TCP sender
│   │   │   ├── router.ts            # Message type routing
│   │   │   ├── transforms/          # HL7↔FHIR transformations
│   │   │   │   ├── adt-transform.ts
│   │   │   │   ├── oru-transform.ts
│   │   │   │   ├── orm-transform.ts
│   │   │   │   ├── siu-transform.ts
│   │   │   │   └── common.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── phenoml/                     # PhenoML AI integration layer
│   │   ├── src/
│   │   │   ├── client.ts            # PhenoML API client
│   │   │   ├── lang2fhir.ts         # Lang2FHIR service
│   │   │   ├── construe.ts          # Construe medical coding service
│   │   │   ├── agents.ts            # Agent API integration
│   │   │   ├── workflows.ts         # Workflows API integration
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── emr-connectors/              # External EMR FHIR connectors
│       ├── src/
│       │   ├── base-connector.ts     # Abstract connector class
│       │   ├── epic/
│       │   │   ├── epic-connector.ts
│       │   │   ├── epic-auth.ts
│       │   │   └── epic-mappings.ts
│       │   ├── cerner/
│       │   │   ├── cerner-connector.ts
│       │   │   ├── cerner-auth.ts
│       │   │   └── cerner-mappings.ts
│       │   ├── athena/
│       │   │   ├── athena-connector.ts
│       │   │   ├── athena-auth.ts
│       │   │   └── athena-mappings.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── config/
│   ├── fhir/                        # FHIR resource templates & profiles
│   │   ├── access-policies.json     # Medplum access policy definitions
│   │   ├── subscriptions.json       # Subscription definitions
│   │   └── search-params.json       # Custom search parameters
│   └── hl7/
│       └── message-profiles.json    # HL7 v2 message definitions
│
├── scripts/
│   ├── seed-data.ts                 # Load test data into Medplum
│   ├── deploy-bots.ts               # Deploy bots via Medplum CLI
│   └── setup-subscriptions.ts       # Create FHIR subscriptions
│
└── tests/
    ├── unit/
    ├── integration/
    └── fixtures/                    # Sample HL7 messages, FHIR bundles
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1–3)
- [ ] Set up Medplum server (Docker Compose for local dev)
- [ ] Configure TypeScript monorepo with npm workspaces
- [ ] Define core FHIR resource profiles and access policies
- [ ] Implement OAuth 2.0 / SMART on FHIR auth flows
- [ ] Build PhenoML client library (`packages/phenoml`)
- [ ] Seed development data

### Phase 2: HL7 v2 Interface Engine (Weeks 3–5)
- [ ] Build HL7 v2 TCP listener and sender
- [ ] Implement ADT message handler (admit/discharge/transfer)
- [ ] Implement ORU message handler (lab results)
- [ ] Implement SIU message handler (scheduling)
- [ ] Build HL7 v2 ↔ FHIR R4 transformation layer
- [ ] Integration tests with sample HL7 feeds

### Phase 3: EMR Connectors (Weeks 5–8)
- [ ] Build abstract base connector with common FHIR operations
- [ ] Epic connector: auth, patient search, data sync
- [ ] Cerner connector: auth, patient search, data sync
- [ ] athenahealth connector: auth, patient search, data sync
- [ ] Patient matching / MPI logic across systems
- [ ] Conflict resolution for multi-source data
- [ ] Bulk FHIR import/export ($export operations)

### Phase 4: Clinical AI (PhenoML) (Weeks 8–10)
- [ ] Lang2FHIR integration for clinical note processing
- [ ] Construe integration for automated medical coding
- [ ] Agent API for intake automation and clinical decision support
- [ ] Document processing pipeline (fax, PDF → FHIR)
- [ ] Workflow definitions for recurring clinical tasks

### Phase 5: Portal Features & Hardening (Weeks 10–12)
- [ ] Patient-facing FHIR API endpoints (scoped reads)
- [ ] Secure messaging (Communication resources)
- [ ] Appointment scheduling via FHIR Schedule/Slot
- [ ] Consent management workflows
- [ ] Comprehensive audit logging
- [ ] HIPAA security review and penetration testing
- [ ] Load testing and performance optimization

---

## Key Dependencies

```json
{
  "@medplum/core": "latest",
  "@medplum/fhirtypes": "latest",
  "node-hl7-client": "latest",
  "node-hl7-server": "latest"
}
```

PhenoML is accessed via REST API (API key auth at `https://api.pheno.ml`).

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

# Database (managed by Medplum)
DATABASE_URL=postgresql://medplum:medplum@localhost:5432/medplum
```

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
