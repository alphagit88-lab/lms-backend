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

export enum SlotStatus {
  AVAILABLE = "available",
  BOOKED = "booked",
  BLOCKED = "blocked",
}

@Entity("availability_slots")
@Index(["teacherId", "startTime"])
@Index(["teacherId", "isRecurring", "dayOfWeek"])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id" })
  teacherId!: string;

  @Column({ name: "start_time", type: "timestamp" })
  startTime!: Date;

  @Column({ name: "end_time", type: "timestamp" })
  endTime!: Date;

  @Column({ name: "is_recurring", default: false })
  isRecurring!: boolean;

  @Column({
    name: "day_of_week",
    type: "varchar",
    length: 10,
    nullable: true,
    comment: "For recurring slots: monday, tuesday, etc.",
  })
  dayOfWeek?: string;

  @Column({
    name: "recurrence_end_date",
    type: "timestamp",
    nullable: true,
    comment: "When recurring slots should stop",
  })
  recurrenceEndDate?: Date;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(SlotStatus),
    default: SlotStatus.AVAILABLE,
  })
  status!: SlotStatus;

  @Column({ name: "max_bookings", default: 1, comment: "For group sessions" })
  maxBookings!: number;

  @Column({ name: "current_bookings", default: 0 })
  currentBookings!: number;

  @Column({ name: "price", type: "decimal", precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ name: "discount_percentage", type: "decimal", precision: 5, scale: 2, default: 0.00, nullable: true })
  discountPercentage?: number;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;

  @OneToMany(() => Booking, (booking) => booking.slot)
  bookings!: Booking[];
}
