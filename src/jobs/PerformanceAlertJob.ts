import cron from "node-cron";
import { AppDataSource } from "../config/data-source";
import { AnswerSubmission, SubmissionStatus } from "../entities/AnswerSubmission";
import { ProgressReport } from "../entities/ProgressReport";
import { User } from "../entities/User";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { Notification } from "../entities/Notification";
import { NotificationService } from "../services/NotificationService";
import { EmailService } from "../services/EmailService";
import { NotificationType } from "../entities/Notification";

/**
 * PerformanceAlertJob
 * Runs daily at 7:00 AM.
 *
 * Three alert types:
 *  1. Low exam score  (<40%) — checked once per submission via duplicate guard
 *  2. Low attendance  (<75%) from ProgressReport — checked once per report
 *  3. Inactive student (no login 7+ days) — checked daily
 */
export const startPerformanceAlertJob = () => {
  cron.schedule("0 7 * * *", async () => {
    console.log("[PerformanceAlertJob] Running performance checks...");
    await Promise.allSettled([
      checkLowExamScores(),
      checkLowAttendance(),
      checkInactiveStudents(),
    ]);
    console.log("[PerformanceAlertJob] Done.");
  });
};

// ─── 1. Low Exam Scores ───────────────────────────────────────────────────────

async function checkLowExamScores() {
  try {
    const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
    const notifRepo = AppDataSource.getRepository(Notification);

    // Graded master submissions (questionId IS NULL) with score < 40%
    const submissions = await submissionRepo
      .createQueryBuilder("s")
      .leftJoinAndSelect("s.exam", "exam")
      .leftJoinAndSelect("s.student", "student")
      .where("s.status = :status", { status: SubmissionStatus.GRADED })
      .andWhere("s.question_id IS NULL")
      .andWhere("s.marks_awarded IS NOT NULL")
      .andWhere("exam.total_marks > 0")
      .andWhere("(s.marks_awarded / exam.total_marks) < 0.40")
      .getMany();

    for (const sub of submissions) {
      const dedupKey = `low_score_${sub.id}`;

      // Duplicate guard — skip if already alerted for this submission
      const alreadySent = await notifRepo.findOne({
        where: {
          userId: sub.studentId,
          notificationType: NotificationType.PERFORMANCE_ALERT,
          referenceId: sub.id,
        },
      });
      if (alreadySent) continue;

      const pct = Math.round(((sub.marksAwarded ?? 0) / sub.exam.totalMarks) * 100);
      const title = "⚠️ Low Exam Score Alert";
      const message = `You scored ${pct}% on "${sub.exam.title}". Consider reviewing the material and seeking help.`;

      // In-app + email to student
      await NotificationService.createInApp(
        sub.studentId,
        NotificationType.PERFORMANCE_ALERT,
        title,
        message,
        sub.id,
        `/exams/${sub.examId}/results`
      );

      if (sub.student?.email) {
        void EmailService.sendPerformanceAlert({
          to: sub.student.email,
          recipientName: sub.student.firstName,
          alertType: "low_score",
          studentName: sub.student.firstName,
          detail: `Score: ${sub.marksAwarded} / ${sub.exam.totalMarks} (${pct}%) on "${sub.exam.title}"`,
          suggestion: "Please review the exam material and speak to your teacher for guidance.",
        });
      }

      // Notify linked parents
      await notifyParents(sub.studentId, sub.student, title, message, "low_score", {
        examTitle: sub.exam.title,
        score: `${sub.marksAwarded} / ${sub.exam.totalMarks} (${pct}%)`,
      });
    }
  } catch (err) {
    console.error("[PerformanceAlertJob] checkLowExamScores error:", err);
  }
}

// ─── 2. Low Attendance ────────────────────────────────────────────────────────

