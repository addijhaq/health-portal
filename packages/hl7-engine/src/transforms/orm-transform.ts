import type { Patient, ServiceRequest, MedicationRequest } from '@medplum/fhirtypes';
import { Message } from 'node-hl7-client';
import { HL7_2_5_1 } from 'node-hl7-client/hl7';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';

/**
 * Build an ORM^O01 (General Order) message from a FHIR ServiceRequest.
 * Used for outbound lab/imaging orders.
 */
export function buildOrm(serviceRequest: ServiceRequest): string {
  const message = new Message({
    messageHeader: {
      msh_9_1: 'ORM',
      msh_9_2: 'O01',
      msh_11_1: 'P',
    },
    specification: new HL7_2_5_1(),
  });

  message.set('MSH.3', 'HEALTH_PORTAL');
  message.set('MSH.4', 'PORTAL_FAC');

  // ORC - Common Order segment
  message.addSegment('ORC');
  message.set('ORC.1', 'NW'); // New order
  message.set('ORC.2', serviceRequest.id ?? '');
  message.set('ORC.5', mapStatus(serviceRequest.status));
  if (serviceRequest.authoredOn) {
    message.set('ORC.9', formatDate(serviceRequest.authoredOn));
  }
  if (serviceRequest.requester?.display) {
    message.set('ORC.12', serviceRequest.requester.display);
  }

  // OBR - Observation Request segment
  message.addSegment('OBR');
  message.set('OBR.1', '1');
  message.set('OBR.2', serviceRequest.id ?? '');

  const code = serviceRequest.code?.coding?.[0];
  if (code) {
    message.set('OBR.4.1', code.code ?? '');
    message.set('OBR.4.2', code.display ?? '');
    message.set('OBR.4.3', code.system ?? '');
  }

  if (serviceRequest.priority) {
    message.set('OBR.5', mapPriority(serviceRequest.priority));
  }

  if (serviceRequest.occurrenceDateTime) {
    message.set('OBR.6', formatDate(serviceRequest.occurrenceDateTime));
  }

  if (serviceRequest.reasonCode?.[0]?.coding?.[0]) {
    const reason = serviceRequest.reasonCode[0].coding[0];
    message.set('OBR.31.1', reason.code ?? '');
    message.set('OBR.31.2', reason.display ?? '');
    message.set('OBR.31.3', reason.system ?? '');
  }

  return message.toString();
}

/**
 * Build an ADT^A04 (Patient Registration) message from a FHIR Patient.
 * Used for outbound patient registration to external systems.
 */
export function buildAdtA04(patient: Patient): string {
  const message = new Message({
    messageHeader: {
      msh_9_1: 'ADT',
      msh_9_2: 'A04',
      msh_11_1: 'P',
    },
    specification: new HL7_2_5_1(),
  });

  message.set('MSH.3', 'HEALTH_PORTAL');
  message.set('MSH.4', 'PORTAL_FAC');

  // EVN - Event Type
  message.addSegment('EVN');
  message.set('EVN.1', 'A04');
  message.set('EVN.2', formatDate(new Date().toISOString()));

  // PID - Patient Identification
  message.addSegment('PID');
  message.set('PID.1', '1');

  // PID.3 - MRN
  const mrn = patient.identifier?.find((id) => id.system === IDENTIFIER_SYSTEMS.MRN);
  if (mrn?.value) {
    message.set('PID.3.1', mrn.value);
    message.set('PID.3.4', IDENTIFIER_SYSTEMS.MRN);
  }

  // PID.4 - SSN
  const ssn = patient.identifier?.find((id) => id.system === IDENTIFIER_SYSTEMS.SSN);
  if (ssn?.value) {
    message.set('PID.4', ssn.value);
  }

  // PID.5 - Patient Name
  const name = patient.name?.[0];
  if (name) {
    message.set('PID.5.1', name.family ?? '');
    message.set('PID.5.2', name.given?.join(' ') ?? '');
  }

  // PID.7 - Date of Birth
  if (patient.birthDate) {
    message.set('PID.7', patient.birthDate.replace(/-/g, ''));
  }

  // PID.8 - Gender
  if (patient.gender) {
    message.set('PID.8', mapGenderToHl7(patient.gender));
  }

  // PID.11 - Address
  const address = patient.address?.[0];
  if (address) {
    message.set('PID.11.1', address.line?.[0] ?? '');
    message.set('PID.11.3', address.city ?? '');
    message.set('PID.11.4', address.state ?? '');
    message.set('PID.11.5', address.postalCode ?? '');
    message.set('PID.11.6', address.country ?? '');
  }

  // PID.13 - Phone
  const phone = patient.telecom?.find((t) => t.system === 'phone');
  if (phone?.value) {
    message.set('PID.13', phone.value);
  }

  // PV1 - Patient Visit (minimal required segment)
  message.addSegment('PV1');
  message.set('PV1.1', '1');
  message.set('PV1.2', 'R'); // Registration visit type

  return message.toString();
}

