import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";

export enum NotificationChannel {
  IN_APP = "in_app",
  EMAIL = "email",
  SMS = "sms",
  PUSH = "push",
}

export enum NotificationType {
  BOOKING_REMINDER = "booking_reminder",
  BOOKING_CONFIRMED = "booking_confirmed",
  BOOKING_CANCELLED = "booking_cancelled",
  PAYMENT_SUCCESS = "payment_success",
  PAYMENT_FAILED = "payment_failed",
  ASSIGNMENT_DUE = "assignment_due",
  EXAM_SCHEDULED = "exam_scheduled",
  GRADE_POSTED = "grade_posted",
  MESSAGE_RECEIVED = "message_received",
  COURSE_ENROLLED = "course_enrolled",
  SESSION_STARTED = "session_started",
  GENERAL = "general",
}

@Entity("notifications")
@Index(["userId", "isRead"])
@Index(["sentAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(NotificationChannel),
  })
  channel!: NotificationChannel;

  @Column({
    name: "notification_type",
    type: "varchar",
    length: 30,
    enum: Object.values(NotificationType),
  })
  notificationType!: NotificationType;

  @Column({ length: 200, nullable: true })
  title?: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ name: "action_url", length: 500, nullable: true, comment: "URL to navigate when clicked" })
  actionUrl?: string;

  @Column({ name: "reference_id", nullable: true, comment: "ID of related entity (booking, payment, etc.)" })
  referenceId?: string;

  @Column({ name: "is_read", default: false })
  isRead!: boolean;

  @Column({ name: "read_at", type: "timestamp", nullable: true })
  readAt?: Date;

  @Column({ name: "sent_at", type: "timestamp" })
  sentAt!: Date;

  @Column({ name: "delivery_status", length: 20, nullable: true, comment: "sent, failed, pending" })
  deliveryStatus?: string;

  @Column({ type: "json", nullable: true })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;
}
