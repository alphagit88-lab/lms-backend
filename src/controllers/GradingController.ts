import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Exam } from "../entities/Exam";
import { Question } from "../entities/Question";
import { AnswerSubmission, SubmissionStatus } from "../entities/AnswerSubmission";
import { Logger } from "../utils/logger";
import { IsNull, Not } from "typeorm";
import { OCRService } from "../services/OCRService";
import { PDFService } from "../services/PDFService";

export class GradingController {
    /**
     * Get all submissions for an exam (for instructor grading view)
     * GET /api/grading/exam/:examId/submissions
     */
    static getSubmissionsForExam = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({
                where: { id: examId },
                relations: ["questions", "questions.options"]
            });

            if (!exam) return res.status(404).json({ error: "Exam not found." });

            // Allow creator OR admin
            if (exam.createdById !== userId && userRole !== "admin") {
                return res.status(403).json({ error: "Only the exam creator or admin can view submissions." });
            }

            // Get all master submissions (questionId is null = master record)
            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const masterSubmissions = await submissionRepo.find({
                where: { examId, questionId: IsNull() },
                relations: ["student"],
                order: { submittedAt: "DESC" }
            });

            // For each master submission, get the individual question answers
            const enrichedSubmissions = await Promise.all(
                masterSubmissions.map(async (master) => {
                    const answers = await submissionRepo.find({
                        where: {
                            examId,
                            studentId: master.studentId,
                            attemptNumber: master.attemptNumber,
                            questionId: Not(IsNull())
                        },
                        order: { createdAt: "ASC" }
                    });

                    return {
                        id: master.id,
                        studentId: master.studentId,
                        studentName: master.student
                            ? `${master.student.firstName} ${master.student.lastName}`
                            : "Unknown",
                        studentEmail: master.student?.email || "",
                        attemptNumber: master.attemptNumber,
                        status: master.status,
                        marksAwarded: master.marksAwarded,
                        timeSpentMinutes: master.timeSpentMinutes,
                        submittedAt: master.submittedAt,
                        feedback: master.feedback,
                        answers: answers.map(a => ({
                            id: a.id,
                            questionId: a.questionId,
                            answerText: a.answerText,
                            uploadUrl: a.uploadUrl,
                            ocrText: a.ocrText,
                            marksAwarded: a.marksAwarded,
                            status: a.status,
                            feedback: a.feedback
                        }))
                    };
                })
            );

