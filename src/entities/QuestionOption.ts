import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Question } from "./Question";

@Entity("question_options")
export class QuestionOption {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "question_id" })
  questionId!: string;

  @Column({ type: "text" })
  optionText!: string;

  @Column({ name: "is_correct", default: false })
  isCorrect!: boolean;

  @Column({ name: "order_index", default: 0 })
  orderIndex!: number;

  @Column({ name: "image_url", length: 500, nullable: true })
  imageUrl?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  // Relationships
  @ManyToOne(() => Question, (question) => question.options, { onDelete: "CASCADE" })
  @JoinColumn({ name: "question_id" })
  question!: Question;
}
