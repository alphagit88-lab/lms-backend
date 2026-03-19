/**
 * SMSService — stub implementation.
 * In production, replace the sendSMS body with a real provider
 * (e.g. Dialog, Mobitel, Twilio, Africa's Talking) using env vars.
 */
export class SMSService {
  static async sendSMS(to: string, message: string): Promise<void> {
    // TODO: Replace with real SMS provider in production
    console.log(`[SMSService] TO:${to} | MSG: ${message}`);
  }

  static async sendSessionReminder(to: string, recipientName: string, minutesBefore: number, sessionTime: string): Promise<void> {
    await SMSService.sendSMS(
      to,
      `LMS: Hi ${recipientName}, your session starts in ${minutesBefore} minutes at ${sessionTime}. Please be ready!`
    );
  }

  static async sendBookingConfirmation(to: string, recipientName: string, teacherName: string, sessionDate: string): Promise<void> {
    await SMSService.sendSMS(
      to,
      `LMS: Hi ${recipientName}, your session with ${teacherName} on ${sessionDate} is confirmed!`
    );
  }

  static async sendBookingCancellation(to: string, recipientName: string, sessionDate: string): Promise<void> {
    await SMSService.sendSMS(
      to,
      `LMS: Hi ${recipientName}, your session on ${sessionDate} has been cancelled. Contact support for help.`
    );
  }

  static async sendGradePublished(to: string, recipientName: string, examTitle: string, marks: number, total: number): Promise<void> {
    await SMSService.sendSMS(
      to,
      `LMS: Hi ${recipientName}, your results for "${examTitle}" are out! Score: ${marks}/${total}. Check the app for details.`
    );
  }

  static async sendProgressReportUpdate(to: string, parentName: string, studentName: string): Promise<void> {
    await SMSService.sendSMS(
      to,
      `LMS: Hi ${parentName}, a new progress report for ${studentName} has been shared with you. View it in your dashboard.`
    );
  }
}
