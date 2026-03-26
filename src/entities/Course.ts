import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn
} from "typeorm";
import { User } from "./User";
import { Category } from "./Category";
import { Lesson } from "./Lesson";
import { Enrollment } from "./Enrollment";
import { Exam } from "./Exam";
import { Content } from "./Content";

@Entity("courses")
export class Course {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ unique: true, length: 250 })
  slug!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ name: "short_description", length: 500, nullable: true })
  shortDescription?: string;

  @Column({ name: "instructor_id" })
  instructorId!: string;

  @Column({ name: "category_id", nullable: true })
  categoryId?: string;

  @Column({ length: 500, nullable: true })
  thumbnail?: string;

  @Column({ name: "preview_video_url", length: 500, nullable: true })
  previewVideoUrl?: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: ["draft", "published", "archived"],
    default: "draft",
  })
  status!: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: ["beginner", "intermediate", "advanced"],
    default: "beginner",
  })
  level!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "english",
    comment: "Teaching medium: english, sinhala, tamil",
  })
  medium!: string;

  @Column({ name: "duration_hours", nullable: true })
  durationHours?: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.00 })
  price!: number;

  @Column({ name: "discount_percentage", type: "decimal", precision: 5, scale: 2, default: 0.00, nullable: true })
  discountPercentage?: number;

  @Column({ name: "is_published", default: false })
  isPublished!: boolean;

  @Column({ name: "published_at", type: "timestamp", nullable: true })
  publishedAt?: Date;

  @Column({ name: "enrollment_count", default: 0 })
  enrollmentCount!: number;

  @Column({ name: "rating_average", type: "decimal", precision: 3, scale: 2, nullable: true })
  ratingAverage?: number;

  @Column({ name: "rating_count", default: 0 })
  ratingCount!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.courses, { onDelete: "CASCADE" })
  @JoinColumn({ name: "instructor_id" })
  instructor!: User;

  @ManyToOne(() => Category, (category) => category.courses, { onDelete: "SET NULL" })
  @JoinColumn({ name: "category_id" })
  category?: Category;

  @OneToMany(() => Lesson, (lesson) => lesson.course)
  lessons!: Lesson[];
  @OneToMany(() => Content, (content) => content.course)
  contents?: Content[];
  @OneToMany(() => Enrollment, (enrollment) => enrollment.course)
  enrollments!: Enrollment[];

  @OneToMany(() => Exam, (exam) => exam.course)
  exams!: Exam[];
}