/**
 * Build an RDE^O11 (Pharmacy/Treatment Encoded Order) message
 * from a FHIR MedicationRequest.
 */
export function buildRde(medicationRequest: MedicationRequest): string {
  const message = new Message({
    messageHeader: {
      msh_9_1: 'RDE',
      msh_9_2: 'O11',
      msh_11_1: 'P',
    },
    specification: new HL7_2_5_1(),
  });

  message.set('MSH.3', 'HEALTH_PORTAL');
  message.set('MSH.4', 'PORTAL_FAC');

  // ORC - Common Order
  message.addSegment('ORC');
  message.set('ORC.1', 'NW');
  message.set('ORC.2', medicationRequest.id ?? '');

  // RXE - Pharmacy/Treatment Encoded Order
  message.addSegment('RXE');

  // RXE.1 - Quantity/Timing
  const timing = medicationRequest.dosageInstruction?.[0]?.timing;
  if (timing?.repeat?.frequency && timing?.repeat?.period && timing?.repeat?.periodUnit) {
    message.set(
      'RXE.1',
      `${timing.repeat.frequency}^${timing.repeat.period}${timing.repeat.periodUnit}`
    );
  }

  // RXE.2 - Give Code (medication)
  const medCode = medicationRequest.medicationCodeableConcept?.coding?.[0];
  if (medCode) {
    message.set('RXE.2.1', medCode.code ?? '');
    message.set('RXE.2.2', medCode.display ?? '');
    message.set('RXE.2.3', medCode.system ?? '');
  }

  // RXE.3 - Give Amount Minimum
  const doseQuantity = medicationRequest.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity;
  if (doseQuantity?.value !== undefined) {
    message.set('RXE.3', String(doseQuantity.value));
  }

  // RXE.5 - Give Units
  if (doseQuantity?.unit) {
    message.set('RXE.5', doseQuantity.unit);
  }

  // RXE.7 - Give Rate Amount (for infusions)
  const rateQuantity = medicationRequest.dosageInstruction?.[0]?.doseAndRate?.[0]?.rateQuantity;
  if (rateQuantity?.value !== undefined) {
    message.set('RXE.7.1', String(rateQuantity.value));
    if (rateQuantity.unit) {
      message.set('RXE.7.2', rateQuantity.unit);
    }
  }

  // RXE.15 - Prescription Number
  if (medicationRequest.id) {
    message.set('RXE.15', medicationRequest.id);
  }

  // RXR - Pharmacy/Treatment Route
  const route = medicationRequest.dosageInstruction?.[0]?.route?.coding?.[0];
  if (route) {
    message.addSegment('RXR');
    message.set('RXR.1.1', route.code ?? '');
    message.set('RXR.1.2', route.display ?? '');
    message.set('RXR.1.3', route.system ?? '');
  }

  return message.toString();
}

// --- Helper functions ---

function mapStatus(fhirStatus?: string): string {
  switch (fhirStatus) {
    case 'active': return 'IP'; // In Progress
    case 'completed': return 'CM'; // Completed
    case 'revoked': return 'CA'; // Cancelled
    case 'on-hold': return 'HD'; // Hold
    case 'draft': return 'SC'; // Scheduled
    default: return 'NW'; // New
  }
}

function mapPriority(fhirPriority: string): string {
  switch (fhirPriority) {
    case 'stat': return 'S';
    case 'asap': return 'A';
    case 'urgent': return 'S';
    case 'routine': return 'R';
    default: return 'R';
  }
}

function mapGenderToHl7(fhirGender: string): string {
  switch (fhirGender) {
    case 'male': return 'M';
    case 'female': return 'F';
    case 'other': return 'O';
    default: return 'U';
  }
}

function formatDate(isoDate: string): string {
  return isoDate.replace(/[-T:Z.]/g, '').slice(0, 14);
}
