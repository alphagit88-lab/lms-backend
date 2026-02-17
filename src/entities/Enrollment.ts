import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique 
} from "typeorm";
import { User } from "./User";
import { Course } from "./Course";
import { LessonProgress } from "./LessonProgress";

@Entity("enrollments")
@Unique(["studentId", "courseId"])
export class Enrollment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "student_id" })
  studentId!: string;

  @Column({ name: "course_id" })
  courseId!: string;

  @CreateDateColumn({ name: "enrolled_at" })
  enrolledAt!: Date;

  @Column({ name: "completed_at", type: "timestamp", nullable: true })
  completedAt?: Date;

  @Column({ name: "progress_percentage", default: 0 })
  progressPercentage!: number;

  @Column({ name: "last_accessed_at", type: "timestamp", nullable: true })
  lastAccessedAt?: Date;

  @Column({
    type: "varchar",
    length: 20,
    enum: ["active", "completed", "dropped"],
    default: "active",
  })
  status!: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.enrollments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: User;

  @ManyToOne(() => Course, (course) => course.enrollments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @OneToMany(() => LessonProgress, (progress) => progress.enrollment)
  lessonProgress!: LessonProgress[];
}
