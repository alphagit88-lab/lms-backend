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
import { Session } from "./Session";

@Entity("recordings")
@Index(["sessionId"])
@Index(["uploadedAt"])
export class Recording {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "session_id", unique: true })
  sessionId!: string;

  @Column({ name: "file_url", length: 500 })
  fileUrl!: string;

  @Column({ name: "file_size", type: "bigint", nullable: true, comment: "Size in bytes" })
  fileSize?: number;

  @Column({ name: "duration_minutes", nullable: true })
  durationMinutes?: number;

  @Column({ name: "video_quality", length: 20, nullable: true, comment: "720p, 1080p, etc." })
  videoQuality?: string;

  @Column({ name: "thumbnail_url", length: 500, nullable: true })
  thumbnailUrl?: string;

  @Column({ name: "is_processed", default: false })
  isProcessed!: boolean;

  @Column({ name: "is_public", default: false })
  isPublic!: boolean;

  @Column({ name: "view_count", default: 0 })
  viewCount!: number;

  @Column({ name: "uploaded_at", type: "timestamp" })
  uploadedAt!: Date;

  @Column({ type: "json", nullable: true, comment: "Transcription, chapters, etc." })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @OneToOne(() => Session, (session) => session.recording, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session!: Session;
}
