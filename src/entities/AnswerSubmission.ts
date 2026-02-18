import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Exam } from "./Exam";
import { Question } from "./Question";
import { User } from "./User";

export enum SubmissionStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  GRADED = "graded",
  RETURNED = "returned",
}

@Entity("answer_submissions")
@Index(["examId", "studentId"])
@Index(["studentId", "status"])
export class AnswerSubmission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "exam_id" })
  examId!: string;

  @Column({ name: "question_id", nullable: true, comment: "Null if submission is for entire exam" })
  questionId?: string;

  @Column({ name: "student_id" })
  studentId!: string;

  @Column({ name: "attempt_number", default: 1 })
  attemptNumber!: number;

  @Column({ name: "answer_text", type: "text", nullable: true })
  answerText?: string;

  @Column({ name: "upload_url", length: 500, nullable: true, comment: "URL of uploaded image/PDF" })
  uploadUrl?: string;

  @Column({ name: "ocr_text", type: "text", nullable: true, comment: "Extracted text from upload" })
  ocrText?: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(SubmissionStatus),
    default: SubmissionStatus.DRAFT,
  })
  status!: SubmissionStatus;

  @Column({ name: "marks_awarded", type: "decimal", precision: 10, scale: 2, nullable: true })
  marksAwarded?: number;

  @Column({ name: "feedback", type: "text", nullable: true })
  feedback?: string;

  @Column({ name: "graded_by_id", nullable: true })
  gradedById?: string;

  @Column({ name: "graded_at", type: "timestamp", nullable: true })
  gradedAt?: Date;

  @Column({ name: "submitted_at", type: "timestamp", nullable: true })
  submittedAt?: Date;

  @Column({ name: "time_spent_minutes", nullable: true })
  timeSpentMinutes?: number;

  @Column({ type: "json", nullable: true, comment: "Additional submission data" })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Exam, (exam) => exam.submissions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "exam_id" })
  exam!: Exam;

  @ManyToOne(() => Question, { onDelete: "CASCADE" })
  @JoinColumn({ name: "question_id" })
  question?: Question;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "graded_by_id" })
  gradedBy?: User;
}
