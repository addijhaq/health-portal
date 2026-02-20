/**
 * FHIR identifier system URIs used across the portal.
 */
export const IDENTIFIER_SYSTEMS = {
  MRN: 'http://health-portal.local/mrn',
  SSN: 'http://hl7.org/fhir/sid/us-ssn',
  NPI: 'http://hl7.org/fhir/sid/us-npi',
  EPIC_FHIR_ID: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.0',
  CERNER_FHIR_ID: 'urn:oid:2.16.840.1.113883.6.1000',
  ATHENA_FHIR_ID: 'urn:oid:2.16.840.1.113883.3.666.5.2',
} as const;

/**
 * Code systems used for clinical coding.
 */
export const CODE_SYSTEMS = {
  ICD10_CM: 'http://hl7.org/fhir/sid/icd-10-cm',
  ICD10_PCS: 'http://hl7.org/fhir/sid/icd-10-pcs',
  CPT: 'http://www.ama-assn.org/go/cpt',
  SNOMED: 'http://snomed.info/sct',
  LOINC: 'http://loinc.org',
  RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  CVX: 'http://hl7.org/fhir/sid/cvx',
} as const;

/**
 * HL7 v2 default configuration.
 */
export const HL7_DEFAULTS = {
  LISTEN_PORT: 2575,
  ENCODING: 'utf-8',
  VERSION: '2.5.1',
  FIELD_SEPARATOR: '|',
  ACK_CODE_ACCEPT: 'AA',
  ACK_CODE_ERROR: 'AE',
  ACK_CODE_REJECT: 'AR',
} as const;

/**
 * Supported HL7 v2 message types and their FHIR mapping targets.
 */
export const HL7_MESSAGE_TYPES = {
  ADT_A01: { type: 'ADT', event: 'A01', description: 'Admit', fhirTarget: 'Encounter' },
  ADT_A02: { type: 'ADT', event: 'A02', description: 'Transfer', fhirTarget: 'Encounter' },
  ADT_A03: { type: 'ADT', event: 'A03', description: 'Discharge', fhirTarget: 'Encounter' },
  ADT_A04: { type: 'ADT', event: 'A04', description: 'Register', fhirTarget: 'Patient' },
  ADT_A08: { type: 'ADT', event: 'A08', description: 'Update', fhirTarget: 'Patient' },
  ORM_O01: { type: 'ORM', event: 'O01', description: 'Order', fhirTarget: 'ServiceRequest' },
  ORU_R01: { type: 'ORU', event: 'R01', description: 'Result', fhirTarget: 'Observation' },
  SIU_S12: { type: 'SIU', event: 'S12', description: 'New Appointment', fhirTarget: 'Appointment' },
  MDM_T02: { type: 'MDM', event: 'T02', description: 'Document', fhirTarget: 'DocumentReference' },
  VXU_V04: { type: 'VXU', event: 'V04', description: 'Immunization', fhirTarget: 'Immunization' },
} as const;

/**
 * PhenoML supported vocabularies for Construe API.
 */
export const PHENOML_VOCABULARIES = [
  'ICD-10-CM',
  'ICD-10-PCS',
  'CPT',
  'SNOMED',
  'LOINC',
  'RxNorm',
  'HPO',
] as const;
