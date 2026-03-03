import { Response } from "express"; // Added back missing import
import { Request } from "express";
import { AppDataSource } from "../config/data-source";
import { Exam, ExamType } from "../entities/Exam";
import { Course } from "../entities/Course";
import { Question, QuestionType } from "../entities/Question";
import { QuestionOption } from "../entities/QuestionOption";
import { Logger } from "../utils/logger";
import { UploadApiResponse, v2 as cloudinary } from "cloudinary";

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
            const examRepo = AppDataSource.getRepository(Exam);

            const exams = await examRepo.find({
                where: { createdById: userId },
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

            // Upload to Cloudinary using secure stream
            // Buffer to Cloudinary upload
            const buffer = req.file.buffer;

            const uploadPromise = new Promise<{ uploadUrl: string }>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: `lms/exams/${examId}/answers/${studentId}` },
                    (error: any, result: any) => {
                        if (error) {
                            reject(error);
                        } else if (result) {
                            resolve({ uploadUrl: result.secure_url });
                        } else {
                            reject(new Error("Cloudinary returned a null response."));
                        }
                    }
                );
                stream.end(buffer);
            });

            const uploadResult = await uploadPromise;

            return res.status(200).json({
                message: "Handwritten answer uploaded successfully",
                questionId: question.id,
                uploadUrl: uploadResult.uploadUrl
            });

        } catch (error) {
            Logger.error("Error uploading handwritten answer:", error);
            return res.status(500).json({ error: "Failed to upload answer image." });
        }
    };
}
