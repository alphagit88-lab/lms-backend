import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { Course } from "./Course";
import { User } from "./User";
import { Question } from "./Question";

export enum ExamType {
  QUIZ = "quiz",
  ASSIGNMENT = "assignment",
  TEST = "test",
  FINAL_EXAM = "final_exam",
  PRACTICE = "practice",
}

@Entity("exams")
@Index(["courseId", "examType"])
@Index(["examDate"])
export class Exam {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "course_id" })
  courseId!: string;

  @Column({ name: "created_by_id", comment: "Instructor who created exam" })
  createdById!: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({
    name: "exam_type",
    type: "varchar",
    length: 20,
    enum: Object.values(ExamType),
  })
  examType!: ExamType;

  @Column({ name: "exam_date", type: "timestamp", nullable: true })
  examDate?: Date;

  @Column({ name: "duration_minutes", nullable: true })
  durationMinutes?: number;

  @Column({ name: "total_marks", type: "decimal", precision: 10, scale: 2, default: 0 })
  totalMarks!: number;

  @Column({ name: "passing_marks", type: "decimal", precision: 10, scale: 2, nullable: true })
  passingMarks?: number;

  @Column({ length: 50, nullable: true, comment: "Language: english, sinhala, tamil" })
  language?: string;

  @Column({ name: "is_published", default: false })
  isPublished!: boolean;

  @Column({ name: "allow_late_submission", default: false })
  allowLateSubmission!: boolean;

  @Column({ name: "submission_deadline", type: "timestamp", nullable: true })
  submissionDeadline?: Date;

  @Column({ name: "max_attempts", default: 1 })
  maxAttempts!: number;

  @Column({ name: "show_correct_answers", default: false })
  showCorrectAnswers!: boolean;

  @Column({ type: "json", nullable: true })
  settings?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Course, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @ManyToOne(() => User)
  @JoinColumn({ name: "created_by_id" })
  createdBy!: User;

  @OneToMany(() => Question, (question) => question.exam)
  questions!: Question[];

  @OneToMany("AnswerSubmission", "exam")
  submissions!: any[];
}
