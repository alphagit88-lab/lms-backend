/**
 * Quick SMTP / Mailtrap smoke-test.
 * Run:  npx ts-node -r dotenv/config src/scripts/testEmail.ts
 */
import nodemailer from "nodemailer";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const config = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS ? "[SET]" : "[MISSING]",
    from: process.env.SMTP_FROM,
  };

  console.log("=== Mailtrap SMTP Config ===");
  console.table(config);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.SMTP_PORT || 2525),
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });

  // 1. Verify SMTP connection
  console.log("\n[1] Verifying SMTP connection...");
  await transporter.verify();
  console.log("    ✅ SMTP connection OK");

  // 2. Send booking confirmation test email
  console.log("\n[2] Sending booking confirmation email...");
  const info1 = await transporter.sendMail({
    from: `"LMS" <${process.env.SMTP_FROM || "noreply@lms.lk"}>`,
    to: "test-student@example.com",
    subject: "TEST — Booking Confirmed",
    html: `
      <div style="font-family:sans-serif; padding:20px; max-width:500px; margin:auto; border:1px solid #e2e8f0; border-radius:12px;">
        <h2 style="color:#1e40af;">✅ Booking Confirmed</h2>
        <p>This is a <strong>test email</strong> from the LMS Mailtrap smoketest.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;color:#64748b;">Student</td><td style="font-weight:600;">Test Student</td></tr>
          <tr><td style="padding:8px;color:#64748b;">Teacher</td><td style="font-weight:600;">Test Teacher</td></tr>
          <tr><td style="padding:8px;color:#64748b;">Subject</td><td style="font-weight:600;">Mathematics</td></tr>
          <tr><td style="padding:8px;color:#64748b;">Session Date</td><td style="font-weight:600;">March 9, 2026 · 10:00 AM</td></tr>
          <tr><td style="padding:8px;color:#64748b;">Duration</td><td style="font-weight:600;">60 minutes</td></tr>
        </table>
        <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Sent at ${new Date().toISOString()}</p>
      </div>
    `,
  });
  console.log(`    ✅ Message ID: ${info1.messageId}`);

  await new Promise((r) => setTimeout(r, 5000)); // rate-limit pause (free plan: ~1 msg/5s)

  // 3. Send grade published test email
  console.log("\n[3] Sending grade published email...");
  const info2 = await transporter.sendMail({
    from: `"LMS" <${process.env.SMTP_FROM || "noreply@lms.lk"}>`,
    to: "test-student@example.com",
    subject: "TEST — Your Grade Has Been Published",
    html: `
      <div style="font-family:sans-serif; padding:20px; max-width:500px; margin:auto; border:1px solid #e2e8f0; border-radius:12px;">
        <h2 style="color:#166534;">📊 Grade Published</h2>
        <p>Your results for <strong>Mathematics Final Exam</strong> are now available.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;color:#64748b;">Score</td><td style="font-weight:600;font-size:24px;color:#1e40af;">85 / 100</td></tr>
          <tr><td style="padding:8px;color:#64748b;">Percentage</td><td style="font-weight:600;">85%</td></tr>
        </table>
        <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Sent at ${new Date().toISOString()}</p>
      </div>
    `,
  });
  console.log(`    ✅ Message ID: ${info2.messageId}`);

  await new Promise((r) => setTimeout(r, 5000)); // rate-limit pause (free plan: ~1 msg/5s)

  // 4. Send session reminder test email
  console.log("\n[4] Sending session reminder email...");
  const info3 = await transporter.sendMail({
    from: `"LMS" <${process.env.SMTP_FROM || "noreply@lms.lk"}>`,
    to: "test-student@example.com",
    subject: "TEST — Session Starting in 60 Minutes",
    html: `
      <div style="font-family:sans-serif; padding:20px; max-width:500px; margin:auto; border:1px solid #e2e8f0; border-radius:12px;">
        <h2 style="color:#b45309;">⏰ Session Reminder</h2>
        <p>Your session with <strong>Test Teacher</strong> starts in <strong>60 minutes</strong>.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;color:#64748b;">Start Time</td><td style="font-weight:600;">${new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString()}</td></tr>
          <tr><td style="padding:8px;color:#64748b;">Subject</td><td style="font-weight:600;">Mathematics</td></tr>
        </table>
        <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Sent at ${new Date().toISOString()}</p>
      </div>
    `,
  });
  console.log(`    ✅ Message ID: ${info3.messageId}`);

  console.log("\n=== All tests passed! ===");
  console.log("👉 Open your Mailtrap inbox to see the 3 emails:");
  console.log("   https://mailtrap.io/inboxes\n");
}

main().catch((err) => {
  console.error("\n❌ Test FAILED:", err.message);
  process.exit(1);
});
