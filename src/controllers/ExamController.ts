import { Response } from "express"; // Added back missing import
import { Request } from "express";
import { AppDataSource } from "../config/data-source";
import { Exam, ExamType } from "../entities/Exam";
import { Course } from "../entities/Course";
import { Enrollment } from "../entities/Enrollment";
import { AnswerSubmission } from "../entities/AnswerSubmission";
import { Question, QuestionType } from "../entities/Question";
import { QuestionOption } from "../entities/QuestionOption";
import { Logger } from "../utils/logger";
import { IsNull } from "typeorm";
import { OCRService } from "../services/OCRService";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

export class ExamController {
    /**
     * Create an Exam
     * POST /api/exams
     */
    static createExam = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { courseId, title, description, examType, language, durationMinutes, totalMarks, passingMarks, examDate, allowLateSubmission, submissionDeadline, maxAttempts, showCorrectAnswers, settings } = req.body;
            const createdById = req.session.userId!;

            if (!courseId || !title || !examType) {
                return res.status(400).json({ error: "courseId, title, and examType are required." });
            }

            const courseRepo = AppDataSource.getRepository(Course);
            const course = await courseRepo.findOne({ where: { id: courseId } });

            if (!course) {
                return res.status(404).json({ error: "Course not found." });
            }
            if (course.instructorId !== createdById) {
                return res.status(403).json({ error: "Only the course instructor can create an exam." });
            }

            const examRepo = AppDataSource.getRepository(Exam);

            const exam = examRepo.create({
                courseId,
                title,
                description,
                examType,
                language,
                durationMinutes,
                totalMarks,
                passingMarks,
                examDate,
                allowLateSubmission: allowLateSubmission || false,
                submissionDeadline,
                maxAttempts: maxAttempts || 1,
                showCorrectAnswers: showCorrectAnswers || false,
                settings,
                createdById
            });

            await examRepo.save(exam);

