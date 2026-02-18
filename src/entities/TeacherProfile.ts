import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";

@Entity("teacher_profiles")
@Index(["verified"])
@Index(["rating"])
export class TeacherProfile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id", unique: true })
  teacherId!: string;

  @Column({ length: 200, nullable: true })
  specialization?: string;

  @Column({ type: "text", nullable: true })
  qualifications?: string;

  @Column({ name: "years_experience", nullable: true })
  yearsExperience?: number;

  @Column({ type: "decimal", precision: 3, scale: 2, nullable: true, default: 0.00 })
  rating?: number;

  @Column({ name: "rating_count", default: 0 })
  ratingCount!: number;

  @Column({ default: false })
  verified!: boolean;

  @Column({ name: "verified_at", type: "timestamp", nullable: true })
  verifiedAt?: Date;

  @Column({ name: "verified_by", nullable: true })
  verifiedBy?: string;

  @Column({ name: "hourly_rate", type: "decimal", precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @Column({ name: "teaching_languages", length: 200, nullable: true, comment: "English, Sinhala, Tamil" })
  teachingLanguages?: string;

  @Column({ name: "subjects", type: "text", nullable: true, comment: "Subjects taught" })
  subjects?: string;

  @Column({ name: "availability_timezone", length: 100, nullable: true })
  availabilityTimezone?: string;

  @Column({ name: "total_sessions", default: 0 })
  totalSessions!: number;

  @Column({ name: "total_students", default: 0 })
  totalStudents!: number;

  @Column({ type: "json", nullable: true })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;
}
