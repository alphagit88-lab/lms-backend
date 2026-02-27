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
import { User } from "./User";
import { Session } from "./Session";
import { Course } from "./Course";

@Entity("classes")
@Index(["teacherId", "isActive"])
@Index(["subject", "grade"])
export class Class {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id" })
  teacherId!: string;

  @Column({ name: "course_id", nullable: true })
  courseId?: string;

  @Column({ length: 200 })
  subject!: string;

  @Column({ length: 50, comment: "Grade level: Grade 1-13, A/L, O/L" })
  grade!: string;

  @Column({ length: 50, comment: "Medium/Language: English, Sinhala, Tamil" })
  medium!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price!: number;

  @Column({ name: "max_students", nullable: true, comment: "Max students for group classes" })
  maxStudents?: number;

  @Column({ name: "current_students", default: 0 })
  currentStudents!: number;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @Column({ name: "is_group", default: false })
  isGroup!: boolean;

  @Column({ length: 500, nullable: true })
  thumbnail?: string;

  @Column({ type: "json", nullable: true, comment: "Class schedule, requirements, etc." })
  settings?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;

  @ManyToOne(() => Course, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "course_id" })
  course?: Course;

  @OneToMany(() => Session, (session) => session.class)
  sessions!: Session[];
}
