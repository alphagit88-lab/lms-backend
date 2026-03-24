import "../types/express-session";
import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { User } from "../entities/User";
import { NotificationService } from "../services/NotificationService";
import { NotificationType } from "../entities/Notification";

const studentParentRepository = AppDataSource.getRepository(StudentParent);
const userRepository = AppDataSource.getRepository(User);

export class ParentController {
  /**
   * Parent requests to link with a student
   * POST /api/parent/link-student
   */
  static async linkStudent(req: Request, res: Response) {
    try {
      const parentId = req.session.userId!;
      const { studentEmail, message } = req.body;

      // Validation
      if (!studentEmail) {
        return res.status(400).json({ error: "Student email is required" });
      }

      // Verify parent role
      const parent = await userRepository.findOne({ where: { id: parentId } });
      if (!parent || parent.role !== "parent") {
        return res.status(403).json({ 
          error: "Only users with parent role can link students" 
        });
      }

      // Find student by email
      const student = await userRepository.findOne({
        where: { email: studentEmail },
      });

      if (!student) {
        return res.status(404).json({ error: "Student not found with this email" });
      }

      if (student.role !== "student") {
        return res.status(400).json({ 
          error: "Can only link to users with student role" 
        });
      }

      // Check if link already exists
      const existingLink = await studentParentRepository.findOne({
        where: { parentId, studentId: student.id },
      });

      if (existingLink) {
        if (existingLink.status === LinkStatus.PENDING) {
          return res.status(409).json({ 
            error: "Link request already pending approval" 
          });
        }
        if (existingLink.status === LinkStatus.ACCEPTED) {
          return res.status(409).json({ 
            error: "Already linked to this student" 
          });
        }
      }

      // Create link request
      const link = studentParentRepository.create({
        parentId,
        studentId: student.id,
        status: LinkStatus.PENDING,
        message: message || "Parent requesting to link with student account",
      });

      await studentParentRepository.save(link);

      // Notify Student
      await NotificationService.createInApp(
        student.id,
        NotificationType.PARENT_LINK_REQUEST,
        "Parent Link Request",
        `${parent.firstName} ${parent.lastName} has requested a parent link.`,
        link.id,
        process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/profile` : "/profile"
      );

      // Notify Admins
      const admins = await userRepository.find({ where: { role: "admin" } });
      for (const admin of admins) {
        await NotificationService.createInApp(
          admin.id,
          NotificationType.PARENT_LINK_REQUEST,
          "New Parent Link Request",
          `Parent ${parent.firstName} ${parent.lastName} wants to link with Student ${student.firstName} ${student.lastName}.`,
          link.id,
          "/admin/parent-links"
        );
      }

      res.status(201).json({
        message: "Link request sent successfully. Waiting for admin approval.",
        link: {
          id: link.id,
          parentId: link.parentId,
          studentId: link.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          studentEmail: student.email,
          status: link.status,
          createdAt: link.createdAt,
        },
      });
    } catch (error: any) {
      console.error("Link student error:", error);
      res.status(500).json({ error: "Failed to create link request" });
    }
  }

  /**
   * Student accepts or rejects parent link request
   * POST /api/parent/respond-link
   */
  static async respondToLink(req: Request, res: Response) {
    try {
      const studentId = req.session.userId!;
      const { linkId, action } = req.body;

      // Validation
      if (!linkId || !action) {
        return res.status(400).json({ 
          error: "Link ID and action (accept/reject) are required" 
        });
      }

      if (!["accept", "reject"].includes(action)) {
        return res.status(400).json({ 
          error: "Action must be 'accept' or 'reject'" 
        });
      }

      // Find link request
      const link = await studentParentRepository.findOne({
        where: { id: linkId, studentId },
        relations: ["parent"],
      });

      if (!link) {
        return res.status(404).json({ 
          error: "Link request not found or you don't have permission" 
        });
      }

      if (link.status !== LinkStatus.PENDING) {
        return res.status(400).json({ 
          error: `Link request already ${link.status}` 
        });
      }

      // Update link status
      link.status = action === "accept" ? LinkStatus.ACCEPTED : LinkStatus.REJECTED;
      if (action === "accept") {
        link.acceptedAt = new Date();
      }

      await studentParentRepository.save(link);

      res.json({
        message: `Link request ${action}ed successfully`,
        link: {
          id: link.id,
          parentName: `${link.parent.firstName} ${link.parent.lastName}`,
          parentEmail: link.parent.email,
          status: link.status,
          acceptedAt: link.acceptedAt,
        },
      });
    } catch (error: any) {
      console.error("Respond to link error:", error);
      res.status(500).json({ error: "Failed to respond to link request" });
    }
  }

  /**
   * Get pending link requests for a student
   * GET /api/parent/pending-requests
   */
  static async getPendingRequests(req: Request, res: Response) {
    try {
      const studentId = req.session.userId!;

      const pendingLinks = await studentParentRepository.find({
        where: { studentId, status: LinkStatus.PENDING },
        relations: ["parent"],
        order: { createdAt: "DESC" },
      });

      const requests = pendingLinks.map((link) => ({
        id: link.id,
        parentName: `${link.parent.firstName} ${link.parent.lastName}`,
        parentEmail: link.parent.email,
        message: link.message,
        createdAt: link.createdAt,
      }));

      res.json({ requests });
    } catch (error: any) {
      console.error("Get pending requests error:", error);
      res.status(500).json({ error: "Failed to retrieve pending requests" });
    }
  }

  /**
   * Parent views all linked students
   * GET /api/parent/my-students
   */
  static async getMyStudents(req: Request, res: Response) {
    try {
      const parentId = req.session.userId!;

      const links = await studentParentRepository.find({
        where: { parentId, status: LinkStatus.ACCEPTED },
        relations: ["student"],
        order: { acceptedAt: "DESC" },
      });

      const students = links.map((link) => ({
        linkId: link.id,
        studentId: link.student.id,
        firstName: link.student.firstName,
        lastName: link.student.lastName,
        email: link.student.email,
        profilePicture: link.student.profilePicture,
        linkedSince: link.acceptedAt,
      }));

      res.json({ students });
    } catch (error: any) {
      console.error("Get my students error:", error);
      res.status(500).json({ error: "Failed to retrieve linked students" });
    }
  }

  /**
   * Student views all linked parents
   * GET /api/student/my-parents
   */
  static async getMyParents(req: Request, res: Response) {
    try {
      const studentId = req.session.userId!;

      const links = await studentParentRepository.find({
        where: { studentId, status: LinkStatus.ACCEPTED },
        relations: ["parent"],
        order: { acceptedAt: "DESC" },
      });

      const parents = links.map((link) => ({
        linkId: link.id,
        parentId: link.parent.id,
        firstName: link.parent.firstName,
        lastName: link.parent.lastName,
        email: link.parent.email,
        profilePicture: link.parent.profilePicture,
        linkedSince: link.acceptedAt,
      }));

      res.json({ parents });
    } catch (error: any) {
      console.error("Get my parents error:", error);
      res.status(500).json({ error: "Failed to retrieve linked parents" });
    }
  }

  /**
   * Remove parent-student link
   * DELETE /api/parent/unlink/:linkId
   */
  static async unlinkStudent(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const linkId = req.params.linkId as string;

      const link = await studentParentRepository.findOne({
        where: { id: linkId },
      });

      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }

      // Only parent or student can unlink
      if (link.parentId !== userId && link.studentId !== userId) {
        return res.status(403).json({ 
          error: "You don't have permission to remove this link" 
        });
      }

      await studentParentRepository.remove(link);

      res.json({ message: "Link removed successfully" });
    } catch (error: any) {
      console.error("Unlink error:", error);
      res.status(500).json({ error: "Failed to remove link" });
    }
  }

  /**
   * Parent views specific student's progress
   * GET /api/parent/student/:studentId/progress
   */
  static async getStudentProgress(req: Request, res: Response) {
    try {
      const parentId = req.session.userId!;
      const studentId = req.params.studentId as string;

      // Verify link exists and is accepted
      const link = await studentParentRepository.findOne({
        where: { 
          parentId, 
          studentId, 
          status: LinkStatus.ACCEPTED 
        },
      });

      if (!link) {
        return res.status(403).json({ 
          error: "You don't have permission to view this student's progress" 
        });
      }

      // Get student's enrollments with progress
      const enrollmentRepository = AppDataSource.getRepository("Enrollment");
      const enrollments = await enrollmentRepository.find({
        where: { studentId },
        relations: ["course"],
        order: { enrolledAt: "DESC" },
      });

      res.json({ 
        studentId,
        enrollments: enrollments.map((enrollment: any) => ({
          courseId: enrollment.course.id,
          courseTitle: enrollment.course.title,
          enrolledAt: enrollment.enrolledAt,
          progressPercentage: enrollment.progressPercentage,
          status: enrollment.status,
          lastAccessedAt: enrollment.lastAccessedAt,
          completedAt: enrollment.completedAt,
        })),
      });
    } catch (error: any) {
      console.error("Get student progress error:", error);
      res.status(500).json({ error: "Failed to retrieve student progress" });
    }
  }
}
