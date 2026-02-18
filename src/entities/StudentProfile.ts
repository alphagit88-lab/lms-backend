import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity("student_profiles")
export class StudentProfile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "student_id", unique: true })
  studentId!: string;

  @Column({ length: 50, comment: "Grade: Grade 1-13, A/L, O/L" })
  grade!: string;

  @Column({ length: 50, comment: "Medium: English, Sinhala, Tamil" })
  medium!: string;

  @Column({ length: 200, nullable: true })
  school?: string;

  @Column({ name: "date_of_birth", type: "date", nullable: true })
  dateOfBirth?: Date;

  @Column({ length: 100, nullable: true, comment: "Subjects interested in" })
  interests?: string;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ name: "learning_style", length: 50, nullable: true, comment: "Visual, Auditory, Kinesthetic" })
  learningStyle?: string;

  @Column({ type: "json", nullable: true })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: User;
}
