import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Exam } from "../entities/Exam";
import { Question } from "../entities/Question";
import { AnswerSubmission, SubmissionStatus } from "../entities/AnswerSubmission";
import { Logger } from "../utils/logger";
import { IsNull } from "typeorm";

export class SubmissionController {
    /**
     * Start/Fetch Exam for Student (Strips out correct answers)
     * GET /api/submissions/exam/:examId
     */
    static getExamForStudent = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const studentId = req.session.userId!;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({
                where: { id: examId },
                relations: ["questions", "questions.options"]
            });

            if (!exam) return res.status(404).json({ error: "Exam not found." });
            if (!exam.isPublished) return res.status(403).json({ error: "Exam is not published yet." });

            // Issue 1 Fix: Enforce exam schedule — students cannot access exam before examDate
            if (exam.examDate && new Date(exam.examDate) > new Date()) {
                return res.status(403).json({
                    error: "This exam has not started yet.",
                    examDate: exam.examDate,
                    message: `Exam begins on ${new Date(exam.examDate).toLocaleString()}`
                });
            }

            // Check if student already submitted maximum attempts
            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);
            const pastSubmissions = await submissionRepo.count({
                where: { examId, studentId, questionId: IsNull() } // master records
            });

            if (exam.maxAttempts && pastSubmissions >= exam.maxAttempts) {
                return res.status(403).json({ error: "Maximum attempts reached for this exam." });
            }

            // Strip out correct answers
            const sanitizedExam = {
                ...exam,
                questions: exam.questions.map(q => ({
                    ...q,
                    correctAnswer: undefined,
                    explanation: undefined,
                    options: q.options?.map(o => ({
                        ...o,
                        isCorrect: undefined
                    }))
                }))
            };

            sanitizedExam.questions.sort((a: any, b: any) => a.orderIndex - b.orderIndex);
            sanitizedExam.questions.forEach((q: any) => {
                if (q.options) {
                    q.options.sort((a: any, b: any) => a.orderIndex - b.orderIndex);
                }
            });

            return res.json({ exam: sanitizedExam });
        } catch (error) {
            Logger.error("Error fetching exam for student:", error);
            return res.status(500).json({ error: "Failed to fetch exam." });
        }
    };

    /**
     * Submit Exam Answers
     * POST /api/submissions/exam/:examId
     */
    static submitExam = async (req: Request, res: Response): Promise<Response> => {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const examId = req.params.examId as string;
            const studentId = req.session.userId!;
            const { answers, timeSpentMinutes } = req.body;

            const examRepo = queryRunner.manager.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id: examId }, relations: ["questions", "questions.options"] });

            if (!exam) {
                await queryRunner.rollbackTransaction();
                return res.status(404).json({ error: "Exam not found." });
            }

            // Issue 1 Fix: Enforce exam schedule — cannot submit before exam starts
            if (exam.examDate && new Date(exam.examDate) > new Date()) {
                await queryRunner.rollbackTransaction();
                return res.status(403).json({
                    error: "This exam has not started yet.",
                    examDate: exam.examDate
                });
            }

            // Issue 1 Fix: Enforce submission deadline — cannot submit after deadline (unless late submission allowed)
            if (exam.submissionDeadline && new Date(exam.submissionDeadline) < new Date() && !exam.allowLateSubmission) {
                await queryRunner.rollbackTransaction();
                return res.status(403).json({
                    error: "The submission deadline has passed for this exam.",
                    submissionDeadline: exam.submissionDeadline
                });
            }

            const submissionRepo = queryRunner.manager.getRepository(AnswerSubmission);

            const pastSubmissions = await submissionRepo.find({
                where: { examId, studentId, questionId: IsNull() }
            });
            const attemptNumber = pastSubmissions.length > 0 ? Math.max(...pastSubmissions.map(s => s.attemptNumber)) + 1 : 1;

            if (exam.maxAttempts && attemptNumber > exam.maxAttempts) {
                await queryRunner.rollbackTransaction();
                return res.status(403).json({ error: "Maximum attempts reached." });
            }

            let totalAutoMarks = 0;
            const submissionEntities = [];

            for (const ans of (answers || [])) {
                let marksAwarded = 0;
                let status = SubmissionStatus.SUBMITTED;

                const question = exam.questions.find(q => q.id === ans.questionId);
                if (question && (question.questionType === "multiple_choice" || question.questionType === "true_false")) {
                    const correctOption = question.options.find(o => o.isCorrect);
                    if (correctOption && ans.answerText === correctOption.id) {
                        marksAwarded = Number(question.marks);
                        totalAutoMarks += marksAwarded;
                    }
                    status = SubmissionStatus.GRADED;
                }

                submissionEntities.push(submissionRepo.create({
                    examId,
                    questionId: ans.questionId,
                    studentId,
                    attemptNumber,
                    answerText: ans.answerText,
                    uploadUrl: ans.uploadUrl,
                    status: status,
                    marksAwarded,
                    submittedAt: new Date()
                }));
            }

            const allAutoGraded = exam.questions.every(q => q.questionType === "multiple_choice" || q.questionType === "true_false");

            const masterSubmission = submissionRepo.create({
                examId,
                studentId,
                attemptNumber,
                status: allAutoGraded ? SubmissionStatus.GRADED : SubmissionStatus.SUBMITTED,
                marksAwarded: totalAutoMarks,
                timeSpentMinutes: timeSpentMinutes || 0,
                submittedAt: new Date(),
                metadata: { autoGradedFieldsCount: answers ? answers.length : 0 }
            });

            submissionEntities.push(masterSubmission);

            await submissionRepo.save(submissionEntities);
            await queryRunner.commitTransaction();

            return res.json({
                message: "Exam submitted successfully.",
                submissionId: masterSubmission.id,
                totalAutoMarks,
                status: masterSubmission.status
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            Logger.error("Error submitting exam:", error);
            return res.status(500).json({ error: "Failed to submit exam." });
        } finally {
            await queryRunner.release();
        }
    };

    /**
     * Get Student's Past Submissions for an Exam
     * GET /api/submissions/exam/:examId/history
     */
    static getSubmissionHistory = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const studentId = req.session.userId!;

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

            const history = await submissionRepo.find({
                where: { examId, studentId, questionId: IsNull() },
                order: { attemptNumber: "DESC" }
            });

            return res.json({ history });
        } catch (error) {
            Logger.error("Error getting submission history:", error);
            return res.status(500).json({ error: "Failed to fetch history." });
        }
    };

    /**
     * Save Draft — Auto-save answers without finalizing
     * POST /api/submissions/exam/:examId/save-draft
     */
    static saveDraft = async (req: Request, res: Response): Promise<Response> => {
        try {
            const examId = req.params.examId as string;
            const studentId = req.session.userId!;
            const { answers } = req.body;

            const examRepo = AppDataSource.getRepository(Exam);
            const exam = await examRepo.findOne({ where: { id: examId } });

            if (!exam) return res.status(404).json({ error: "Exam not found." });
            if (!exam.isPublished) return res.status(403).json({ error: "Exam is not published." });

            // Issue 1 Fix: Enforce exam schedule — cannot save draft before exam starts
            if (exam.examDate && new Date(exam.examDate) > new Date()) {
                return res.status(403).json({
                    error: "This exam has not started yet.",
                    examDate: exam.examDate
                });
            }

            const submissionRepo = AppDataSource.getRepository(AnswerSubmission);

            // Determine current attempt number
            const pastSubmissions = await submissionRepo.find({
                where: { examId, studentId, questionId: IsNull() }
            });
            const attemptNumber = pastSubmissions.length > 0
                ? Math.max(...pastSubmissions.map(s => s.attemptNumber)) + 1
                : 1;

            // Check if we already have a draft for this attempt
            let existingDraft = await submissionRepo.findOne({
                where: { examId, studentId, status: SubmissionStatus.DRAFT, questionId: IsNull() }
            });

            if (!existingDraft) {
                // Create a new master draft record
                existingDraft = submissionRepo.create({
                    examId,
                    studentId,
                    attemptNumber,
                    status: SubmissionStatus.DRAFT,
                    metadata: { lastSavedAt: new Date().toISOString() }
                });
                await submissionRepo.save(existingDraft);
            } else {
                existingDraft.metadata = { ...existingDraft.metadata, lastSavedAt: new Date().toISOString() };
                await submissionRepo.save(existingDraft);
            }

            // Save/update individual answers
            for (const ans of (answers || [])) {
                let existing = await submissionRepo.findOne({
                    where: {
                        examId,
                        studentId,
                        questionId: ans.questionId,
                        attemptNumber: existingDraft.attemptNumber,
                        status: SubmissionStatus.DRAFT
                    }
                });

                if (existing) {
                    existing.answerText = ans.answerText;
                    existing.uploadUrl = ans.uploadUrl;
                    await submissionRepo.save(existing);
                } else {
                    const newAnswer = submissionRepo.create({
                        examId,
                        questionId: ans.questionId,
                        studentId,
                        attemptNumber: existingDraft.attemptNumber,
                        answerText: ans.answerText,
                        uploadUrl: ans.uploadUrl,
                        status: SubmissionStatus.DRAFT
                    });
                    await submissionRepo.save(newAnswer);
                }
            }

            return res.json({
                message: "Draft saved successfully.",
                draftId: existingDraft.id,
                savedAt: new Date().toISOString()
            });
        } catch (error) {
            Logger.error("Error saving draft:", error);
            return res.status(500).json({ error: "Failed to save draft." });
        }
    };
}
