import { MedplumClient } from '@medplum/core';
import type {
  Organization,
  Practitioner,
  Patient,
  Observation,
  Condition,
  MedicationRequest,
  Appointment,
  DocumentReference,
} from '@medplum/fhirtypes';
import { IDENTIFIER_SYSTEMS, CODE_SYSTEMS } from '@health-portal/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the next N business days (Mon-Fri) starting from tomorrow.
 */
function getNextBusinessDays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(9, 0, 0, 0);

  while (days.length < count) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || 'http://localhost:8103',
  });

  console.log('Authenticating with Medplum...');
  await medplum.startClientLogin(
    process.env.MEDPLUM_CLIENT_ID!,
    process.env.MEDPLUM_CLIENT_SECRET!,
  );
  console.log('Authentication successful.\n');

  // -----------------------------------------------------------------------
  // 1. Organization
  // -----------------------------------------------------------------------

  console.log('Creating organization...');

  const org = await medplum.createResource<Organization>({
    resourceType: 'Organization',
    name: 'Healthy Valley Medical Group',
    identifier: [{ system: IDENTIFIER_SYSTEMS.NPI, value: '1234567890' }],
    type: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/organization-type',
            code: 'prov',
            display: 'Healthcare Provider',
          },
        ],
      },
    ],
    address: [
      {
        line: ['100 Medical Center Dr'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    ],
    telecom: [{ system: 'phone', value: '555-100-0000' }],
  });

  console.log(`  Created Organization: ${org.name} (ID: ${org.id})`);

  // -----------------------------------------------------------------------
  // 2. Practitioners
  // -----------------------------------------------------------------------

  console.log('\nCreating practitioners...');

  const practitionerDefs: {
    prefix: string;
    given: string;
    family: string;
    npi: string;
    qualCode: string;
    qualDisplay: string;
  }[] = [
    {
      prefix: 'Dr.',
      given: 'Sarah',
      family: 'Chen',
      npi: '1111111111',
      qualCode: 'MD',
      qualDisplay: 'MD - Internal Medicine',
    },
    {
      prefix: 'Dr.',
      given: 'James',
      family: 'Wilson',
      npi: '2222222222',
      qualCode: 'MD',
      qualDisplay: 'MD - Cardiology',
    },
    {
      prefix: '',
      given: 'Maria',
      family: 'Garcia',
      npi: '3333333333',
      qualCode: 'NP',
      qualDisplay: 'NP - Family Practice',
    },
  ];

  const practitioners: Practitioner[] = [];

  for (const def of practitionerDefs) {
    const name: { family: string; given: string[]; prefix?: string[] } = {
      family: def.family,
      given: [def.given],
    };
    if (def.prefix) {
      name.prefix = [def.prefix];
    }

    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      identifier: [{ system: IDENTIFIER_SYSTEMS.NPI, value: def.npi }],
      name: [name],
      qualification: [
        {
          code: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
                code: def.qualCode,
                display: def.qualDisplay,
              },
            ],
          },
        },
      ],
    });

    practitioners.push(practitioner);
    console.log(`  Created Practitioner: ${def.given} ${def.family} (ID: ${practitioner.id})`);
  }

  console.log(`Created ${practitioners.length} practitioners.`);

  // -----------------------------------------------------------------------
  // 3. Patients
  // -----------------------------------------------------------------------

  console.log('\nCreating patients...');

  const patientDefs: {
    first: string;
    last: string;
    dob: string;
    gender: 'male' | 'female';
    city: string;
    state: string;
    mrn: string;
  }[] = [
    { first: 'Michael', last: 'Johnson', dob: '1985-03-22', gender: 'male', city: 'Springfield', state: 'IL', mrn: 'MRN-10001' },
    { first: 'Emily', last: 'Davis', dob: '1992-07-14', gender: 'female', city: 'Chicago', state: 'IL', mrn: 'MRN-10002' },
    { first: 'Robert', last: 'Martinez', dob: '1978-11-30', gender: 'male', city: 'Austin', state: 'TX', mrn: 'MRN-10003' },
    { first: 'Aisha', last: 'Patel', dob: '1990-05-18', gender: 'female', city: 'New York', state: 'NY', mrn: 'MRN-10004' },
    { first: 'David', last: 'Kim', dob: '1965-09-03', gender: 'male', city: 'San Francisco', state: 'CA', mrn: 'MRN-10005' },
    { first: 'Jennifer', last: "O'Brien", dob: '1988-01-25', gender: 'female', city: 'Boston', state: 'MA', mrn: 'MRN-10006' },
    { first: 'Carlos', last: 'Rivera', dob: '1975-12-08', gender: 'male', city: 'Miami', state: 'FL', mrn: 'MRN-10007' },
    { first: 'Wei', last: 'Zhang', dob: '1995-04-11', gender: 'female', city: 'Seattle', state: 'WA', mrn: 'MRN-10008' },
    { first: 'Thomas', last: 'Anderson', dob: '1958-08-19', gender: 'male', city: 'Denver', state: 'CO', mrn: 'MRN-10009' },
    { first: 'Fatima', last: 'Hassan', dob: '1983-06-27', gender: 'female', city: 'Minneapolis', state: 'MN', mrn: 'MRN-10010' },
  ];

  const patients: Patient[] = [];

  for (const def of patientDefs) {
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [{ system: IDENTIFIER_SYSTEMS.MRN, value: def.mrn }],
      name: [{ family: def.last, given: [def.first] }],
      gender: def.gender,
      birthDate: def.dob,
      address: [{ city: def.city, state: def.state, country: 'US' }],
      managingOrganization: { reference: `Organization/${org.id}` },
    });

    patients.push(patient);
    console.log(`  Created Patient: ${def.first} ${def.last} (ID: ${patient.id})`);
  }

  console.log(`Created ${patients.length} patients.`);

  // -----------------------------------------------------------------------
  // 4. Observations — 10 vitals + 10 labs
  // -----------------------------------------------------------------------

  console.log('\nCreating observations...');

  const now = new Date().toISOString();

  const vitalDefs: {
    loinc: string;
    display: string;
    value: number;
    unit: string;
    patientIdx: number;
  }[] = [
    { loinc: '8480-6', display: 'Systolic blood pressure', value: 128, unit: 'mmHg', patientIdx: 0 },
    { loinc: '8462-4', display: 'Diastolic blood pressure', value: 82, unit: 'mmHg', patientIdx: 0 },
    { loinc: '8867-4', display: 'Heart rate', value: 72, unit: '/min', patientIdx: 1 },
    { loinc: '8310-5', display: 'Body temperature', value: 37.0, unit: 'Cel', patientIdx: 2 },
    { loinc: '9279-1', display: 'Respiratory rate', value: 16, unit: '/min', patientIdx: 3 },
    { loinc: '29463-7', display: 'Body weight', value: 78.5, unit: 'kg', patientIdx: 4 },
    { loinc: '8302-2', display: 'Body height', value: 175, unit: 'cm', patientIdx: 5 },
    { loinc: '2708-6', display: 'Oxygen saturation', value: 98, unit: '%', patientIdx: 6 },
    { loinc: '39156-5', display: 'Body mass index', value: 25.6, unit: 'kg/m2', patientIdx: 7 },
    { loinc: '8480-6', display: 'Systolic blood pressure', value: 142, unit: 'mmHg', patientIdx: 8 },
  ];

  const labDefs: {
    loinc: string;
    display: string;
    value: number;
    unit: string;
    patientIdx: number;
  }[] = [
    { loinc: '4548-4', display: 'Hemoglobin A1c', value: 7.2, unit: '%', patientIdx: 0 },
    { loinc: '718-7', display: 'Hemoglobin', value: 14.5, unit: 'g/dL', patientIdx: 1 },
    { loinc: '2345-7', display: 'Glucose', value: 105, unit: 'mg/dL', patientIdx: 2 },
    { loinc: '2160-0', display: 'Creatinine', value: 1.1, unit: 'mg/dL', patientIdx: 3 },
    { loinc: '6690-2', display: 'WBC count', value: 7.5, unit: '10*3/uL', patientIdx: 4 },
    { loinc: '787-2', display: 'MCV', value: 88, unit: 'fL', patientIdx: 5 },
    { loinc: '2093-3', display: 'Total cholesterol', value: 210, unit: 'mg/dL', patientIdx: 6 },
    { loinc: '13457-7', display: 'LDL cholesterol', value: 130, unit: 'mg/dL', patientIdx: 7 },
    { loinc: '2085-9', display: 'HDL cholesterol', value: 55, unit: 'mg/dL', patientIdx: 8 },
    { loinc: '2571-8', display: 'Triglycerides', value: 150, unit: 'mg/dL', patientIdx: 9 },
  ];

  let obsCount = 0;

  for (const def of vitalDefs) {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: CODE_SYSTEMS.LOINC, code: def.loinc, display: def.display }],
      },
      valueQuantity: {
        value: def.value,
        unit: def.unit,
        system: 'http://unitsofmeasure.org',
        code: def.unit,
      },
      subject: { reference: `Patient/${patients[def.patientIdx].id}` },
      effectiveDateTime: now,
    });
    obsCount++;
  }

  for (const def of labDefs) {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: CODE_SYSTEMS.LOINC, code: def.loinc, display: def.display }],
      },
      valueQuantity: {
        value: def.value,
        unit: def.unit,
        system: 'http://unitsofmeasure.org',
        code: def.unit,
      },
      subject: { reference: `Patient/${patients[def.patientIdx].id}` },
      effectiveDateTime: now,
    });
    obsCount++;
  }

  console.log(`Created ${obsCount} observations.`);

  // -----------------------------------------------------------------------
  // 5. Conditions — ICD-10-CM + SNOMED dual-coded
  // -----------------------------------------------------------------------

  console.log('\nCreating conditions...');

  const conditionDefs: {
    icd10: string;
    icd10Display: string;
    snomed: string;
    snomedDisplay: string;
    patientIdx: number;
    onsetDate: string;
  }[] = [
    {
      icd10: 'E11.9',
      icd10Display: 'Type 2 diabetes mellitus without complications',
      snomed: '44054006',
      snomedDisplay: 'Type 2 diabetes mellitus',
      patientIdx: 0,
      onsetDate: '2020-06-15',
    },
    {
      icd10: 'I10',
      icd10Display: 'Essential (primary) hypertension',
      snomed: '38341003',
      snomedDisplay: 'Hypertensive disorder',
      patientIdx: 0,
      onsetDate: '2019-03-10',
    },
    {
      icd10: 'M54.5',
      icd10Display: 'Low back pain',
      snomed: '279039007',
      snomedDisplay: 'Low back pain',
      patientIdx: 2,
      onsetDate: '2023-01-20',
    },
    {
      icd10: 'J45.20',
      icd10Display: 'Mild intermittent asthma, uncomplicated',
      snomed: '195967001',
      snomedDisplay: 'Asthma',
      patientIdx: 3,
      onsetDate: '2015-08-05',
    },
    {
      icd10: 'F32.1',
      icd10Display: 'Major depressive disorder, single episode, moderate',
      snomed: '35489007',
      snomedDisplay: 'Depressive disorder',
      patientIdx: 5,
      onsetDate: '2024-02-12',
    },
  ];

  for (const def of conditionDefs) {
    await medplum.createResource<Condition>({
      resourceType: 'Condition',
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: 'active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'confirmed',
          },
        ],
      },
      code: {
        coding: [
          { system: CODE_SYSTEMS.ICD10_CM, code: def.icd10, display: def.icd10Display },
          { system: CODE_SYSTEMS.SNOMED, code: def.snomed, display: def.snomedDisplay },
        ],
      },
      subject: { reference: `Patient/${patients[def.patientIdx].id}` },
      onsetDateTime: def.onsetDate,
    });
  }

  console.log(`Created ${conditionDefs.length} conditions.`);

  // -----------------------------------------------------------------------
  // 6. MedicationRequests — RxNorm coded
  // -----------------------------------------------------------------------

  console.log('\nCreating medication requests...');

  const medRequestDefs: {
    rxnorm: string;
    display: string;
    patientIdx: number;
    practitionerIdx: number;
    dosageText: string;
  }[] = [
    {
      rxnorm: '860975',
      display: 'Metformin 500 MG Oral Tablet',
      patientIdx: 0,
      practitionerIdx: 0,
      dosageText: 'Take 1 tablet by mouth twice daily with meals',
    },
    {
      rxnorm: '197361',
      display: 'Amlodipine 5 MG Oral Tablet',
      patientIdx: 0,
      practitionerIdx: 0,
      dosageText: 'Take 1 tablet by mouth once daily',
    },
    {
      rxnorm: '197591',
      display: 'Diclofenac Sodium 50 MG Oral Tablet',
      patientIdx: 2,
      practitionerIdx: 2,
      dosageText: 'Take 1 tablet by mouth twice daily as needed for pain',
    },
    {
      rxnorm: '895994',
      display: 'Fluticasone Propionate 0.05 MG/ACTUAT Metered Dose Inhaler',
      patientIdx: 3,
      practitionerIdx: 2,
      dosageText: '2 puffs inhaled twice daily',
    },
    {
      rxnorm: '312938',
      display: 'Sertraline 50 MG Oral Tablet',
      patientIdx: 5,
      practitionerIdx: 1,
      dosageText: 'Take 1 tablet by mouth once daily in the morning',
    },
  ];

  for (const def of medRequestDefs) {
    await medplum.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        coding: [{ system: CODE_SYSTEMS.RXNORM, code: def.rxnorm, display: def.display }],
      },
      subject: { reference: `Patient/${patients[def.patientIdx].id}` },
      requester: { reference: `Practitioner/${practitioners[def.practitionerIdx].id}` },
      dosageInstruction: [{ text: def.dosageText }],
    });
  }

  console.log(`Created ${medRequestDefs.length} medication requests.`);

  // -----------------------------------------------------------------------
  // 7. Appointments — future-dated, 30-min, across next 5 business days
  // -----------------------------------------------------------------------

  console.log('\nCreating appointments...');

  const businessDays = getNextBusinessDays(5);

  const appointmentDefs: {
    patientIdx: number;
    practitionerIdx: number;
    dayIdx: number;
  }[] = [
    { patientIdx: 0, practitionerIdx: 0, dayIdx: 0 },
    { patientIdx: 1, practitionerIdx: 1, dayIdx: 1 },
    { patientIdx: 2, practitionerIdx: 2, dayIdx: 2 },
    { patientIdx: 3, practitionerIdx: 0, dayIdx: 3 },
    { patientIdx: 4, practitionerIdx: 1, dayIdx: 4 },
  ];

  for (const def of appointmentDefs) {
    const start = businessDays[def.dayIdx];
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    await medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      appointmentType: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
            code: 'FOLLOWUP',
            display: 'Follow-up',
          },
        ],
      },
      start: start.toISOString(),
      end: end.toISOString(),
      participant: [
        {
          actor: { reference: `Patient/${patients[def.patientIdx].id}` },
          status: 'accepted',
        },
        {
          actor: { reference: `Practitioner/${practitioners[def.practitionerIdx].id}` },
          status: 'accepted',
        },
      ],
    });
  }

  console.log(`Created ${appointmentDefs.length} appointments.`);

  // -----------------------------------------------------------------------
  // 8. DocumentReferences — LOINC-typed with base64 content
  // -----------------------------------------------------------------------

  console.log('\nCreating document references...');

  const docRefDefs: {
    loinc: string;
    display: string;
    patientIdx: number;
    sampleText: string;
  }[] = [
    {
      loinc: '34117-2',
      display: 'History and physical note',
      patientIdx: 0,
      sampleText: 'Sample History and Physical note for patient Michael Johnson.',
    },
    {
      loinc: '11502-2',
      display: 'Laboratory report',
      patientIdx: 1,
      sampleText: 'Sample Laboratory report for patient Emily Davis.',
    },
    {
      loinc: '57133-1',
      display: 'Referral note',
      patientIdx: 2,
      sampleText: 'Sample Cardiology referral note for patient Robert Martinez.',
    },
  ];

  for (const def of docRefDefs) {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: {
        coding: [{ system: CODE_SYSTEMS.LOINC, code: def.loinc, display: def.display }],
      },
      subject: { reference: `Patient/${patients[def.patientIdx].id}` },
      date: now,
      content: [
        {
          attachment: {
            contentType: 'text/plain',
            data: Buffer.from(def.sampleText).toString('base64'),
          },
        },
      ],
    });
  }

  console.log(`Created ${docRefDefs.length} document references.`);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  console.log('\n--- Seed Data Summary ---');
  console.log(`  Organization:        1`);
  console.log(`  Practitioners:       ${practitioners.length}`);
  console.log(`  Patients:            ${patients.length}`);
  console.log(`  Observations:        ${obsCount}`);
  console.log(`  Conditions:          ${conditionDefs.length}`);
  console.log(`  MedicationRequests:  ${medRequestDefs.length}`);
  console.log(`  Appointments:        ${appointmentDefs.length}`);
  console.log(`  DocumentReferences:  ${docRefDefs.length}`);
  console.log('Seed data creation complete.');
}

main().catch(console.error);