            return res.status(201).json({ message: "Exam created successfully.", exam });
        } catch (error) {
            Logger.error("Error creating exam:", error);
            return res.status(500).json({ error: "Failed to create exam." });
        }
    };

    /**
     * Get all exams created by current instructor
     * GET /api/exams/my-exams
     */
    static getMyExams = async (req: Request, res: Response): Promise<Response> => {
        try {
            const userId = req.session.userId!;
            const userRole = req.session.userRole;
            const examRepo = AppDataSource.getRepository(Exam);

            const whereCondition = userRole === "admin" ? {} : { createdById: userId };

            const exams = await examRepo.find({
                where: whereCondition,
                relations: ["course"],
                order: { createdAt: "DESC" }
            });

            return res.json({ exams });
        } catch (error) {
            Logger.error("Error fetching my exams:", error);
            return res.status(500).json({ error: "Failed to fetch exams." });
        }
    };

    static getExamsForCourse = async (req: Request, res: Response): Promise<Response> => {
        try {
            const courseId = req.params.courseId as string;
            const examRepo = AppDataSource.getRepository(Exam);

            const exams = await examRepo.find({
                where: { courseId },
                order: { createdAt: "DESC" }
            });

            return res.json({ exams });
        } catch (error) {
            Logger.error("Error fetching exams for course:", error);
            return res.status(500).json({ error: "Failed to fetch exams." });
        }
    };

    /**
     * Get exam details
     * GET /api/exams/:id
     */
    static getExamById = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const examRepo = AppDataSource.getRepository(Exam);

            const exam = await examRepo.findOne({
                where: { id },
                relations: ["questions", "questions.options"]
            });

            if (!exam) return res.status(404).json({ error: "Exam not found." });

            // Sort questions and options
            exam.questions.sort((a, b) => a.orderIndex - b.orderIndex);
            exam.questions.forEach(q => {
                if (q.options) {
                    q.options.sort((a, b) => a.orderIndex - b.orderIndex);
                }
            });

            return res.json({ exam });
        } catch (error) {
            Logger.error("Error fetching exam details:", error);
            return res.status(500).json({ error: "Failed to fetch exam details." });
        }
    };

    /**
     * Update an exam
     * PUT /api/exams/:id
     */
    static updateExam = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const userId = req.session.userId!;
            const updateData = req.body;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id } });

            if (!exam) return res.status(404).json({ error: "Exam not found." });
            if (exam.createdById !== userId) return res.status(403).json({ error: "Only the creator can update this exam." });

            Object.assign(exam, updateData);
            await examRepo.save(exam);

            return res.json({ message: "Exam updated successfully.", exam });
        } catch (error) {
            Logger.error("Error updating exam:", error);
            return res.status(500).json({ error: "Failed to update exam." });
        }
    };

    /**
     * Delete an exam
     * DELETE /api/exams/:id
     */
    static deleteExam = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const userId = req.session.userId!;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id } });

            if (!exam) return res.status(404).json({ error: "Exam not found." });
            if (exam.createdById !== userId) return res.status(403).json({ error: "Only the creator can delete this exam." });

            await examRepo.remove(exam);
            return res.json({ message: "Exam deleted successfully." });
        } catch (error) {
            Logger.error("Error deleting exam:", error);
            return res.status(500).json({ error: "Failed to delete exam." });
        }
    };

    /**
     * Publish an exam
     * PATCH /api/exams/:id/publish
     */
    static publishExam = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const userId = req.session.userId!;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id } });

            if (!exam) return res.status(404).json({ error: "Exam not found." });
            if (exam.createdById !== userId) return res.status(403).json({ error: "Only the creator can publish this exam." });

            exam.isPublished = true;
            await examRepo.save(exam);

            return res.json({ message: "Exam published successfully.", exam });
        } catch (error) {
            Logger.error("Error publishing exam:", error);
            return res.status(500).json({ error: "Failed to publish exam." });
        }
    };

    /**
     * Create a question (MCQ or Essay)
     * POST /api/exams/:examId/questions
     */
    static createQuestion = async (req: Request, res: Response): Promise<Response> => {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const examId = req.params.examId as string;
            const userId = req.session.userId!;
            const { questionText, questionType, marks, options, orderIndex } = req.body;

            const examRepo = queryRunner.manager.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id: examId } });

            if (!exam) {
                await queryRunner.rollbackTransaction();
                return res.status(404).json({ error: "Exam not found." });
            }
            if (exam.createdById !== userId) {
                await queryRunner.rollbackTransaction();
                return res.status(403).json({ error: "Only the creator can add questions." });
            }

            const questionRepo = queryRunner.manager.getRepository(Question);
            const question = questionRepo.create({
                examId,
                questionText,
                questionType,
                marks: marks || Number(0),
                orderIndex: orderIndex || 0
            });

            await questionRepo.save(question);

            // If MCQ, save options
            if ((questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) && options && options.length > 0) {
                const optionRepo = queryRunner.manager.getRepository(QuestionOption);

                const optionEntities = options.map((opt: any, idx: number) => optionRepo.create({
                    questionId: question.id,
                    optionText: opt.optionText,
                    isCorrect: opt.isCorrect || false,
                    orderIndex: opt.orderIndex || idx
                }));

                await optionRepo.save(optionEntities);
                question.options = optionEntities;
            }

            await queryRunner.commitTransaction();

            return res.status(201).json({ message: "Question created.", question });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            Logger.error("Error creating question:", error);
            return res.status(500).json({ error: "Failed to create question." });
        } finally {
            await queryRunner.release();
        }
    };

    /**
     * Get all questions for an exam
     * GET /api/exams/:examId/questions
     */
    static getQuestionsForExam = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const questionRepo = AppDataSource.getRepository(Question);

            const questions = await questionRepo.find({
                where: { examId },
                relations: ["options"],
                order: { orderIndex: "ASC" }
            });

            return res.json({ questions });
        } catch (error) {
            Logger.error("Error fetching questions:", error);
            return res.status(500).json({ error: "Failed to fetch questions." });
        }
    };

    /**
     * Update a question
     * PUT /api/questions/:id
     */
    static updateQuestion = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const { questionText, marks, orderIndex, options } = req.body;

            const questionRepo = AppDataSource.getRepository(Question);
            const question = await questionRepo.findOne({ where: { id }, relations: ["options"] });

            if (!question) return res.status(404).json({ error: "Question not found." });

            if (questionText !== undefined) question.questionText = questionText;
            if (marks !== undefined) question.marks = marks;
            if (orderIndex !== undefined) question.orderIndex = orderIndex;

            await questionRepo.save(question);

            if (options && Array.isArray(options)) {
                // For simplicity, delete old options and recreate
                const optionRepo = AppDataSource.getRepository(QuestionOption);
                await optionRepo.delete({ questionId: id });

                const newOptions = options.map((opt: any, idx: number) => optionRepo.create({
                    questionId: id,
                    optionText: opt.optionText,
                    isCorrect: opt.isCorrect,
                    orderIndex: opt.orderIndex || idx
                }));

                await optionRepo.save(newOptions);
                question.options = newOptions;
            }

            return res.json({ message: "Question updated.", question });
        } catch (error) {
            Logger.error("Error updating question:", error);
            return res.status(500).json({ error: "Failed to update question." });
        }
    };

    /**
     * Delete a question
     * DELETE /api/questions/:id
     */
    static deleteQuestion = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const questionRepo = AppDataSource.getRepository(Question);
            const question = await questionRepo.findOne({ where: { id } });

            if (!question) return res.status(404).json({ error: "Question not found." });

            await questionRepo.remove(question);
            return res.json({ message: "Question deleted successfully." });
        } catch (error) {
            Logger.error("Error deleting question:", error);
            return res.status(500).json({ error: "Failed to delete question." });
        }
    };

    /**
     * Upload Handwritten Answers for an Exam Question
     * POST /api/exams/:examId/questions/:questionId/upload
     */
    static uploadHandwrittenAnswer = async (req: Request, res: Response): Promise<Response> => {
        try {
            const studentId = req.session.userId!;
            const examId = req.params.examId as string;
            const questionId = req.params.questionId as string;

            if (!req.file) {
                return res.status(400).json({ error: "No image file provided." });
            }

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({
                where: { id: examId },
                relations: ["course", "course.enrollments"]
            });

            if (!exam) return res.status(404).json({ error: "Exam not found." });

            // Ensure the student is actually enrolled in this course to be allowed to upload an answer
            const isEnrolled = exam.course.enrollments.some(e => e.studentId === studentId);
            if (!isEnrolled) {
                return res.status(403).json({ error: "You are not enrolled in the designated course for this exam." });
            }

            // Verify question belongs to the exam
            const questionRepo = AppDataSource.getRepository(Question);
            const question = await questionRepo.findOne({ where: { id: questionId, examId } });

            if (!question) {
                return res.status(404).json({ error: "Question not found within this exam." });
            }

            if (question.questionType !== QuestionType.ESSAY && question.questionType !== QuestionType.SHORT_ANSWER) {
                return res.status(400).json({ error: "Handwritten uploads are only permitted for Essay/Short Answer questions." });
            }

            // ── Local disk storage (replaces Cloudinary — no API key required) ─────
            const uploadBaseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
            const answerDir = path.join(uploadBaseDir, "answers", examId, studentId);

            // Ensure directory exists
            if (!fs.existsSync(answerDir)) {
                fs.mkdirSync(answerDir, { recursive: true });
            }

            const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
            const fileName = `${randomUUID()}${ext}`;
            const filePath = path.join(answerDir, fileName);

            // Write buffer to disk
            await fs.promises.writeFile(filePath, req.file.buffer);

            // Build a URL accessible via express.static (index.ts: app.use("/uploads", express.static(uploadDir)))
            const uploadUrl = `/uploads/answers/${examId}/${studentId}/${fileName}`;
            // ─────────────────────────────────────────────────────────────────────

            // Issue 4 Fix: Auto-trigger OCR as a fire-and-forget background task immediately after upload.
            // This ensures OCR text is pre-computed by the time the teacher opens the grading view.
            // Map LMS language to Tesseract lang code (eng / sin / tam)
            const langMap: Record<string, string> = { english: "eng", sinhala: "sin", tamil: "tam" };
            const tesseractLang = langMap[(exam.language ?? "").toLowerCase()] ?? "eng";

            // We need a submission record to attach the OCR text to.
            // Look for an existing DRAFT answer record for this student/question.
            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const existingAnswer = await submissionRepo.findOne({
                where: { examId, questionId, studentId }
            });

            if (existingAnswer) {
                // Trigger OCR in background — do NOT await, so the upload response returns immediately.
                OCRService.extractText(uploadUrl, tesseractLang)
                    .then(async (ocrText) => {
                        await submissionRepo.update(existingAnswer.id, { ocrText });
                        Logger.info(`OCR auto-trigger: submission ${existingAnswer.id} updated with ${ocrText.length} chars (lang: ${tesseractLang})`);
                    })
                    .catch((err) => Logger.error(`OCR auto-trigger failed for submission ${existingAnswer.id}:`, err));
            } else {
                Logger.info(`OCR auto-trigger skipped: no existing submission record found for student ${studentId} / question ${questionId}. OCR will run on grading view.`);
            }

            return res.status(200).json({
                message: "Handwritten answer uploaded successfully",
                questionId: question.id,
                uploadUrl
            });

        } catch (error) {
            Logger.error("Error uploading handwritten answer:", error);
            return res.status(500).json({ error: "Failed to upload answer image." });
        }
    };

    /**
     * Get all published exams available to a student across their enrolled courses
     * Includes submission status and attempt count for each exam
     * GET /api/exams/student/available
     */
    static getStudentAvailableExams = async (req: Request, res: Response): Promise<Response> => {
        try {
            const studentId = req.session.userId!;

            // Get all courses the student is enrolled in
            const enrollmentRepo = AppDataSource.getRepository(Enrollment);
            const enrollments = await enrollmentRepo.find({
                where: { studentId },
                select: ["courseId"]
            });

            if (enrollments.length === 0) {
                return res.json({ exams: [] });
            }

            const courseIds = enrollments.map(e => e.courseId);

            // Get all published exams for those courses with course info
            const examRepo = AppDataSource.getRepository(Exam);
            const exams = await examRepo
                .createQueryBuilder("exam")
                .leftJoinAndSelect("exam.course", "course")
                .leftJoinAndSelect("exam.questions", "questions")
                .where("exam.courseId IN (:...courseIds)", { courseIds })
                .andWhere("exam.isPublished = true")
                .orderBy("exam.createdAt", "DESC")
                .getMany();

            if (exams.length === 0) {
                return res.json({ exams: [] });
            }

            // Get student's submissions for all of these exams in one query
            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const submissions = await submissionRepo
                .createQueryBuilder("sub")
                .where("sub.studentId = :studentId", { studentId })
                .andWhere("sub.examId IN (:...examIds)", { examIds: exams.map(e => e.id) })
                .andWhere("sub.questionId IS NULL")  // master records only
                .orderBy("sub.attemptNumber", "DESC")
                .getMany();

            // Build a map: examId -> { latestStatus, attemptCount }
            const submissionMap: Record<string, { latestStatus: string; attemptCount: number; latestMarks: number | null }> = {};
            for (const sub of submissions) {
                if (!submissionMap[sub.examId]) {
                    submissionMap[sub.examId] = {
                        latestStatus: sub.status,
                        attemptCount: 1,
                        latestMarks: sub.marksAwarded !== null && sub.marksAwarded !== undefined ? Number(sub.marksAwarded) : null,
                    };
                } else {
                    submissionMap[sub.examId].attemptCount += 1;
                }
            }

            // Build response: strip correctAnswer/isCorrect from questions
            const enrichedExams = exams.map(exam => ({
                id: exam.id,
                courseId: exam.courseId,
                title: exam.title,
                description: exam.description,
                examType: exam.examType,
                examDate: exam.examDate,
                durationMinutes: exam.durationMinutes,
                totalMarks: exam.totalMarks,
                passingMarks: exam.passingMarks,
                language: exam.language,
                maxAttempts: exam.maxAttempts,
                showCorrectAnswers: exam.showCorrectAnswers,
                createdAt: exam.createdAt,
                questionCount: exam.questions?.length ?? 0,
                course: exam.course ? { id: exam.course.id, title: exam.course.title } : null,
                submission: submissionMap[exam.id] ?? null,
            }));

            return res.json({ exams: enrichedExams });
        } catch (error) {
            Logger.error("Error fetching student available exams:", error);
            return res.status(500).json({ error: "Failed to fetch available exams." });
        }
    };

    /**
     * Get aggregate statistics for an exam (instructor view)
     * GET /api/exams/:id/stats
     */
    static getExamStats = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.id as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id: examId } });
            if (!exam) return res.status(404).json({ error: "Exam not found." });

            if (exam.createdById !== userId && userRole !== "admin") {
                return res.status(403).json({ error: "Access denied." });
            }

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

            // All master submissions
            const masters = await submissionRepo
                .createQueryBuilder("sub")
                .leftJoinAndSelect("sub.student", "student")
                .where("sub.examId = :examId", { examId })
                .andWhere("sub.questionId IS NULL")
                .orderBy("sub.submittedAt", "DESC")
                .getMany();

            const totalSubmissions = masters.length;
            const gradedSubmissions = masters.filter(m => m.status === "graded");
            const avgScore = gradedSubmissions.length > 0
                ? gradedSubmissions.reduce((s, m) => s + (Number(m.marksAwarded) || 0), 0) / gradedSubmissions.length
                : 0;
            const passingCount = exam.passingMarks
                ? gradedSubmissions.filter(m => Number(m.marksAwarded) >= Number(exam.passingMarks)).length
                : null;

            const recentStudents = masters.slice(0, 20).map(m => ({
                studentId: m.studentId,
                studentName: m.student ? `${m.student.firstName} ${m.student.lastName}` : "Unknown",
                status: m.status,
                marksAwarded: m.marksAwarded !== null ? Number(m.marksAwarded) : null,
                attemptNumber: m.attemptNumber,
                submittedAt: m.submittedAt,
                submissionId: m.id,
            }));

            return res.json({
                examId,
                totalMarks: Number(exam.totalMarks),
                passingMarks: exam.passingMarks ? Number(exam.passingMarks) : null,
                totalSubmissions,
                gradedCount: gradedSubmissions.length,
                pendingGradingCount: masters.filter(m => m.status === "submitted").length,
                averageScore: Math.round(avgScore * 100) / 100,
                passCount: passingCount,
                failCount: passingCount !== null ? gradedSubmissions.length - passingCount : null,
                passRate: passingCount !== null && gradedSubmissions.length > 0
                    ? Math.round((passingCount / gradedSubmissions.length) * 100)
                    : null,
                recentStudents,
            });
        } catch (error) {
            Logger.error("Error fetching exam stats:", error);
            return res.status(500).json({ error: "Failed to fetch exam statistics." });
        }
    };
}
