import { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Appointment,
  Communication,
  Observation,
  Patient,
  Resource,
} from '@medplum/fhirtypes';

/**
 * Notification delivery interface.
 * Implementations should integrate with AWS SES (email), AWS SNS / Twilio (SMS).
 */
export interface NotificationService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendSms(to: string, message: string): Promise<void>;
}

/**
 * Stub notification service -- logs instead of sending.
 * Replace with real AWS SES/SNS/Twilio integration in production.
 */
class StubNotificationService implements NotificationService {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    console.log(`[STUB EMAIL] To: ${to} | Subject: ${subject} | Body: ${body}`);
  }
  async sendSms(to: string, message: string): Promise<void> {
    console.log(`[STUB SMS] To: ${to} | Message: ${message}`);
  }
}

const notificationService: NotificationService = new StubNotificationService();

/**
 * Medplum Bot: Notification Sender
 *
 * Triggered by:
 * - New Communication resource (secure message)
 * - Appointment changes (confirmation, cancellation)
 * - Critical lab results (via Communication with category=alert)
 * - Daily cron (appointment reminders)
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const input = event.input;

  if (!input || typeof input === 'string') {
    // Cron trigger -- run appointment reminders
    await handleAppointmentReminder(medplum);
    return;
  }

  const resource = input as Resource;
  if (!resource.resourceType) {
    await handleAppointmentReminder(medplum);
    return;
  }

  if (resource.resourceType === 'Communication') {
    await handleCommunicationNotification(medplum, resource as Communication);
  } else if (resource.resourceType === 'Appointment') {
    await handleAppointmentChange(medplum, resource as Appointment);
  } else if (resource.resourceType === 'Observation') {
    await handleCriticalLabResult(medplum, resource as Observation);
  }
}

/**
 * Send email/SMS notification when a new secure message is received.
 */
async function handleCommunicationNotification(
  medplum: MedplumClient,
  communication: Communication
): Promise<void> {
  const recipients = communication.recipient ?? [];
  for (const recipientRef of recipients) {
    const ref = recipientRef.reference;
    if (!ref) continue;

    const prefs = await getNotificationPreferences(medplum, ref);
    const messagePreview = communication.payload?.[0]?.contentString?.slice(0, 100) ?? 'New message';

    if (prefs.email) {
      await notificationService.sendEmail(
        prefs.email,
        'New Secure Message',
        `You have a new secure message: ${messagePreview}...`
      );
    }
    if (prefs.sms) {
      await notificationService.sendSms(
        prefs.sms,
        `Health Portal: You have a new secure message. Log in to view.`
      );
    }
  }
}

/**
 * Daily cron: find appointments in next 24-48 hours and send reminders.
 */
async function handleAppointmentReminder(medplum: MedplumClient): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const appointments = await medplum.searchResources('Appointment', {
    date: `ge${in24h.toISOString()}`,
    status: 'booked',
    _count: '100',
  });

  // Filter to appointments within 48h window
  const upcoming = appointments.filter((appt) => {
    if (!appt.start) return false;
    const start = new Date(appt.start);
    return start <= in48h;
  });

  console.log(`Found ${upcoming.length} upcoming appointments for reminders`);

  for (const appt of upcoming) {
    const patientRef = appt.participant?.find(
      (p) => p.actor?.reference?.startsWith('Patient/')
    )?.actor?.reference;

    if (!patientRef) continue;

    const prefs = await getNotificationPreferences(medplum, patientRef);
    const startTime = appt.start ? new Date(appt.start).toLocaleString() : 'scheduled time';

    if (prefs.sms) {
      await notificationService.sendSms(
        prefs.sms,
        `Health Portal: Reminder - You have an appointment on ${startTime}. Reply HELP for assistance.`
      );
    }
    if (prefs.email) {
      await notificationService.sendEmail(
        prefs.email,
        'Appointment Reminder',
        `Reminder: You have an upcoming appointment on ${startTime}.`
      );
    }
  }
}

/**
 * Send notification when an appointment is confirmed or cancelled.
 */
async function handleAppointmentChange(
  medplum: MedplumClient,
  appointment: Appointment
): Promise<void> {
  const patientRef = appointment.participant?.find(
    (p) => p.actor?.reference?.startsWith('Patient/')
  )?.actor?.reference;

  if (!patientRef) return;

  const prefs = await getNotificationPreferences(medplum, patientRef);
  const startTime = appointment.start ? new Date(appointment.start).toLocaleString() : 'TBD';
  const status = appointment.status;

  const message =
    status === 'cancelled'
      ? `Your appointment on ${startTime} has been cancelled.`
      : `Your appointment on ${startTime} has been confirmed.`;

  if (prefs.sms) {
    await notificationService.sendSms(prefs.sms, `Health Portal: ${message}`);
  }
  if (prefs.email) {
    await notificationService.sendEmail(prefs.email, `Appointment ${status}`, message);
  }
}

/**
 * Send SMS to provider for critical lab results.
 */
async function handleCriticalLabResult(
  medplum: MedplumClient,
  observation: Observation
): Promise<void> {
  const practitionerRef = observation.performer?.find(
    (p) => p.reference?.startsWith('Practitioner/')
  )?.reference;

  if (!practitionerRef) return;

  const prefs = await getNotificationPreferences(medplum, practitionerRef);
  const codeSummary =
    observation.code?.coding?.[0]?.display ?? observation.code?.text ?? 'Lab result';

  if (prefs.sms) {
    await notificationService.sendSms(
      prefs.sms,
      `CRITICAL: ${codeSummary} for ${observation.subject?.reference ?? 'patient'}. Review immediately.`
    );
  }
}

interface NotificationPreferences {
  email?: string;
  sms?: string;
}

/**
 * Read notification preferences from a Patient or Practitioner resource.
 * Uses telecom fields for contact info.
 */
async function getNotificationPreferences(
  medplum: MedplumClient,
  resourceRef: string
): Promise<NotificationPreferences> {
  try {
    const [resourceType, id] = resourceRef.split('/');
    const resource = await medplum.readResource(resourceType as 'Patient' | 'Practitioner', id);
    const telecom = (resource as Patient).telecom ?? [];

    return {
      email: telecom.find((t) => t.system === 'email')?.value,
      sms: telecom.find((t) => t.system === 'sms' || t.system === 'phone')?.value,
    };
  } catch {
    return {};
  }
}
