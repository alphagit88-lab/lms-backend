import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { ProgressReport } from "../entities/ProgressReport";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { EmailService } from "../services/EmailService";

export class ProgressReportController {
  /**
   * POST /api/progress-reports/:id/share
   * Sends the report to all linked parents of the student and marks isSharedWithParent = true.
   * Auth: instructor or admin (owner of report)
   */
  static shareWithParents = async (req: Request, res: Response): Promise<Response> => {
    try {
      const reportId = req.params.id as string;
      const requesterId = req.session.userId!;
      const requesterRole = req.session.userRole!;

      const reportRepo = AppDataSource.getRepository(ProgressReport);
      const report = await reportRepo.findOne({
        where: { id: reportId },
        relations: ["student", "course", "teacher"],
      });

      if (!report) {
        return res.status(404).json({ message: "Progress report not found" });
      }

      // Only the report's teacher or an admin can share it
      if (requesterRole !== "admin" && report.teacherId !== requesterId) {
        return res.status(403).json({ message: "Not authorised to share this report" });
      }

      // Find all accepted parent links for this student
      const linkRepo = AppDataSource.getRepository(StudentParent);
      const links = await linkRepo.find({
        where: { studentId: report.studentId, status: LinkStatus.ACCEPTED },
        relations: ["parent"],
      });

      if (links.length === 0) {
        return res.status(200).json({
          message: "Report has no linked parents to share with",
          sharedWith: 0,
        });
      }

      const periodStart = new Date(report.reportPeriodStart).toLocaleDateString("en-GB");
      const periodEnd = new Date(report.reportPeriodEnd).toLocaleDateString("en-GB");
      const studentName = `${report.student.firstName} ${report.student.lastName ?? ""}`.trim();
      const teacherName = `${report.teacher.firstName} ${report.teacher.lastName ?? ""}`.trim();
      const courseName = report.course?.title;

      let sharedWith = 0;
      for (const link of links) {
        if (!link.parent?.email) continue;

        void EmailService.sendProgressReportShare({
          to: link.parent.email,
          parentName: link.parent.firstName,
          studentName,
          periodStart,
          periodEnd,
          avgScore: report.averageScore ? Number(report.averageScore) : undefined,
          attendancePct: report.attendancePercentage ? Number(report.attendancePercentage) : undefined,
          sessionsAttended: report.totalSessionsAttended,
          trend: report.performanceTrend ?? undefined,
          remarks: report.remarks ?? undefined,
          strengths: report.strengths ?? undefined,
          areasForImprovement: report.areasForImprovement ?? undefined,
          teacherName,
          courseName,
        });

        if (link.parent.phone) {
          const { SMSService } = await import("../services/SMSService");
          void SMSService.sendProgressReportUpdate(
            link.parent.phone,
            link.parent.firstName,
            studentName
          );
        }

        sharedWith++;
      }

      // Mark as shared
      report.isSharedWithParent = true;
      await reportRepo.save(report);

      return res.status(200).json({
        message: `Report shared with ${sharedWith} parent(s)`,
        sharedWith,
      });
    } catch (err) {
      console.error("[ProgressReportController] shareWithParents:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /api/progress-reports
   * Teacher lists their own reports. Admin sees all. Student sees own.
   */
  static getReports = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const role = req.session.userRole!;

      const reportRepo = AppDataSource.getRepository(ProgressReport);
      const qb = reportRepo
        .createQueryBuilder("r")
        .leftJoinAndSelect("r.student", "student")
        .leftJoinAndSelect("r.course", "course")
        .orderBy("r.generated_at", "DESC");

      if (role === "instructor") {
        qb.where("r.teacher_id = :userId", { userId });
      } else if (role === "student") {
        qb.where("r.student_id = :userId", { userId });
      } else if (role === "parent") {
        // Find all accepted students linked to this parent
        const linkRepo = AppDataSource.getRepository(StudentParent);
        const links = await linkRepo.find({
          where: { parentId: userId, status: LinkStatus.ACCEPTED },
          select: ["studentId"],
        });
        const studentIds = links.map((l) => l.studentId);
        
        if (studentIds.length > 0) {
          qb.where("r.student_id IN (:...studentIds)", { studentIds });
          qb.andWhere("r.is_shared_with_parent = :shared", { shared: true });
        } else {
          // If no links, return nothing
          qb.where("1 = 0");
        }
      }
      // admin sees all — no filter

      const reports = await qb.getMany();
      return res.json({ reports });
    } catch (err) {
      console.error("[ProgressReportController] getReports:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /api/progress-reports/:id
   */
  static getReportById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const role = req.session.userRole!;
      const reportId = req.params.id as string;

      const reportRepo = AppDataSource.getRepository(ProgressReport);
      const report = await reportRepo.findOne({
        where: { id: reportId },
        relations: ["student", "course", "teacher"],
      });

      if (!report) return res.status(404).json({ message: "Report not found" });

      // Access control: only the teacher, the student, or admin
      if (
        role !== "admin" &&
        report.teacherId !== userId &&
        report.studentId !== userId
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      return res.json({ report });
    } catch (err) {
      console.error("[ProgressReportController] getReportById:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
