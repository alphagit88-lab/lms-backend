import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Exam } from "./Exam";
import { QuestionOption } from "./QuestionOption";

export enum QuestionType {
  MULTIPLE_CHOICE = "multiple_choice",
  TRUE_FALSE = "true_false",
  SHORT_ANSWER = "short_answer",
  ESSAY = "essay",
  FILL_BLANK = "fill_blank",
  MATCHING = "matching",
}

@Entity("questions")
export class Question {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "exam_id" })
  examId!: string;

  @Column({ type: "text" })
  questionText!: string;

  @Column({
    name: "question_type",
    type: "varchar",
    length: 20,
    enum: Object.values(QuestionType),
  })
  questionType!: QuestionType;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  marks!: number;

  @Column({ name: "order_index", default: 0 })
  orderIndex!: number;

  @Column({ name: "image_url", length: 500, nullable: true })
  imageUrl?: string;

  @Column({ name: "correct_answer", type: "text", nullable: true, comment: "For auto-grading" })
  correctAnswer?: string;

  @Column({ type: "text", nullable: true })
  explanation?: string;

  @Column({ type: "json", nullable: true, comment: "Additional question metadata" })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Exam, (exam) => exam.questions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "exam_id" })
  exam!: Exam;

  @OneToMany(() => QuestionOption, (option) => option.question)
  options!: QuestionOption[];
}
