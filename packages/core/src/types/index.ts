import type { Patient, Practitioner, Organization } from '@medplum/fhirtypes';

/**
 * Supported external EMR systems for interoperability.
 */
export type EmrVendor = 'epic' | 'cerner' | 'athena';

/**
 * Configuration for connecting to an external EMR's FHIR API.
 */
export interface EmrConnectionConfig {
  vendor: EmrVendor;
  fhirBaseUrl: string;
  clientId: string;
  clientSecret?: string;
  privateKeyPath?: string;
  scopes: string[];
  tokenUrl: string;
}

/**
 * Result of a sync operation with an external EMR.
 */
export interface SyncResult {
  vendor: EmrVendor;
  direction: 'import' | 'export';
  resourceType: string;
  created: number;
  updated: number;
  errors: SyncError[];
  timestamp: string;
}

export interface SyncError {
  resourceType: string;
  resourceId?: string;
  message: string;
  code: string;
}

/**
 * HL7 v2 message metadata extracted during parsing.
 */
export interface Hl7MessageMeta {
  messageType: string;
  triggerEvent: string;
  messageControlId: string;
  sendingFacility: string;
  receivingFacility: string;
  timestamp: string;
}

/**
 * PhenoML API configuration.
 */
export interface PhenoMlConfig {
  apiKey: string;
  baseUrl: string;
  fhirServerType: 'medplum' | 'epic' | 'cerner' | 'athena';
  fhirServerUrl?: string;
}

/**
 * Patient matching criteria for MPI (Master Patient Index) operations.
 */
export interface PatientMatchCriteria {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  ssn?: string;
  mrn?: string;
  mrnSystem?: string;
}

/**
 * Entry in the vendor-to-Medplum identifier mapping table.
 * Used by the sync engine to rewrite FHIR references between systems.
 *
 * Key format: `${vendor}:${vendorResourceType}:${vendorId}`
 */
export interface IdMappingEntry {
  vendor: EmrVendor;
  vendorResourceType: string;
  vendorId: string;
  medplumId: string;
  vendorIdentifierSystem: string;
  vendorIdentifierValue?: string;
}

export type { Patient, Practitioner, Organization };
