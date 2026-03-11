import cron from "node-cron";
import { AppDataSource } from "../config/data-source";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { ProgressReport } from "../entities/ProgressReport";
import { User } from "../entities/User";
import { EmailService } from "../services/EmailService";
import { MoreThanOrEqual } from "typeorm";

/**
 * ParentReportJob
 * Runs every Sunday at 8:00 AM.
 * For each accepted parent–student link, finds progress reports
 * from the past 7 days and sends a weekly summary email.
 */
export const startParentReportJob = () => {
  // Every Sunday at 8:00 AM
  cron.schedule("0 8 * * 0", async () => {
    console.log("[ParentReportJob] Sending weekly progress reports...");
    try {
      const linkRepo = AppDataSource.getRepository(StudentParent);
      const reportRepo = AppDataSource.getRepository(ProgressReport);
      const userRepo = AppDataSource.getRepository(User);

      const links = await linkRepo.find({ where: { status: LinkStatus.ACCEPTED } });

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      for (const link of links) {
        const [parent, student] = await Promise.all([
          userRepo.findOne({ where: { id: link.parentId } }),
          userRepo.findOne({ where: { id: link.studentId } }),
        ]);
        if (!parent || !student) continue;

        // Find the most recent progress report for this student this week
        const report = await reportRepo.findOne({
          where: {
            studentId: link.studentId,
            reportPeriodStart: MoreThanOrEqual(weekAgo),
          },
          order: { reportPeriodStart: "DESC" },
        });

        if (!report) {
          // No report this week — skip (don't send empty emails)
          continue;
        }

        const periodStart = report.reportPeriodStart.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
        const periodEnd = report.reportPeriodEnd.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        await EmailService.sendWeeklyProgressReport({
          to: parent.email,
          parentName: `${parent.firstName} ${parent.lastName}`,
          studentName: `${student.firstName} ${student.lastName}`,
          periodStart,
          periodEnd,
          avgScore: Number(report.averageScore) || 0,
          attendancePct: Number(report.attendancePercentage) || 0,
          sessionsAttended: report.totalSessionsAttended || 0,
          trend: report.performanceTrend || "stable",
          remarks: report.remarks,
        });
      }

      console.log(`[ParentReportJob] Sent reports for ${links.length} parent-student link(s).`);
    } catch (err) {
      console.error("[ParentReportJob] Error:", err);
    }
  });

  console.log("[Jobs] Registered ParentReportJob cron (Sundays 8AM).");
};
