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
import { Booking } from "./Booking";

export enum PackageStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

@Entity("booking_packages")
@Index(["teacherId", "status"])
@Index(["studentId", "status"])
export class BookingPackage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id" })
  teacherId!: string;

  @Column({ name: "student_id" })
  studentId!: string;

  @Column({ name: "booked_by_id", comment: "User who created the package (parent or student)" })
  bookedById!: string;

  @Column({ length: 200, nullable: true })
  title?: string;

  @Column({ name: "total_sessions" })
  totalSessions!: number;

  @Column({ name: "completed_sessions", default: 0 })
  completedSessions!: number;

  @Column({ name: "cancelled_sessions", default: 0 })
  cancelledSessions!: number;

  @Column({ name: "total_price", type: "decimal", precision: 10, scale: 2 })
  totalPrice!: number;

  @Column({ name: "discount_percentage", type: "decimal", precision: 5, scale: 2, default: 0 })
  discountPercentage!: number;

  @Column({ name: "final_price", type: "decimal", precision: 10, scale: 2 })
  finalPrice!: number;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(PackageStatus),
    default: PackageStatus.ACTIVE,
  })
  status!: PackageStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "booked_by_id" })
  bookedBy!: User;

  @OneToMany(() => Booking, (booking) => booking.package)
  bookings!: Booking[];
}

