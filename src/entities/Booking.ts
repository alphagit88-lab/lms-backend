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
import { AvailabilitySlot } from "./AvailabilitySlot";
import { BookingPackage } from "./BookingPackage";

export enum BookingStatus {
  PENDING_PAYMENT = "pending_payment",
  PENDING = "pending",
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
  COMPLETED = "completed",
  NO_SHOW = "no_show",
}

@Entity("bookings")
@Index(["studentId", "status"])
@Index(["slotId", "status"])
@Index(["teacherId", "status"])
export class Booking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "slot_id" })
  slotId!: string;

  @Column({ name: "student_id" })
  studentId!: string;

  @Column({ name: "teacher_id", comment: "Denormalized for faster queries" })
  teacherId!: string;

  @Column({ name: "booked_by_id", comment: "User who made booking (parent or student)" })
  bookedById!: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING,
  })
  status!: BookingStatus;

  @Column({ name: "booking_time", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  bookingTime!: Date;

  @Column({ name: "session_start_time", type: "timestamp" })
  sessionStartTime!: Date;

  @Column({ name: "session_end_time", type: "timestamp" })
  sessionEndTime!: Date;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ name: "cancellation_reason", type: "text", nullable: true })
  cancellationReason?: string;

  @Column({ name: "cancelled_at", type: "timestamp", nullable: true })
  cancelledAt?: Date;

  @Column({ name: "cancelled_by_id", nullable: true })
  cancelledById?: string;

  @Column({ name: "meeting_link", length: 500, nullable: true })
  meetingLink?: string;

  @Column({ name: "meeting_start_link", length: 1000, nullable: true })
  meetingStartLink?: string;

  @Column({ name: "meeting_id", length: 255, nullable: true })
  meetingId?: string;

  @Column({ name: "meeting_password", length: 100, nullable: true })
  meetingPassword?: string;

  @Column({ name: "reminder_sent", default: false })
  reminderSent!: boolean;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  amount?: number;

  @Column({ name: "payment_id", nullable: true })
  paymentId?: string;

  @Column({ name: "refund_percentage", type: "int", nullable: true, comment: "0, 50, or 100 based on cancellation policy" })
  refundPercentage?: number;

  @Column({ name: "refund_amount", type: "decimal", precision: 10, scale: 2, nullable: true })
  refundAmount?: number;

  @Column({ name: "package_id", nullable: true, comment: "FK to booking_packages for multi-session bookings" })
  packageId?: string;

  @Column({ name: "payment_expires_at", type: "timestamp", nullable: true })
  paymentExpiresAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => AvailabilitySlot, (slot) => slot.bookings, { onDelete: "CASCADE" })
  @JoinColumn({ name: "slot_id" })
  slot!: AvailabilitySlot;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "booked_by_id" })
  bookedBy!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "cancelled_by_id" })
  cancelledBy?: User;

  @ManyToOne(() => BookingPackage, (pkg) => pkg.bookings, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "package_id" })
  package?: BookingPackage;
}
