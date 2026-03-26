import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { Course } from "../entities/Course";
import { Enrollment } from "../entities/Enrollment";
import { Lesson } from "../entities/Lesson";
import { LessonProgress } from "../entities/LessonProgress";
import { AnswerSubmission, SubmissionStatus } from "../entities/AnswerSubmission";
import { Exam } from "../entities/Exam";
import { Booking, BookingStatus } from "../entities/Booking";
import { Payment, PaymentStatus } from "../entities/Payment";
import { Payout, PayoutStatus } from "../entities/Payout";
import { TeacherProfile } from "../entities/TeacherProfile";
import { Session, SessionStatus } from "../entities/Session";

// ─────────────────────────────────────────────────────────────────
// STORY 7.1  Teacher → student progress in their courses
// GET /api/analytics/teacher/students?courseId=
// ─────────────────────────────────────────────────────────────────
export const getTeacherStudents = async (req: Request, res: Response): Promise<Response> => {
  try {
    const teacherId = req.session.userId!;
    const { courseId } = req.query as { courseId?: string };

    const enrollmentRepo = AppDataSource.getRepository(Enrollment);

    // Build query for enrollments in teacher's courses
    const qb = enrollmentRepo
      .createQueryBuilder("e")
      .innerJoin("e.course", "c", "c.instructor_id = :teacherId", { teacherId })
      .innerJoin("e.student", "s")
      .leftJoin("e.lessonProgress", "lp")
      .leftJoin("lp.lesson", "l")
      .select([
        "e.id AS enrollmentId",
        "e.student_id AS studentId",
        "s.firstName AS firstName",
        "s.lastName AS lastName",
        "s.email AS email",
        "c.id AS courseId",
        "c.title AS courseTitle",
        "e.progressPercentage AS progress",
        "e.last_accessed_at AS lastActive",
        "e.status AS enrollmentStatus",
        "e.enrolled_at AS enrolledAt",
        "COUNT(DISTINCT l.id) AS totalLessons",
        "COUNT(DISTINCT CASE WHEN lp.is_completed = true THEN lp.id END) AS completedLessons",
      ])
      .groupBy("e.id, e.student_id, s.firstName, s.lastName, s.email, c.id, c.title, e.progress_percentage, e.last_accessed_at, e.status, e.enrolled_at");

    if (courseId) {
      qb.andWhere("c.id = :courseId", { courseId });
    }

    const enrollments = await qb.getRawMany();

    // For each enrollment, get average exam score
    const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

    const results = await Promise.all(
      enrollments.map(async (enr) => {
        // Get master submissions (questionId IS NULL) that are graded, for exams in this course
        const scoreRow = await submissionRepo
          .createQueryBuilder("sub")
          .innerJoin("sub.exam", "exam", "exam.course_id = :courseId", { courseId: enr.courseId })
          .select("AVG(sub.marks_awarded / exam.total_marks * 100)", "avgScore")
          .addSelect("COUNT(sub.id)", "examCount")
          .where("sub.student_id = :studentId", { studentId: enr.studentId })
          .andWhere("sub.question_id IS NULL")
          .andWhere("sub.status IN (:...statuses)", { statuses: [SubmissionStatus.GRADED, SubmissionStatus.RETURNED] })
          .getRawOne();

        return {
          enrollmentId: enr.enrollmentId,
          studentId: enr.studentId,
          name: `${enr.firstName} ${enr.lastName ?? ""}`.trim(),
          email: enr.email,
          courseId: enr.courseId,
          courseTitle: enr.courseTitle,
          progress: Number(enr.progress ?? 0),
          lastActive: enr.lastActive,
          enrolledAt: enr.enrolledAt,
          enrollmentStatus: enr.enrollmentStatus,
          totalLessons: Number(enr.totalLessons ?? 0),
          completedLessons: Number(enr.completedLessons ?? 0),
          avgExamScore: scoreRow?.avgScore != null ? Number(Number(scoreRow.avgScore).toFixed(1)) : null,
          examCount: Number(scoreRow?.examCount ?? 0),
        };
      })
    );

    return res.json({ students: results, total: results.length });
  } catch (err) {
    console.error("[Analytics] getTeacherStudents:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.2  Student → own exam performance history
// GET /api/analytics/student/exams
// ─────────────────────────────────────────────────────────────────
export const getStudentExams = async (req: Request, res: Response): Promise<Response> => {
  try {
    const studentId = req.session.userId!;

    const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

    const submissions = await submissionRepo
      .createQueryBuilder("sub")
      .innerJoin("sub.exam", "exam")
      .leftJoin("exam.course", "course")
      .select([
        "sub.id AS submissionId",
        "sub.exam_id AS examId",
        "exam.title AS examTitle",
        "exam.exam_type AS examType",
        "exam.total_marks AS totalMarks",
        "exam.passing_marks AS passingMarks",
        "sub.marks_awarded AS marksAwarded",
        "sub.submitted_at AS submittedAt",
        "sub.graded_at AS gradedAt",
        "sub.time_spent_minutes AS timeSpentMinutes",
        "sub.attempt_number AS attemptNumber",
        "sub.status AS status",
        "course.title AS courseTitle",
        "course.id AS courseId",
      ])
      .where("sub.student_id = :studentId", { studentId })
      .andWhere("sub.question_id IS NULL")
      .andWhere("sub.status IN (:...statuses)", {
        statuses: [SubmissionStatus.GRADED, SubmissionStatus.RETURNED, SubmissionStatus.SUBMITTED],
      })
      .orderBy("sub.submitted_at", "DESC")
      .getRawMany();

    const exams = submissions.map((s) => {
      const marks = Number(s.marksAwarded ?? 0);
      const total = Number(s.totalMarks ?? 1);
      const score = total > 0 ? Number(((marks / total) * 100).toFixed(1)) : 0;
      
      // Only calculate pass/fail if the exam is actually graded
      const isGraded = s.status === SubmissionStatus.GRADED || s.status === SubmissionStatus.RETURNED;
      const passed = (isGraded && s.passingMarks != null) ? marks >= Number(s.passingMarks) : null;

      return {
        submissionId: s.submissionId,
        examId: s.examId,
        examTitle: s.examTitle,
        examType: s.examType,
        courseId: s.courseId,
        courseTitle: s.courseTitle,
        marksAwarded: marks,
        totalMarks: total,
        scorePercent: score,
        passed,
        submittedAt: s.submittedAt,
        gradedAt: s.gradedAt,
        timeSpentMinutes: s.timeSpentMinutes ? Number(s.timeSpentMinutes) : null,
        attemptNumber: Number(s.attemptNumber),
      };
    });

    // Calculate trend: compare average of most-recent 3 vs previous 3
    const scores = exams.map((e) => e.scorePercent);
    let trend: "improving" | "declining" | "stable" = "stable";
    if (scores.length >= 6) {
      const recent3 = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const prior3 = scores.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
      if (recent3 > prior3 + 5) trend = "improving";
      else if (recent3 < prior3 - 5) trend = "declining";
    }

    const averageScore = exams.length
      ? Number((exams.reduce((a, e) => a + e.scorePercent, 0) / exams.length).toFixed(1))
      : 0;

    return res.json({ exams, averageScore, trend, total: exams.length });
  } catch (err) {
    console.error("[Analytics] getStudentExams:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.3  Teacher → attendance tracking
// GET /api/analytics/teacher/attendance?courseId=
// ─────────────────────────────────────────────────────────────────
export const getTeacherAttendance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const teacherId = req.session.userId!;
    const { courseId } = req.query as { courseId?: string };

    const bookingRepo = AppDataSource.getRepository(Booking);

    const qb = bookingRepo
      .createQueryBuilder("b")
      .innerJoin("b.student", "s")
      .select([
        "b.student_id AS studentId",
        "s.firstName AS firstName",
        "s.lastName AS lastName",
        "s.email AS email",
        "COUNT(CASE WHEN b.status = :completed THEN 1 END) AS sessionsAttended",
        "COUNT(CASE WHEN b.status = :noShow THEN 1 END) AS noShows",
        "COUNT(b.id) AS totalScheduled",
      ])
      .where("b.teacher_id = :teacherId", { teacherId })
      .andWhere("b.status IN (:...statuses)", {
        statuses: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW],
      })
      .setParameter("completed", BookingStatus.COMPLETED)
      .setParameter("noShow", BookingStatus.NO_SHOW)
      .groupBy("b.student_id, s.firstName, s.lastName, s.email")
      .orderBy("sessionsAttended", "DESC");

    // If courseId provided, filter bookings bound to sessions in that course class
    // (Booking → Session → Class → Course). If no such link, return all teacher bookings.
    if (courseId) {
      qb.innerJoin(Session, "sess", "sess.booking_id = b.id")
        .innerJoin("sess.class", "cls", "cls.course_id = :courseId", { courseId });
    }

    const rows = await qb.getRawMany();

    const perStudent = rows.map((r) => {
      const attended = Number(r.sessionsAttended ?? 0);
      const noShows = Number(r.noShows ?? 0);
      const total = attended + noShows;
      return {
        studentId: r.studentId,
        name: `${r.firstName} ${r.lastName ?? ""}`.trim(),
        email: r.email,
        sessionsAttended: attended,
        noShows,
        totalScheduled: total,
        attendanceRate: total > 0 ? Number(((attended / total) * 100).toFixed(1)) : 0,
      };
    });

    const overallRate =
      perStudent.length > 0
        ? Number(
            (
              perStudent.reduce((a, s) => a + s.attendanceRate, 0) / perStudent.length
            ).toFixed(1)
          )
        : 0;

    return res.json({ students: perStudent, overallAttendanceRate: overallRate, total: perStudent.length });
  } catch (err) {
    console.error("[Analytics] getTeacherAttendance:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.4  Student → learning history timeline
// GET /api/analytics/student/timeline
// ─────────────────────────────────────────────────────────────────
export const getStudentTimeline = async (req: Request, res: Response): Promise<Response> => {
  try {
    const studentId = req.session.userId!;

    const enrollmentRepo = AppDataSource.getRepository(Enrollment);
    const lpRepo = AppDataSource.getRepository(LessonProgress);
    const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

    const [enrollments, lessonCompletions, examSubmissions] = await Promise.all([
      // Enrollment events
      enrollmentRepo
        .createQueryBuilder("e")
        .innerJoin("e.course", "c")
        .select(["e.enrolled_at AS eventDate", "c.title AS title", "c.id AS referenceId", "e.status AS status"])
        .where("e.student_id = :studentId", { studentId })
        .getRawMany(),

      // Lesson completion events
      lpRepo
        .createQueryBuilder("lp")
        .innerJoin("lp.enrollment", "e", "e.student_id = :studentId", { studentId })
        .innerJoin("lp.lesson", "l")
        .innerJoin("l.course", "c")
        .select([
          "lp.completed_at AS eventDate",
          "l.title AS title",
          "l.id AS referenceId",
          "c.title AS courseTitle",
        ])
        .where("lp.is_completed = true")
        .andWhere("lp.completed_at IS NOT NULL")
        .getRawMany(),

      // Exam graded/submitted events (master only)
      submissionRepo
        .createQueryBuilder("sub")
        .innerJoin("sub.exam", "exam")
        .leftJoin("exam.course", "c")
        .select([
          "COALESCE(sub.graded_at, sub.submitted_at) AS eventDate",
          "exam.title AS title",
          "sub.id AS referenceId",
          "sub.marksAwarded AS marksAwarded",
          "exam.totalMarks AS totalMarks",
          "sub.status AS status",
          "c.title AS courseTitle",
        ])
        .where("sub.student_id = :studentId", { studentId })
        .andWhere("sub.question_id IS NULL")
        .andWhere("sub.status IN (:...statuses)", {
          statuses: [SubmissionStatus.GRADED, SubmissionStatus.RETURNED, SubmissionStatus.SUBMITTED],
        })
        .getRawMany(),
    ]);

    const events: Array<{
      type: string;
      title: string;
      subtitle?: string;
      referenceId: string;
      eventDate: Date | string;
      meta?: Record<string, unknown>;
    }> = [
      ...enrollments.map((e) => ({
        type: "enrollment" as const,
        title: `Enrolled in "${e.title}"`,
        referenceId: e.referenceId,
        eventDate: e.eventDate,
        meta: { status: e.status },
      })),
      ...lessonCompletions.map((l) => ({
        type: "lesson_completed" as const,
        title: `Completed lesson: "${l.title}"`,
        subtitle: l.courseTitle,
        referenceId: l.referenceId,
        eventDate: l.eventDate,
      })),
      ...examSubmissions.map((s) => {
        const score =
          s.totalMarks > 0
            ? Number(((s.marksAwarded / s.totalMarks) * 100).toFixed(1))
            : null;
        
        const isGraded = s.status === SubmissionStatus.GRADED || s.status === SubmissionStatus.RETURNED;
        return {
          type: "exam_graded" as const,
          title: isGraded ? `Exam graded: "${s.title}"` : `Exam submitted: "${s.title}"`,
          subtitle: s.courseTitle,
          referenceId: s.referenceId,
          eventDate: s.eventDate,
          meta: { marksAwarded: s.marksAwarded, totalMarks: s.totalMarks, scorePercent: score },
        };
      }),
    ];

    // Sort by date descending
    events.sort((a, b) => {
      const da = new Date(a.eventDate).getTime();
      const db = new Date(b.eventDate).getTime();
      return db - da;
    });

    return res.json({ events, total: events.length });
  } catch (err) {
    console.error("[Analytics] getStudentTimeline:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.5  Teacher → earnings summary
// GET /api/analytics/teacher/summary
// ─────────────────────────────────────────────────────────────────
export const getTeacherSummary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const teacherId = req.session.userId!;

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payoutRepo = AppDataSource.getRepository(Payout);
    const profileRepo = AppDataSource.getRepository(TeacherProfile);
    const enrollmentRepo = AppDataSource.getRepository(Enrollment);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [earningsRow, thisMonthRow, pendingRow, profile, activeStudents] = await Promise.all([
      // All-time net earnings (amount - platformFee)
      paymentRepo
        .createQueryBuilder("p")
        .select('SUM(p.amount - COALESCE(p."platformFee", 0))', "totalEarnings")
        .where("p.recipient_id = :teacherId", { teacherId })
        .andWhere("p.paymentStatus = :status", { status: PaymentStatus.COMPLETED })
        .getRawOne(),

      // This month earnings
      paymentRepo
        .createQueryBuilder("p")
        .select('SUM(p.amount - COALESCE(p."platformFee", 0))', "monthEarnings")
        .where("p.recipient_id = :teacherId", { teacherId })
        .andWhere("p.paymentStatus = :status", { status: PaymentStatus.COMPLETED })
        .andWhere("p.payment_date >= :monthStart", { monthStart })
        .getRawOne(),

      // Pending payouts
      payoutRepo
        .createQueryBuilder("pay")
        .select("SUM(pay.amount)", "pendingAmount")
        .where("pay.teacher_id = :teacherId", { teacherId })
        .andWhere("pay.status = :status", { status: PayoutStatus.PENDING })
        .getRawOne(),

      // Teacher profile (rating, totalStudents, totalSessions)
      profileRepo.findOne({ where: { teacherId } }),

      // Active students (enrollments in teacher's courses that are active)
      enrollmentRepo
        .createQueryBuilder("e")
        .innerJoin("e.course", "c", "c.instructor_id = :teacherId", { teacherId })
        .select("COUNT(DISTINCT e.student_id)", "activeStudents")
        .where("e.status = 'active'")
        .getRawOne(),
    ]);

    return res.json({
      totalEarnings: Number(earningsRow?.totalEarnings ?? 0),
      thisMonthEarnings: Number(thisMonthRow?.monthEarnings ?? 0),
      pendingPayout: Number(pendingRow?.pendingAmount ?? 0),
      rating: profile?.rating ? Number(profile.rating) : null,
      ratingCount: profile?.ratingCount ?? 0,
      totalStudents: profile?.totalStudents ?? Number(activeStudents?.activeStudents ?? 0),
      totalSessions: profile?.totalSessions ?? 0,
    });
  } catch (err) {
    console.error("[Analytics] getTeacherSummary:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.5 (chart)  Teacher → earnings over time
// GET /api/analytics/teacher/earnings?period=monthly|weekly
// ─────────────────────────────────────────────────────────────────
export const getTeacherEarnings = async (req: Request, res: Response): Promise<Response> => {
  try {
    const teacherId = req.session.userId!;
    const { period = "monthly" } = req.query as { period?: string };

    const paymentRepo = AppDataSource.getRepository(Payment);

    let groupExpr: string;
    let labelExpr: string;
    if (period === "weekly") {
      groupExpr = "TO_CHAR(DATE_TRUNC('week', p.payment_date), 'IYYY-IW')";
      labelExpr = "CONCAT('Week ', TO_CHAR(p.payment_date, 'IW'), ' ', TO_CHAR(p.payment_date, 'IYYY'))";
    } else {
      groupExpr = "TO_CHAR(p.payment_date, 'YYYY-MM')";
      labelExpr = "TO_CHAR(p.payment_date, 'Mon YYYY')";
    }

    const rows = await paymentRepo
      .createQueryBuilder("p")
      .select(labelExpr, "label")
      .addSelect(groupExpr, "period")
      .addSelect('SUM(p.amount - COALESCE(p."platformFee", 0))', "earnings")
      .addSelect("COUNT(p.id)", "transactions")
      .where("p.recipient_id = :teacherId", { teacherId })
      .andWhere("p.paymentStatus = :status", { status: PaymentStatus.COMPLETED })
      .groupBy(groupExpr)
      .addGroupBy(labelExpr)
      .orderBy(groupExpr, "ASC")
      .limit(12)
      .getRawMany();

    const data = rows.map((r) => ({
      label: r.label,
      earnings: Number(r.earnings ?? 0),
      transactions: Number(r.transactions ?? 0),
    }));

    return res.json({ data, period });
  } catch (err) {
    console.error("[Analytics] getTeacherEarnings:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.6  Teacher → course performance deep dive
// GET /api/analytics/teacher/course/:courseId/performance
// ─────────────────────────────────────────────────────────────────
export const getCoursePerformance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const teacherId = req.session.userId!;
    const courseId = req.params.courseId as string;

    const courseRepo = AppDataSource.getRepository(Course);
    const enrollmentRepo = AppDataSource.getRepository(Enrollment);
    const lessonRepo = AppDataSource.getRepository(Lesson);
    const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

    // Verify the course belongs to the teacher (or requester is admin)
    const course = await courseRepo.findOne({ where: { id: courseId } });
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (
      req.session.userRole !== "admin" &&
      course.instructorId !== teacherId
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [enrollmentStats, lessonStats, submissionRows] = await Promise.all([
      // Enrollment counts
      enrollmentRepo
        .createQueryBuilder("e")
        .select([
          "COUNT(e.id) AS totalEnrolled",
          "COUNT(CASE WHEN e.status = 'completed' THEN 1 END) AS completed",
          "COUNT(CASE WHEN e.status = 'active' THEN 1 END) AS active",
        ])
        .where("e.course_id = :courseId", { courseId })
        .getRawOne(),

      // Lesson engagement
      lessonRepo
        .createQueryBuilder("l")
        .leftJoin(LessonProgress, "lp", "lp.lesson_id = l.id")
        .select([
          "l.id AS lessonId",
          "l.title AS lessonTitle",
          "l.sort_order AS sortOrder",
          "COUNT(DISTINCT lp.enrollment_id) AS studentsStarted",
          "COUNT(DISTINCT CASE WHEN lp.is_completed = true THEN lp.enrollment_id END) AS studentsCompleted",
        ])
        .where("l.course_id = :courseId", { courseId })
        .groupBy("l.id, l.title, l.sort_order")
        .orderBy("l.sort_order", "ASC")
        .getRawMany(),

      // Exam scores per student (master submissions only)
      submissionRepo
        .createQueryBuilder("sub")
        .innerJoin("sub.exam", "exam", "exam.course_id = :courseId", { courseId })
        .innerJoin("sub.student", "s")
        .select([
          "sub.student_id AS studentId",
          "s.firstName AS firstName",
          "s.lastName AS lastName",
          "AVG(sub.marks_awarded / exam.total_marks * 100) AS avgScore",
          "COUNT(sub.id) AS examsTaken",
        ])
        .where("sub.question_id IS NULL")
        .andWhere("sub.status IN (:...statuses)", {
          statuses: [SubmissionStatus.GRADED, SubmissionStatus.RETURNED],
        })
        .groupBy("sub.studentId, s.firstName, s.lastName")
        .getRawMany(),
    ]);

    const totalEnrolled = Number(enrollmentStats?.totalEnrolled ?? 0);
    const completionRate =
      totalEnrolled > 0
        ? Number(((Number(enrollmentStats?.completed ?? 0) / totalEnrolled) * 100).toFixed(1))
        : 0;

    const studentScores = submissionRows.map((r) => ({
      studentId: r.studentId,
      name: `${r.firstName} ${r.lastName ?? ""}`.trim(),
      avgScore: Number(Number(r.avgScore ?? 0).toFixed(1)),
      examsTaken: Number(r.examsTaken),
    }));

    const avgCourseScore =
      studentScores.length > 0
        ? Number(
            (studentScores.reduce((a, s) => a + s.avgScore, 0) / studentScores.length).toFixed(1)
          )
        : 0;

    const sorted = [...studentScores].sort((a, b) => b.avgScore - a.avgScore);
    const topPerformers = sorted.slice(0, 5);
    const needsAttention = sorted.slice(-5).reverse().filter((s) => s.avgScore < 50);

    const lessonEngagement = lessonStats.map((l) => ({
      lessonId: l.lessonId,
      lessonTitle: l.lessonTitle,
      sortOrder: Number(l.sortOrder),
      studentsStarted: Number(l.studentsStarted ?? 0),
      studentsCompleted: Number(l.studentsCompleted ?? 0),
      completionRate:
        Number(l.studentsStarted) > 0
          ? Number(
              ((Number(l.studentsCompleted) / Number(l.studentsStarted)) * 100).toFixed(1)
            )
          : 0,
    }));

    return res.json({
      courseId,
      courseTitle: course.title,
      totalEnrolled,
      completionRate,
      averageScore: avgCourseScore,
      topPerformers,
      needsAttention,
      lessonEngagement,
    });
  } catch (err) {
    console.error("[Analytics] getCoursePerformance:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.7  Admin → platform usage summary
// GET /api/analytics/admin/summary
// ─────────────────────────────────────────────────────────────────
export const getAdminSummary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const courseRepo = AppDataSource.getRepository(Course);
    const paymentRepo = AppDataSource.getRepository(Payment);
    const sessionRepo = AppDataSource.getRepository(Session);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [userCounts, courseCounts, revenueRow, activeSessionsToday, newUsersThisMonth] =
      await Promise.all([
        // User counts by role
        userRepo
          .createQueryBuilder("u")
          .select("u.role AS role")
          .addSelect("COUNT(u.id)", "count")
          .where("u.is_active = true")
          .groupBy("u.role")
          .getRawMany(),

        // Course counts by status
        courseRepo
          .createQueryBuilder("c")
          .select("c.status AS status")
          .addSelect("COUNT(c.id)", "count")
          .groupBy("c.status")
          .getRawMany(),

        // Revenue totals
        paymentRepo
          .createQueryBuilder("p")
          .select([
            "SUM(p.amount) AS totalRevenue",
            'SUM(COALESCE(p."platformFee", 0)) AS totalCommission',
            'SUM(COALESCE(p."refundAmount", 0)) AS totalRefunds',
          ])
          .where("p.paymentStatus = :status", { status: PaymentStatus.COMPLETED })
          .getRawOne(),

        // Active sessions today
        sessionRepo
          .createQueryBuilder("s")
          .select("COUNT(s.id)", "count")
          .where("s.session_start_time >= :todayStart", { todayStart })
          .andWhere("s.status = :status", { status: SessionStatus.IN_PROGRESS })
          .getRawOne(),

        // New users this month
        userRepo
          .createQueryBuilder("u")
          .select("COUNT(u.id)", "count")
          .where("u.created_at >= :monthStart", {
            monthStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          })
          .getRawOne(),
      ]);

    const roleCounts = Object.fromEntries(
      userCounts.map((r: { role: string; count: string }) => [r.role, Number(r.count)])
    );
    const courseStatusCounts = Object.fromEntries(
      courseCounts.map((r: { status: string; count: string }) => [r.status, Number(r.count)])
    );

    return res.json({
      totalUsers: userCounts.reduce((a: number, r: { count: string }) => a + Number(r.count), 0),
      totalStudents: roleCounts["student"] ?? 0,
      totalTeachers: roleCounts["instructor"] ?? 0,
      totalParents: roleCounts["parent"] ?? 0,
      totalAdmins: roleCounts["admin"] ?? 0,
      totalCourses: Object.values(courseStatusCounts).reduce((a, b) => a + (b as number), 0),
      publishedCourses: courseStatusCounts["published"] ?? 0,
      totalRevenue: Number(revenueRow?.totalRevenue ?? 0),
      totalCommission: Number(revenueRow?.totalCommission ?? 0),
      totalRefunds: Number(revenueRow?.totalRefunds ?? 0),
      activeSessionsToday: Number(activeSessionsToday?.count ?? 0),
      newUsersThisMonth: Number(newUsersThisMonth?.count ?? 0),
    });
  } catch (err) {
    console.error("[Analytics] getAdminSummary:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.8  Admin → revenue analytics by period
// GET /api/analytics/admin/revenue?period=monthly|weekly
// ─────────────────────────────────────────────────────────────────
export const getAdminRevenue = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { period = "monthly" } = req.query as { period?: string };

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payoutRepo = AppDataSource.getRepository(Payout);

    let groupExpr: string;
    let labelExpr: string;
    if (period === "weekly") {
      groupExpr = "TO_CHAR(DATE_TRUNC('week', p.payment_date), 'IYYY-IW')";
      labelExpr = "CONCAT('Week ', TO_CHAR(p.payment_date, 'IW'), ' ', TO_CHAR(p.payment_date, 'IYYY'))";
    } else {
      groupExpr = "TO_CHAR(p.payment_date, 'YYYY-MM')";
      labelExpr = "TO_CHAR(p.payment_date, 'Mon YYYY')";
    }

    const [revenueRows, payoutRows] = await Promise.all([
      paymentRepo
        .createQueryBuilder("p")
        .select(labelExpr, "label")
        .addSelect(groupExpr, "period")
        .addSelect("SUM(p.amount)", "grossRevenue")
        .addSelect('SUM(COALESCE(p."platformFee", 0))', "commission")
        .addSelect('SUM(COALESCE(p."refundAmount", 0))', "refunds")
        .where("p.paymentStatus = :status", { status: PaymentStatus.COMPLETED })
        .groupBy(groupExpr)
        .addGroupBy(labelExpr)
        .orderBy(groupExpr, "ASC")
        .limit(12)
        .getRawMany(),

      payoutRepo
        .createQueryBuilder("pay")
        .select("TO_CHAR(pay.period_end, 'YYYY-MM')", "period")
        .addSelect("SUM(pay.amount)", "payouts")
        .where("pay.status IN (:...statuses)", {
          statuses: [PayoutStatus.COMPLETED, PayoutStatus.PROCESSING],
        })
        .andWhere("pay.period_end IS NOT NULL")
        .groupBy("TO_CHAR(pay.period_end, 'YYYY-MM')")
        .orderBy("TO_CHAR(pay.period_end, 'YYYY-MM')", "ASC")
        .limit(12)
        .getRawMany(),
    ]);

    // Merge payout data into revenue rows
    const payoutMap = Object.fromEntries(payoutRows.map((r) => [r.period, Number(r.payouts ?? 0)]));

    const data = revenueRows.map((r) => {
      const gross = Number(r.grossRevenue ?? 0);
      const commission = Number(r.commission ?? 0);
      const refunds = Number(r.refunds ?? 0);
      const payouts = payoutMap[r.period] ?? 0;
      return {
        label: r.label,
        period: r.period,
        grossRevenue: gross,
        netRevenue: Number((gross - refunds).toFixed(2)),
        commission,
        refunds,
        payouts,
      };
    });

    return res.json({ data, period });
  } catch (err) {
    console.error("[Analytics] getAdminRevenue:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// STORY 7.9  Admin → teacher activity table
// GET /api/analytics/admin/teachers
// ─────────────────────────────────────────────────────────────────
export const getAdminTeachers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const userRepo = AppDataSource.getRepository(User);

    const rows = await userRepo
      .createQueryBuilder("u")
      .innerJoin(TeacherProfile, "tp", "tp.teacher_id = u.id")
      .leftJoin(
        (qb) =>
          qb
            .from(Course, "c")
            .select("c.instructor_id", "instructor_id")
            .addSelect("COUNT(c.id)", "course_count")
            .groupBy("c.instructor_id"),
        "cc",
        "cc.instructor_id = u.id"
      )
      .leftJoin(
        (qb) =>
          qb
            .from(Booking, "b")
            .select("b.teacher_id", "teacher_id")
            .addSelect("COUNT(b.id)", "session_count")
            .where("b.status = :bStatus", { bStatus: BookingStatus.COMPLETED })
            .groupBy("b.teacher_id"),
        "bc",
        "bc.teacher_id = u.id"
      )
      .leftJoin(
        (qb) =>
          qb
            .from(Payment, "p")
            .select("p.recipient_id", "recipient_id")
            .addSelect('SUM(p.amount - COALESCE(p."platformFee", 0))', "total_earnings")
            .where("p.payment_status = :pStatus", { pStatus: PaymentStatus.COMPLETED })
            .groupBy("p.recipient_id"),
        "ec",
        "ec.recipient_id = u.id"
      )
      .select([
        "u.id AS id",
        "u.first_name AS \"firstName\"",
        "u.last_name AS \"lastName\"",
        "u.email AS email",
        "u.last_login_at AS \"lastActive\"",
        "u.is_active AS \"isActive\"",
        "tp.rating AS rating",
        "tp.rating_count AS \"ratingCount\"",
        "tp.verified AS verified",
        "COALESCE(cc.course_count, 0) AS \"coursesCreated\"",
        "COALESCE(bc.session_count, 0) AS \"sessionsConducted\"",
        "COALESCE(ec.total_earnings, 0) AS \"totalEarnings\"",
      ])
      .where("u.role = 'instructor'")
      .orderBy("ec.total_earnings", "DESC")
      .getRawMany();

    const teachers = rows.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName ?? ""}`.trim(),
      email: r.email,
      lastActive: r.lastActive,
      isActive: r.isActive === 1 || r.isActive === true,
      rating: r.rating ? Number(r.rating) : null,
      ratingCount: Number(r.ratingCount ?? 0),
      verified: r.verified === 1 || r.verified === true,
      coursesCreated: Number(r.coursesCreated ?? 0),
      sessionsConducted: Number(r.sessionsConducted ?? 0),
      totalEarnings: Number(r.totalEarnings ?? 0),
    }));

    return res.json({ teachers, total: teachers.length });
  } catch (err) {
    console.error("[Analytics] getAdminTeachers:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
