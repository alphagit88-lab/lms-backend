import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique 
} from "typeorm";
import { Course } from "./Course";
import { LessonProgress } from "./LessonProgress";

@Entity("lessons")
@Unique(["courseId", "slug"])
@Unique(["courseId", "sortOrder"])
export class Lesson {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "course_id" })
  courseId!: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ length: 250 })
  slug!: string;

  @Column({ type: "text", nullable: true })
  content?: string;

  @Column({ name: "video_url", length: 500, nullable: true })
  videoUrl?: string;

  @Column({ name: "duration_minutes", nullable: true })
  durationMinutes?: number;

  @Column({ name: "sort_order", default: 0 })
  sortOrder!: number;

  @Column({ name: "is_preview", default: false })
  isPreview!: boolean;

  @Column({ name: "is_published", default: false })
  isPublished!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Course, (course) => course.lessons, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @OneToMany(() => LessonProgress, (progress) => progress.lesson)
  progress!: LessonProgress[];
}
