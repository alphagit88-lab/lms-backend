import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { TeacherProfile } from "../entities/TeacherProfile";
import { User } from "../entities/User";
import { Course } from "../entities/Course";
import { Booking } from "../entities/Booking";
import { Payout, PayoutStatus } from "../entities/Payout";

const userRepository = AppDataSource.getRepository(User);
const teacherProfileRepository = AppDataSource.getRepository(TeacherProfile);
const courseRepository = AppDataSource.getRepository(Course);
const bookingRepository = AppDataSource.getRepository(Booking);

export class AdminController {
  /* ─── Platform Stats ───────────────────────────────── */

  /**
   * GET /api/admin/stats
   * Returns aggregated platform statistics
   */
  static async getStats(_req: Request, res: Response) {
    try {
      const totalUsers = await userRepository.count();
      const students = await userRepository.count({ where: { role: "student" } });
      const instructors = await userRepository.count({ where: { role: "instructor" } });
      const parents = await userRepository.count({ where: { role: "parent" } });
      const admins = await userRepository.count({ where: { role: "admin" } });

      const totalCourses = await courseRepository.count();
      const totalBookings = await bookingRepository.count();

      const pendingTeachers = await teacherProfileRepository.count({
        where: { verified: false },
      });

      // Recent signups (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentSignups = await userRepository
        .createQueryBuilder("u")
        .where("u.created_at >= :since", { since: sevenDaysAgo })
        .getCount();

      res.json({
        totalUsers,
        students,
        instructors,
        parents,
        admins,
        totalCourses,
        totalBookings,
        pendingTeachers,
        recentSignups,
      });
    } catch (error) {
      console.error("Get stats error:", error);
      res.status(500).json({ error: "Failed to fetch platform statistics" });
    }
  }

  /* ─── User Management ──────────────────────────────── */

  /**
   * GET /api/admin/users
   * List all users with optional role filter & search
   */
  static async getUsers(req: Request, res: Response) {
    try {
      const { role, search, page = "1", limit = "20" } = req.query;

      const qb = userRepository.createQueryBuilder("u");

      if (role && typeof role === "string") {
        qb.andWhere("u.role = :role", { role });
      }

      if (search && typeof search === "string") {
        const q = `%${search.toLowerCase()}%`;
        qb.andWhere(
          "(LOWER(u.first_name) LIKE :q OR LOWER(u.last_name) LIKE :q OR LOWER(u.email) LIKE :q)",
          { q }
        );
      }

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

      qb.orderBy("u.created_at", "DESC")
        .skip((pageNum - 1) * pageSize)
        .take(pageSize);

      const [users, total] = await qb.getManyAndCount();

      // Strip passwords
      const safeUsers = users.map(({ password: _, ...u }) => u);

      res.json({
        users: safeUsers,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }

  /**
   * PATCH /api/admin/users/:id/toggle-active
   * Enable or disable a user account
   */
  static async toggleUserActive(req: Request, res: Response) {
    try {
      const userId = req.params.id as string;
      const adminId = req.session.userId!;

      if (userId === adminId) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }

      const user = await userRepository.findOne({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });

      user.isActive = !user.isActive;
      await userRepository.save(user);

      const { password: _, ...safeUser } = user as any;
      res.json({
        message: `User ${user.isActive ? "activated" : "deactivated"} successfully`,
        user: safeUser,
      });
    } catch (error) {
      console.error("Toggle user active error:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  }

  /**
   * DELETE /api/admin/users/:id
   * Permanently delete a user
   */
  static async deleteUser(req: Request, res: Response) {
    try {
      const userId = req.params.id as string;
      const adminId = req.session.userId!;

      if (userId === adminId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      const user = await userRepository.findOne({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });

      await userRepository.remove(user);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }

  /* ─── Teacher Verification ─────────────────────────── */

  /**
   * GET /api/admin/teachers/pending
   */
  static async getPendingTeachers(_req: Request, res: Response) {
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

      profile.metadata = {
        ...(profile.metadata || {}),
        rejectionReason: reason || "No reason provided",
        rejectedAt: new Date().toISOString(),
        rejectedBy: adminId,
      };

      await teacherProfileRepository.save(profile);

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

  /* ─── Payouts ──────────────────────────────────────── */

  /**
   * GET /api/admin/payouts
   */
  static async getPayouts(_req: Request, res: Response) {
    try {
      const payoutRepository = AppDataSource.getRepository(Payout);
      const payouts = await payoutRepository.find({
        relations: ["teacher"],
        order: { createdAt: "DESC" },
      });

      // Format response to omit sensitive teacher info
      const formattedPayouts = payouts.map(p => ({
        id: p.id,
        teacherId: p.teacherId,
        teacherName: p.teacher ? `${p.teacher.firstName} ${p.teacher.lastName}` : "Unknown",
        amount: p.amount,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        status: p.status,
        payoutMethod: p.payoutMethod,
        processedAt: p.processedAt,
        reference: p.reference,
        createdAt: p.createdAt
      }));

      res.json({ payouts: formattedPayouts });
    } catch (error) {
      console.error("Get payouts error:", error);
      res.status(500).json({ error: "Failed to fetch payouts" });
    }
  }

  /**
   * POST /api/admin/payouts/:id/process
   */
  static async processPayout(req: Request, res: Response) {
    try {
      const payoutId = req.params.id as string;
      const { reference } = req.body;
      const payoutRepository = AppDataSource.getRepository(Payout);

      const payout = await payoutRepository.findOne({ where: { id: payoutId } });

      if (!payout) {
        return res.status(404).json({ error: "Payout not found" });
      }

      if (payout.status === PayoutStatus.COMPLETED) {
        return res.status(400).json({ error: "Payout already processed" });
      }

      payout.status = PayoutStatus.COMPLETED;
      payout.processedAt = new Date();
      if (reference) payout.reference = reference;

      await payoutRepository.save(payout);

      res.json({ message: "Payout marked as processed successfully", payout });
    } catch (error) {
      console.error("Process payout error:", error);
      res.status(500).json({ error: "Failed to process payout" });
    }
  }
}
