import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Class } from "./Class";
import { Recording } from "./Recording";

export enum SessionType {
  LIVE = "live",
  RECORDED = "recorded",
  HYBRID = "hybrid",
}

export enum SessionStatus {
  SCHEDULED = "scheduled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

@Entity("sessions")
@Index(["classId", "startTime"])
@Index(["startTime", "status"])
export class Session {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "class_id" })
  classId!: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "start_time", type: "timestamp" })
  startTime!: Date;

  @Column({ name: "end_time", type: "timestamp" })
  endTime!: Date;

  @Column({
    name: "session_type",
    type: "varchar",
    length: 20,
    enum: Object.values(SessionType),
    default: SessionType.LIVE,
  })
  sessionType!: SessionType;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(SessionStatus),
    default: SessionStatus.SCHEDULED,
  })
  status!: SessionStatus;

  @Column({ name: "meeting_link", length: 500, nullable: true })
  meetingLink?: string;

  @Column({ name: "meeting_id", length: 255, nullable: true })
  meetingId?: string;

  @Column({ name: "meeting_password", length: 100, nullable: true })
  meetingPassword?: string;

  @Column({ name: "is_recorded", default: false })
  isRecorded!: boolean;

  @Column({ name: "attendance_count", default: 0 })
  attendanceCount!: number;

  @Column({ type: "json", nullable: true, comment: "Attendee list, notes, etc." })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Class, (classEntity) => classEntity.sessions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "class_id" })
  class!: Class;

  @OneToOne(() => Recording, (recording) => recording.session)
  recording?: Recording;
}