            return res.json({
                exam: {
                    id: exam.id,
                    title: exam.title,
                    totalMarks: exam.totalMarks,
                    passingMarks: exam.passingMarks,
                    questions: exam.questions.sort((a, b) => a.orderIndex - b.orderIndex)
                },
                submissions: enrichedSubmissions
            });
        } catch (error) {
            Logger.error("Error fetching exam submissions for grading:", error);
            return res.status(500).json({ error: "Failed to fetch submissions." });
        }
    };

    /**
     * Grade a specific student answer for a question
     * PUT /api/grading/submissions/:submissionId/grade
     */
    static gradeAnswer = async (req: Request, res: Response): Promise<Response> => {
        try {
            const submissionId = req.params.submissionId as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;
            const { marksAwarded, feedback } = req.body;

            if (marksAwarded === undefined || marksAwarded === null) {
                return res.status(400).json({ error: "marksAwarded is required." });
            }

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const submission = await submissionRepo.findOne({
                where: { id: submissionId },
                relations: ["exam"]
            });

            if (!submission) return res.status(404).json({ error: "Submission not found." });

            // Allow creator OR admin
            if (submission.exam.createdById !== userId && userRole !== "admin") {
                return res.status(403).json({ error: "Only the exam creator or admin can grade answers." });
            }

            submission.marksAwarded = Number(marksAwarded);
            submission.feedback = feedback || null;
            submission.status = SubmissionStatus.GRADED;
            submission.gradedById = userId;
            submission.gradedAt = new Date();

            await submissionRepo.save(submission);

            return res.json({
                message: "Answer graded successfully.",
                submission: {
                    id: submission.id,
                    marksAwarded: submission.marksAwarded,
                    feedback: submission.feedback,
                    status: submission.status
                }
            });
        } catch (error) {
            Logger.error("Error grading answer:", error);
            return res.status(500).json({ error: "Failed to grade answer." });
        }
    };

    /**
     * Finalize grading for a student's entire submission (master record)
     * This recalculates total marks from individual answers and sets final status
     * PUT /api/grading/submissions/:submissionId/finalize
     */
    static finalizeGrading = async (req: Request, res: Response): Promise<Response> => {
        try {
            const submissionId = req.params.submissionId as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;
            const { overallFeedback } = req.body;

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const masterSubmission = await submissionRepo.findOne({
                where: { id: submissionId, questionId: IsNull() },
                relations: ["exam"]
            });

            if (!masterSubmission) {
                return res.status(404).json({ error: "Master submission not found." });
            }

            // Allow creator OR admin
            if (masterSubmission.exam.createdById !== userId && userRole !== "admin") {
                return res.status(403).json({ error: "Only the exam creator or admin can finalize grading." });
            }

            // Sum up all individual answer marks
            const individualAnswers = await submissionRepo.find({
                where: {
                    examId: masterSubmission.examId,
                    studentId: masterSubmission.studentId,
                    attemptNumber: masterSubmission.attemptNumber,
                    questionId: Not(IsNull())
                }
            });

            const totalMarks = individualAnswers.reduce(
                (sum, a) => sum + (Number(a.marksAwarded) || 0), 0
            );

            masterSubmission.marksAwarded = totalMarks;
            masterSubmission.status = SubmissionStatus.GRADED;
            masterSubmission.feedback = overallFeedback || masterSubmission.feedback;
            masterSubmission.gradedById = userId;
            masterSubmission.gradedAt = new Date();

            await submissionRepo.save(masterSubmission);

            return res.json({
                message: "Grading finalized successfully.",
                submission: {
                    id: masterSubmission.id,
                    totalMarksAwarded: totalMarks,
                    status: masterSubmission.status,
                    feedback: masterSubmission.feedback
                }
            });
        } catch (error) {
            Logger.error("Error finalizing grading:", error);
            return res.status(500).json({ error: "Failed to finalize grading." });
        }
    };

    /**
     * Publish exam scores — makes all graded submissions visible to students
     * PATCH /api/grading/exam/:examId/publish-scores
     */
    static publishScores = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id: examId } });

            if (!exam) return res.status(404).json({ error: "Exam not found." });

            // Allow creator OR admin
            if (exam.createdById !== userId && userRole !== "admin") {
                return res.status(403).json({ error: "Only the exam creator or admin can publish scores." });
            }

            // Update all master submissions to GRADED + set showCorrectAnswers
            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const result = await submissionRepo
                .createQueryBuilder()
                .update(AnswerSubmission)
                .set({ status: SubmissionStatus.GRADED })
                .where("examId = :examId", { examId })
                .andWhere("questionId IS NULL")
                .andWhere("status = :status", { status: SubmissionStatus.SUBMITTED })
                .execute();

            // Enable showCorrectAnswers on the exam
            exam.showCorrectAnswers = true;
            await examRepo.save(exam);

            return res.json({
                message: "Exam scores published successfully.",
                updatedCount: result.affected || 0
            });
        } catch (error) {
            Logger.error("Error publishing scores:", error);
            return res.status(500).json({ error: "Failed to publish scores." });
        }
    };

    /**
     * Get a student's detailed submission result (for student to view after grading)
     * GET /api/grading/exam/:examId/my-result
     */
    static getMyResult = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const studentId = req.session.userId!;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({
                where: { id: examId },
                relations: ["questions", "questions.options"]
            });

            if (!exam) return res.status(404).json({ error: "Exam not found." });

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

            // Get all master submissions
            const masters = await submissionRepo.find({
                where: { examId, studentId, questionId: IsNull() },
                order: { attemptNumber: "DESC" }
            });

            if (masters.length === 0) {
                return res.status(404).json({ error: "No submissions found." });
            }

            const results = await Promise.all(
                masters.map(async (master) => {
                    const answers = await submissionRepo.find({
                        where: {
                            examId,
                            studentId,
                            attemptNumber: master.attemptNumber,
                            questionId: Not(IsNull())
                        }
                    });

                    return {
                        id: master.id,
                        attemptNumber: master.attemptNumber,
                        status: master.status,
                        totalMarksAwarded: master.marksAwarded,
                        feedback: master.feedback,
                        submittedAt: master.submittedAt,
                        gradedAt: master.gradedAt,
                        answers: answers.map(a => ({
                            questionId: a.questionId,
                            answerText: a.answerText,
                            uploadUrl: a.uploadUrl,
                            marksAwarded: a.marksAwarded,
                            feedback: a.feedback,
                            status: a.status
                        }))
                    };
                })
            );

            // Strip correct answers unless showCorrectAnswers is enabled
            const sanitizedQuestions = exam.questions
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map(q => ({
                    id: q.id,
                    questionText: q.questionText,
                    questionType: q.questionType,
                    marks: q.marks,
                    orderIndex: q.orderIndex,
                    correctAnswer: exam.showCorrectAnswers ? q.correctAnswer : undefined,
                    explanation: exam.showCorrectAnswers ? q.explanation : undefined,
                    options: q.options?.map(o => ({
                        id: o.id,
                        optionText: o.optionText,
                        isCorrect: exam.showCorrectAnswers ? o.isCorrect : undefined
                    }))
                }));

            return res.json({
                exam: {
                    id: exam.id,
                    title: exam.title,
                    totalMarks: exam.totalMarks,
                    passingMarks: exam.passingMarks,
                    showCorrectAnswers: exam.showCorrectAnswers,
                    questions: sanitizedQuestions
                },
                results
            });
        } catch (error) {
            Logger.error("Error fetching student result:", error);
            return res.status(500).json({ error: "Failed to fetch result." });
        }
    };

    /**
     * Trigger OCR processing on a submission's uploaded image
     * POST /api/grading/submissions/:submissionId/ocr
     */
    static processOCR = async (req: Request, res: Response): Promise<Response> => {
        try {
            const submissionId = req.params.submissionId as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const submission = await submissionRepo.findOne({
                where: { id: submissionId },
                relations: ["exam"]
            });

            if (!submission) return res.status(404).json({ error: "Submission not found." });

            // Allow creator OR admin
            if (submission.exam.createdById !== userId && userRole !== "admin") {
                return res.status(403).json({ error: "Only the exam creator or admin can trigger OCR." });
            }
            if (!submission.uploadUrl) {
                return res.status(400).json({ error: "No upload found for this submission." });
            }

            const ocrText = await OCRService.processSubmissionImage(
                submissionId,
                submission.uploadUrl
            );

            return res.json({
                message: "OCR processing complete.",
                submissionId,
                ocrText
            });
        } catch (error) {
            Logger.error("Error processing OCR:", error);
            return res.status(500).json({ error: "OCR processing failed." });
        }
    };

    /**
     * Download a student's submission as PDF
     * GET /api/grading/submissions/:submissionId/pdf
     */
    static downloadPDF = async (req: Request, res: Response): Promise<Response | void> => {
        try {
            const submissionId = req.params.submissionId as string;
            const userId = req.session.userId!;

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const masterSubmission = await submissionRepo.findOne({
                where: { id: submissionId, questionId: IsNull() },
                relations: ["exam", "exam.questions", "student"]
            });

            if (!masterSubmission) {
                return res.status(404).json({ error: "Submission not found." });
            }

            // Allow access by exam creator or the student themselves
            const isCreator = masterSubmission.exam.createdById === userId;
            const isStudent = masterSubmission.studentId === userId;
            if (!isCreator && !isStudent) {
                return res.status(403).json({ error: "Access denied." });
            }

            // Fetch individual answers
            const answers = await submissionRepo.find({
                where: {
                    examId: masterSubmission.examId,
                    studentId: masterSubmission.studentId,
                    attemptNumber: masterSubmission.attemptNumber,
                    questionId: Not(IsNull())
                }
            });

            const questions = masterSubmission.exam.questions
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map(q => {
                    const answer = answers.find(a => a.questionId === q.id);
                    return {
                        questionText: q.questionText,
                        questionType: q.questionType,
                        marks: Number(q.marks),
                        answerText: answer?.answerText,
                        uploadUrl: answer?.uploadUrl,
                        marksAwarded: answer?.marksAwarded ? Number(answer.marksAwarded) : undefined,
                        feedback: answer?.feedback
                    };
                });

            const studentName = masterSubmission.student
                ? `${masterSubmission.student.firstName} ${masterSubmission.student.lastName}`
                : "Unknown Student";

            const pdfBuffer = await PDFService.generateSubmissionPDF({
                examTitle: masterSubmission.exam.title,
                studentName,
                attemptNumber: masterSubmission.attemptNumber,
                totalMarks: Number(masterSubmission.exam.totalMarks),
                marksAwarded: Number(masterSubmission.marksAwarded) || 0,
                submittedAt: masterSubmission.submittedAt?.toISOString() || "N/A",
                questions,
                overallFeedback: masterSubmission.feedback || undefined
            });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="submission_${masterSubmission.attemptNumber}_${studentName.replace(/\s+/g, "_")}.pdf"`
            );
            res.send(pdfBuffer);
        } catch (error) {
            Logger.error("Error generating PDF:", error);
            return res.status(500).json({ error: "Failed to generate PDF." });
        }
    };
}
