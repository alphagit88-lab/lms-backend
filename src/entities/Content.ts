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

export enum ContentType {
  PDF = "pdf",
  VIDEO = "video",
  AUDIO = "audio",
  DOCUMENT = "document",
  PRESENTATION = "presentation",
  WORKSHEET = "worksheet",
  QUIZ = "quiz",
  OTHER = "other",
}

export enum AcademicResourceType {
  PAST_PAPER = "past_paper",
  MODEL_PAPER = "model_paper",
  TEACHER_PAPER = "teacher_paper",
  MARKING_SCHEME = "marking_scheme",
  MARK_SHEET = "mark_sheet",
  TUTORIAL = "tutorial",
  LESSON_NOTES = "lesson_notes",
  REFERENCE_MATERIAL = "reference_material",
  PAPER_DISCUSSION = "paper_discussion",
  OTHER = "other",
}

@Entity("contents")
@Index(["teacherId", "contentType"])
@Index(["isPaid", "isPublished"])
@Index(["resourceType"])
@Index(["subject", "grade", "topic"])
export class Content {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id" })
  teacherId!: string;

  @Column({
    name: "content_type",
    type: "varchar",
    length: 20,
    enum: Object.values(ContentType),
  })
  contentType!: ContentType;

  @Column({
    name: "resource_type",
    type: "varchar",
    length: 50,
    enum: Object.values(AcademicResourceType),
    default: AcademicResourceType.OTHER,
  })
  resourceType!: AcademicResourceType;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ length: 50, comment: "Language: english, sinhala, tamil" })
  language!: string;

  @Column({ name: "file_url", length: 500 })
  fileUrl!: string;

  @Column({ name: "file_size", type: "bigint", nullable: true, comment: "Size in bytes" })
  fileSize?: number;

  @Column({ name: "thumbnail_url", length: 500, nullable: true })
  thumbnailUrl?: string;

  @Column({ name: "is_paid", default: false })
  isPaid!: boolean;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ name: "is_published", default: false })
  isPublished!: boolean;

  @Column({ name: "is_downloadable", default: true, comment: "Whether content can be downloaded" })
  isDownloadable!: boolean;

  @Column({ name: "download_count", default: 0 })
  downloadCount!: number;

  @Column({ name: "view_count", default: 0 })
  viewCount!: number;

  @Column({ length: 100, nullable: true, comment: "Subject/category" })
  subject?: string;

  @Column({ length: 50, nullable: true, comment: "Grade level" })
  grade?: string;

  @Column({ length: 100, nullable: true, comment: "Specific topic within the subject" })
  topic?: string;

  @Column({ type: "json", nullable: true, comment: "Tags, keywords" })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;
}
