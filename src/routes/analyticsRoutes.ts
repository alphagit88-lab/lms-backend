import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  getTeacherStudents,
  getTeacherAttendance,
  getTeacherSummary,
  getTeacherEarnings,
  getCoursePerformance,
  getStudentExams,
  getStudentTimeline,
  getAdminSummary,
  getAdminRevenue,
  getAdminTeachers,
} from "../controllers/AnalyticsController";

const router = Router();

// ── Teacher endpoints ─────────────────────────────────────────────
// 7.1  Student progress in teacher's courses
router.get(
  "/teacher/students",
  authenticate,
  authorize("instructor", "admin"),
  getTeacherStudents
);

// 7.3  Attendance (bookings completed/no-show per student)
router.get(
  "/teacher/attendance",
  authenticate,
  authorize("instructor", "admin"),
  getTeacherAttendance
);

// 7.5  Earnings summary (KPI cards)
router.get(
  "/teacher/summary",
  authenticate,
  authorize("instructor", "admin"),
  getTeacherSummary
);

// 7.5  Earnings chart data (monthly / weekly)
router.get(
  "/teacher/earnings",
  authenticate,
  authorize("instructor", "admin"),
  getTeacherEarnings
);

// 7.6  Course performance deep-dive
router.get(
  "/teacher/course/:courseId/performance",
  authenticate,
  authorize("instructor", "admin"),
  getCoursePerformance
);

// ── Student endpoints ─────────────────────────────────────────────
// 7.2  Exam performance history
router.get("/student/exams", authenticate, getStudentExams);

// 7.4  Learning history timeline
router.get("/student/timeline", authenticate, getStudentTimeline);

// ── Admin endpoints ───────────────────────────────────────────────
// 7.7  Platform usage summary
router.get("/admin/summary", authenticate, authorize("admin"), getAdminSummary);

// 7.8  Revenue by period
router.get("/admin/revenue", authenticate, authorize("admin"), getAdminRevenue);

// 7.9  Teacher activity table
router.get("/admin/teachers", authenticate, authorize("admin"), getAdminTeachers);

export default router;
