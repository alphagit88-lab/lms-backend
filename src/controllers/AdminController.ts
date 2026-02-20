import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { TeacherProfile } from "../entities/TeacherProfile";
import { User } from "../entities/User";

const teacherProfileRepository = AppDataSource.getRepository(TeacherProfile);
const userRepository = AppDataSource.getRepository(User);

export class AdminController {
  /**
   * Get all pending (unverified) teachers
   * GET /api/admin/teachers/pending
   */
  static async getPendingTeachers(req: Request, res: Response) {
    try {
      const teachers = await teacherProfileRepository
        .createQueryBuilder("profile")
        .leftJoinAndSelect("profile.teacher", "teacher")
        .where("profile.verified = :verified", { verified: false })
        .orderBy("profile.createdAt", "ASC")
        .getMany();

      res.json({ teachers });
    } catch (error) {
      console.error("Get pending teachers error:", error);
      res.status(500).json({ error: "Failed to fetch pending teachers" });
    }
  }

  /**
   * Verify a teacher (approve)
   * PATCH /api/admin/teachers/:id/verify
   */
  static async verifyTeacher(req: Request, res: Response) {
    try {
      const teacherId = req.params.id as string;
      const adminId = req.session.userId!;

      const profile = await teacherProfileRepository.findOne({
        where: { teacherId },
        relations: ["teacher"],
      });

      if (!profile) {
        return res.status(404).json({ error: "Teacher profile not found" });
      }

      if (profile.verified) {
        return res.status(400).json({ error: "Teacher is already verified" });
      }

      profile.verified = true;
      profile.verifiedAt = new Date();
      profile.verifiedBy = adminId;

      await teacherProfileRepository.save(profile);

      res.json({
        message: "Teacher verified successfully",
        teacher: {
          id: profile.teacherId,
          name: `${profile.teacher.firstName} ${profile.teacher.lastName}`,
          email: profile.teacher.email,
          verified: profile.verified,
          verifiedAt: profile.verifiedAt,
        },
      });
    } catch (error) {
      console.error("Verify teacher error:", error);
      res.status(500).json({ error: "Failed to verify teacher" });
    }
  }

  /**
   * Reject a teacher (with reason)
   * PATCH /api/admin/teachers/:id/reject
   */
  static async rejectTeacher(req: Request, res: Response) {
    try {
      const teacherId = req.params.id as string;
      const { reason } = req.body;
      const adminId = req.session.userId!;

      const profile = await teacherProfileRepository.findOne({
        where: { teacherId },
        relations: ["teacher"],
      });

      if (!profile) {
        return res.status(404).json({ error: "Teacher profile not found" });
      }

      if (profile.verified) {
        return res.status(400).json({ error: "Cannot reject an already verified teacher" });
      }

      // Store rejection reason in metadata
      profile.metadata = {
        ...(profile.metadata || {}),
        rejectionReason: reason || "No reason provided",
        rejectedAt: new Date().toISOString(),
        rejectedBy: adminId,
      };

      await teacherProfileRepository.save(profile);

      // TODO: (Epic 6) Send notification email to teacher about rejection

      res.json({
        message: "Teacher rejected successfully",
        teacher: {
          id: profile.teacherId,
          name: `${profile.teacher.firstName} ${profile.teacher.lastName}`,
          email: profile.teacher.email,
          rejectionReason: reason,
        },
      });
    } catch (error) {
      console.error("Reject teacher error:", error);
      res.status(500).json({ error: "Failed to reject teacher" });
    }
  }
}

