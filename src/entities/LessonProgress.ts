import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique 
} from "typeorm";
import { Enrollment } from "./Enrollment";
import { Lesson } from "./Lesson";

@Entity("lesson_progress")
@Unique(["enrollmentId", "lessonId"])
export class LessonProgress {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "enrollment_id" })
  enrollmentId!: string;

  @Column({ name: "lesson_id" })
  lessonId!: string;

  @Column({ name: "is_completed", default: false })
  isCompleted!: boolean;

  @Column({ name: "completed_at", type: "timestamp", nullable: true })
  completedAt?: Date;

  @Column({ name: "time_spent_seconds", default: 0 })
  timeSpentSeconds!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Enrollment, (enrollment) => enrollment.lessonProgress, { onDelete: "CASCADE" })
  @JoinColumn({ name: "enrollment_id" })
  enrollment!: Enrollment;

  @ManyToOne(() => Lesson, (lesson) => lesson.progress, { onDelete: "CASCADE" })
  @JoinColumn({ name: "lesson_id" })
  lesson!: Lesson;
}
