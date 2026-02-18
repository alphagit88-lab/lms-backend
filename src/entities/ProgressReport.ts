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
import { User } from "./User";
import { Course } from "./Course";

@Entity("progress_reports")
@Index(["studentId", "courseId"])
@Index(["teacherId", "generatedAt"])
export class ProgressReport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "student_id" })
  studentId!: string;

  @Column({ name: "teacher_id" })
  teacherId!: string;

  @Column({ name: "course_id", nullable: true })
  courseId?: string;

  @Column({ name: "report_period_start", type: "date" })
  reportPeriodStart!: Date;

  @Column({ name: "report_period_end", type: "date" })
  reportPeriodEnd!: Date;

  @Column({ name: "average_score", type: "decimal", precision: 5, scale: 2, nullable: true })
  averageScore?: number;

  @Column({ name: "total_sessions_attended", default: 0 })
  totalSessionsAttended!: number;

  @Column({ name: "total_assignments", default: 0 })
  totalAssignments!: number;

  @Column({ name: "completed_assignments", default: 0 })
  completedAssignments!: number;

  @Column({ name: "attendance_percentage", type: "decimal", precision: 5, scale: 2, nullable: true })
  attendancePercentage?: number;

  @Column({ name: "performance_trend", length: 20, nullable: true, comment: "improving, declining, stable" })
  performanceTrend?: string;

  @Column({ type: "text", nullable: true })
  remarks?: string;

  @Column({ type: "text", nullable: true })
  strengths?: string;

  @Column({ name: "areas_for_improvement", type: "text", nullable: true })
  areasForImprovement?: string;

  @Column({ name: "is_shared_with_parent", default: false })
  isSharedWithParent!: boolean;

  @Column({ name: "generated_at", type: "timestamp" })
  generatedAt!: Date;

  @Column({ type: "json", nullable: true, comment: "Detailed metrics, charts data" })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;

  @ManyToOne(() => Course, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course?: Course;
}