async function checkLowAttendance() {
  try {
    const reportRepo = AppDataSource.getRepository(ProgressReport);
    const notifRepo = AppDataSource.getRepository(Notification);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const reports = await reportRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.student", "student")
      .leftJoinAndSelect("r.course", "course")
      .where("r.attendance_percentage < 75")
      .andWhere("r.generated_at >= :since", { since: sevenDaysAgo })
      .getMany();

    for (const report of reports) {
      const alreadySent = await notifRepo.findOne({
        where: {
          userId: report.studentId,
          notificationType: NotificationType.PERFORMANCE_ALERT,
          referenceId: report.id,
        },
      });
      if (alreadySent) continue;

      const attPct = Number(report.attendancePercentage ?? 0).toFixed(1);
      const courseName = report.course?.title ?? "your course";
      const title = "⚠️ Low Attendance Alert";
      const message = `Your attendance for ${courseName} is ${attPct}% — below the 75% required threshold.`;

      await NotificationService.createInApp(
        report.studentId,
        NotificationType.PERFORMANCE_ALERT,
        title,
        message,
        report.id,
        `/courses`
      );

      if (report.student?.email) {
        void EmailService.sendPerformanceAlert({
          to: report.student.email,
          recipientName: report.student.firstName,
          alertType: "low_attendance",
          studentName: report.student.firstName,
          detail: `Attendance: ${attPct}% for "${courseName}"`,
          suggestion: "Please ensure you attend sessions regularly to avoid falling behind.",
        });
      }

      await notifyParents(report.studentId, report.student, title, message, "low_attendance", {
        course: courseName,
        attendance: `${attPct}%`,
      });
    }
  } catch (err) {
    console.error("[PerformanceAlertJob] checkLowAttendance error:", err);
  }
}

// ─── 3. Inactive Students ─────────────────────────────────────────────────────

async function checkInactiveStudents() {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const notifRepo = AppDataSource.getRepository(Notification);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Students who haven't logged in for 7+ days
    const inactiveStudents = await userRepo
      .createQueryBuilder("u")
      .where("u.role = :role", { role: "student" })
      .andWhere("u.last_login_at IS NOT NULL")
      .andWhere("u.last_login_at < :since", { since: sevenDaysAgo })
      .getMany();

    for (const student of inactiveStudents) {
      // Deduplicate: only one inactive alert per 7-day window per student
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 7);

      const alreadySent = await notifRepo
        .createQueryBuilder("n")
        .where("n.user_id = :uid", { uid: student.id })
        .andWhere("n.notification_type = :type", { type: "PERFORMANCE_ALERT" })
        .andWhere("n.title LIKE :title", { title: "%Inactive%" })
        .andWhere("n.created_at >= :since", { since: windowStart })
        .getOne();

      if (alreadySent) continue;

      const daysSince = Math.floor(
        (Date.now() - new Date(student.lastLoginAt!).getTime()) / 86_400_000
      );

      const title = "👋 We miss you!";
      const message = `You haven't logged in for ${daysSince} days. Come back and continue your learning journey!`;

      await NotificationService.createInApp(
        student.id,
        NotificationType.PERFORMANCE_ALERT,
        title,
        message,
        student.id,
        `/dashboard`
      );

      void EmailService.sendPerformanceAlert({
        to: student.email,
        recipientName: student.firstName,
        alertType: "inactive",
        studentName: student.firstName,
        detail: `Last seen: ${daysSince} days ago`,
        suggestion: "Log in to review your courses, check upcoming sessions, and stay on track.",
      });
    }
  } catch (err) {
    console.error("[PerformanceAlertJob] checkInactiveStudents error:", err);
  }
}

// ─── Helper: notify linked parents ───────────────────────────────────────────

async function notifyParents(
  studentId: string,
  student: User,
  title: string,
  message: string,
  alertType: string,
  details: Record<string, string>
) {
  try {
    const linkRepo = AppDataSource.getRepository(StudentParent);
    const links = await linkRepo.find({
      where: { studentId, status: LinkStatus.ACCEPTED },
      relations: ["parent"],
    });

    for (const link of links) {
      if (!link.parent?.email) continue;

      const detailLines = Object.entries(details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");

      void EmailService.sendPerformanceAlert({
        to: link.parent.email,
        recipientName: link.parent.firstName,
        alertType: alertType as "low_score" | "low_attendance" | "inactive",
        studentName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        detail: detailLines,
        suggestion: "Please discuss this with your child and their teacher.",
        isParentCopy: true,
      });
    }
  } catch (err) {
    console.error("[PerformanceAlertJob] notifyParents error:", err);
  }
}
