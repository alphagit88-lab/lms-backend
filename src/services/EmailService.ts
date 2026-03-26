import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
  port: parseInt(process.env.SMTP_PORT || "2525"),
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM = process.env.SMTP_FROM || "noreply@lms.lk";

const baseLayout = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>LMS Notification</title>
  <style>
    body { margin:0; padding:0; background:#f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width:600px; margin:40px auto; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,.08); }
    .header { background:linear-gradient(135deg,#1e40af,#3b82f6); padding:32px 40px; text-align:center; }
    .header h1 { color:#fff; font-size:22px; margin:0; font-weight:700; letter-spacing:-0.5px; }
    .header p { color:#bfdbfe; font-size:12px; margin:6px 0 0; }
    .body { background:#ffffff; padding:36px 40px; }
    .footer { background:#f8fafc; border-top:1px solid #e2e8f0; padding:20px 40px; text-align:center; font-size:11px; color:#94a3b8; }
    .btn { display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:13px 28px; border-radius:10px; font-size:14px; font-weight:600; margin-top:24px; }
    .tag { display:inline-block; border-radius:6px; padding:3px 10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
    .tag-success { background:#dcfce7; color:#166534; }
    .tag-warning { background:#fef9c3; color:#854d0e; }
    .tag-danger  { background:#fee2e2; color:#991b1b; }
    .tag-info    { background:#dbeafe; color:#1e40af; }
    table.detail { width:100%; border-collapse:collapse; margin:20px 0; }
    table.detail td { padding:10px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; }
    table.detail td:first-child { color:#64748b; width:40%; }
    table.detail td:last-child { font-weight:600; color:#1e293b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>LMS<span style="color:#93c5fd">.</span></h1>
      <p>Global Education Platform</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} LMS. You're receiving this because you have an account with us.<br/>
      <a href="#" style="color:#3b82f6;text-decoration:none">Manage Preferences</a>
    </div>
  </div>
</body>
</html>`;

export class EmailService {
  static async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await transporter.sendMail({ from: FROM, to, subject, html });
    } catch (err) {
      console.error("[EmailService] Failed to send email:", err);
    }
  }

  static async sendBookingConfirmation(opts: {
    to: string;
    studentName: string;
    teacherName: string;
    sessionDate: string;
    sessionTime: string;
    meetingLink?: string;
    bookingId: string;
  }): Promise<void> {
    const html = baseLayout(`
      <span class="tag tag-success">Booking Confirmed</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">Your session is booked!</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.studentName}, your tutoring session has been confirmed.</p>
      <table class="detail">
        <tr><td>Teacher</td><td>${opts.teacherName}</td></tr>
        <tr><td>Date</td><td>${opts.sessionDate}</td></tr>
        <tr><td>Time</td><td>${opts.sessionTime}</td></tr>
        <tr><td>Booking ID</td><td style="font-family:monospace;font-size:12px">${opts.bookingId}</td></tr>
      </table>
      ${opts.meetingLink ? `<a href="${opts.meetingLink}" class="btn">Join Session</a>` : ""}
    `);
    await EmailService.sendEmail(opts.to, "✅ Booking Confirmed — LMS", html);
  }

  static async sendBookingCancellation(opts: {
    to: string;
    recipientName: string;
    teacherName: string;
    studentName: string;
    sessionDate: string;
    sessionTime: string;
    reason?: string;
    refundPercentage?: number;
  }): Promise<void> {
    const html = baseLayout(`
      <span class="tag tag-danger">Booking Cancelled</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">Session Cancelled</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.recipientName}, a session has been cancelled.</p>
      <table class="detail">
        <tr><td>Teacher</td><td>${opts.teacherName}</td></tr>
        <tr><td>Student</td><td>${opts.studentName}</td></tr>
        <tr><td>Date</td><td>${opts.sessionDate}</td></tr>
        <tr><td>Time</td><td>${opts.sessionTime}</td></tr>
        ${opts.reason ? `<tr><td>Reason</td><td>${opts.reason}</td></tr>` : ""}
        ${opts.refundPercentage !== undefined ? `<tr><td>Refund</td><td>${opts.refundPercentage}% of payment</td></tr>` : ""}
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">If you have any questions, please contact support.</p>
    `);
    await EmailService.sendEmail(opts.to, "❌ Session Cancelled — LMS", html);
  }

  static async sendSessionReminder(opts: {
    to: string;
    recipientName: string;
    teacherName: string;
    sessionDate: string;
    sessionTime: string;
    minutesBefore: number;
    meetingLink?: string;
  }): Promise<void> {
    const html = baseLayout(`
      <span class="tag tag-warning">Reminder</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">Session in ${opts.minutesBefore} minutes</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.recipientName}, your session is starting soon!</p>
      <table class="detail">
        <tr><td>Teacher</td><td>${opts.teacherName}</td></tr>
        <tr><td>Date</td><td>${opts.sessionDate}</td></tr>
        <tr><td>Time</td><td>${opts.sessionTime}</td></tr>
      </table>
      ${opts.meetingLink ? `<a href="${opts.meetingLink}" class="btn">Join Session Now</a>` : ""}
    `);
    await EmailService.sendEmail(opts.to, `⏰ Session starts in ${opts.minutesBefore} min — LMS`, html);
  }

  static async sendPaymentReceipt(opts: {
    to: string;
    recipientName: string;
    amount: number;
    currency: string;
    paymentId: string;
    description?: string;
    paidAt: string;
  }): Promise<void> {
    const html = baseLayout(`
      <span class="tag tag-success">Payment Successful</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">Payment Received</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.recipientName}, we've received your payment. Thank you!</p>
      <table class="detail">
        <tr><td>Amount</td><td style="color:#166534;font-size:16px">${opts.currency} ${Number(opts.amount).toFixed(2)}</td></tr>
        <tr><td>Payment ID</td><td style="font-family:monospace;font-size:12px">${opts.paymentId}</td></tr>
        ${opts.description ? `<tr><td>For</td><td>${opts.description}</td></tr>` : ""}
        <tr><td>Date</td><td>${opts.paidAt}</td></tr>
      </table>
    `);
    await EmailService.sendEmail(opts.to, "💳 Payment Confirmed — LMS", html);
  }

  static async sendGradePublished(opts: {
    to: string;
    studentName: string;
    examTitle: string;
    marksAwarded: number;
    totalMarks: number;
    examId: string;
  }): Promise<void> {
    const pct = Math.round((opts.marksAwarded / opts.totalMarks) * 100);
    const tag = pct >= 80 ? "tag-success" : pct >= 50 ? "tag-info" : "tag-danger";
    const html = baseLayout(`
      <span class="tag ${tag}">Grade Published</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">Your results are in!</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.studentName}, your exam has been graded.</p>
      <table class="detail">
        <tr><td>Exam</td><td>${opts.examTitle}</td></tr>
        <tr><td>Score</td><td>${opts.marksAwarded} / ${opts.totalMarks}</td></tr>
        <tr><td>Percentage</td><td style="font-size:18px;color:${pct >= 50 ? '#166534' : '#991b1b'}">${pct}%</td></tr>
      </table>
      <a href="/exams/${opts.examId}/result" class="btn">View Full Results</a>
    `);
    await EmailService.sendEmail(opts.to, "📋 Exam Results Published — LMS", html);
  }

  static async sendWeeklyProgressReport(opts: {
    to: string;
    parentName: string;
    studentName: string;
    periodStart: string;
    periodEnd: string;
    avgScore: number;
    attendancePct: number;
    sessionsAttended: number;
    trend: string;
    remarks?: string;
  }): Promise<void> {
    const trendIcon = opts.trend === "improving" ? "📈" : opts.trend === "declining" ? "📉" : "➡️";
    const html = baseLayout(`
      <span class="tag tag-info">Weekly Report</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">Weekly Progress Report</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.parentName}, here's a summary of ${opts.studentName}'s progress this week.</p>
      <table class="detail">
        <tr><td>Period</td><td>${opts.periodStart} – ${opts.periodEnd}</td></tr>
        <tr><td>Sessions Attended</td><td>${opts.sessionsAttended}</td></tr>
        <tr><td>Attendance</td><td>${opts.attendancePct.toFixed(1)}%</td></tr>
        <tr><td>Average Score</td><td>${opts.avgScore.toFixed(1)}%</td></tr>
        <tr><td>Trend</td><td>${trendIcon} ${opts.trend}</td></tr>
        ${opts.remarks ? `<tr><td>Teacher Remarks</td><td>${opts.remarks}</td></tr>` : ""}
      </table>
      <a href="/parent/dashboard" class="btn">View Full Dashboard</a>
    `);
    await EmailService.sendEmail(opts.to, `📊 Weekly Progress Report: ${opts.studentName} — LMS`, html);
  }

  static async sendPerformanceAlert(opts: {
    to: string;
    recipientName: string;
    alertType: "low_score" | "low_attendance" | "inactive";
    studentName: string;
    detail: string;
    suggestion: string;
    isParentCopy?: boolean;
  }): Promise<void> {
    const alertMeta: Record<string, { tag: string; tagClass: string; icon: string; headline: string }> = {
      low_score:      { tag: "Low Score Alert",     tagClass: "tag-danger",  icon: "📉", headline: "Exam performance needs attention" },
      low_attendance: { tag: "Attendance Alert",    tagClass: "tag-warning", icon: "📅", headline: "Attendance below required threshold" },
      inactive:       { tag: "Inactivity Alert",    tagClass: "tag-warning", icon: "👋", headline: "No recent platform activity" },
    };
    const meta = alertMeta[opts.alertType] ?? alertMeta.inactive;
    const forWhom = opts.isParentCopy
      ? `your child <strong>${opts.studentName}</strong>`
      : "you";

    const html = baseLayout(`
      <span class="tag ${meta.tagClass}">${meta.tag}</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">${meta.icon} ${meta.headline}</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.recipientName}, we wanted to flag a performance concern for ${forWhom}.</p>
      <table class="detail">
        <tr><td>Alert Type</td><td>${meta.tag}</td></tr>
        <tr><td>Detail</td><td>${opts.detail}</td></tr>
        <tr><td>Suggestion</td><td style="color:#1e40af">${opts.suggestion}</td></tr>
      </table>
      <a href="/dashboard" class="btn">Go to Dashboard</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:20px">This is an automated alert from LMS. If you need support, please contact your teacher.</p>
    `);
    await EmailService.sendEmail(opts.to, `${meta.icon} Performance Alert — LMS`, html);
  }

  static async sendProgressReportShare(opts: {
    to: string;
    parentName: string;
    studentName: string;
    periodStart: string;
    periodEnd: string;
    avgScore?: number;
    attendancePct?: number;
    sessionsAttended?: number;
    trend?: string;
    remarks?: string;
    strengths?: string;
    areasForImprovement?: string;
    teacherName: string;
    courseName?: string;
  }): Promise<void> {
    const trendIcon = opts.trend === "improving" ? "📈" : opts.trend === "declining" ? "📉" : "➡️";
    const html = baseLayout(`
      <span class="tag tag-info">Progress Report</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">📋 Progress Report for ${opts.studentName}</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.parentName}, ${opts.studentName}'s teacher has shared a progress report with you.</p>
      <table class="detail">
        ${opts.courseName ? `<tr><td>Course</td><td>${opts.courseName}</td></tr>` : ""}
        <tr><td>Period</td><td>${opts.periodStart} – ${opts.periodEnd}</td></tr>
        <tr><td>Teacher</td><td>${opts.teacherName}</td></tr>
        ${opts.sessionsAttended !== undefined ? `<tr><td>Sessions Attended</td><td>${opts.sessionsAttended}</td></tr>` : ""}
        ${opts.attendancePct !== undefined ? `<tr><td>Attendance</td><td>${Number(opts.attendancePct).toFixed(1)}%</td></tr>` : ""}
        ${opts.avgScore !== undefined ? `<tr><td>Average Score</td><td>${Number(opts.avgScore).toFixed(1)}%</td></tr>` : ""}
        ${opts.trend ? `<tr><td>Trend</td><td>${trendIcon} ${opts.trend}</td></tr>` : ""}
        ${opts.strengths ? `<tr><td>Strengths</td><td style="color:#166534">${opts.strengths}</td></tr>` : ""}
        ${opts.areasForImprovement ? `<tr><td>Areas to Improve</td><td style="color:#b45309">${opts.areasForImprovement}</td></tr>` : ""}
        ${opts.remarks ? `<tr><td>Teacher Remarks</td><td>${opts.remarks}</td></tr>` : ""}
      </table>
      <a href="/parent/dashboard" class="btn">View Full Dashboard</a>
    `);
    await EmailService.sendEmail(opts.to, `📋 Progress Report: ${opts.studentName} — LMS`, html);
  }

  static async sendSessionScheduled(opts: {
    to: string;
    studentName: string;
    sessionTitle: string;
    startTime: string;
    teacherName: string;
    meetingLink?: string;
  }): Promise<void> {
    const html = baseLayout(`
      <span class="tag tag-info">New Session</span>
      <h2 style="margin:18px 0 6px;font-size:20px;color:#1e293b">📅 New Session Scheduled</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px">Hi ${opts.studentName}, a new session has been scheduled.</p>
      <table class="detail">
        <tr><td>Topic</td><td>${opts.sessionTitle}</td></tr>
        <tr><td>Instructor</td><td>${opts.teacherName}</td></tr>
        <tr><td>Time</td><td>${opts.startTime}</td></tr>
      </table>
      ${opts.meetingLink ? `<a href="${opts.meetingLink}" class="btn">Join Meeting</a>` : ""}
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">Please check your schedule for more details.</p>
    `);
    await EmailService.sendEmail(opts.to, `📅 New Session: ${opts.sessionTitle} — LMS`, html);
  }
}
