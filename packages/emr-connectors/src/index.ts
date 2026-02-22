export { BaseEmrConnector } from './base-connector';
export { EpicConnector } from './epic/epic-connector';
export { CernerConnector } from './cerner/cerner-connector';
export { AthenaConnector } from './athena/athena-connector';

// Auth modules
export { authenticateEpic } from './epic/epic-auth';
export { authenticateCerner } from './cerner/cerner-auth';
export { authenticateAthena } from './athena/athena-auth';

// Vendor-specific FHIR mappings
export {
  normalizeEpicResource,
  mapEpicIdentifiers,
  discoverIdentifierSystem as discoverEpicIdentifierSystem,
} from './epic/epic-mappings';
export {
  normalizeCernerResource,
  mapCernerIdentifiers,
  discoverIdentifierSystem as discoverCernerIdentifierSystem,
} from './cerner/cerner-mappings';
export {
  normalizeAthenaResource,
  mapAthenaIdentifiers,
  discoverIdentifierSystem as discoverAthenaIdentifierSystem,
} from './athena/athena-mappings';
