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

@Entity("teacher_assistants")
@Index(["teacherId", "assistantId"], { unique: true })
export class TeacherAssistant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id" })
  teacherId!: string;

  @Column({ name: "assistant_id" })
  assistantId!: string;

  @Column({ name: "can_manage_slots", default: true })
  canManageSlots!: boolean;

  @Column({ name: "can_manage_bookings", default: true })
  canManageBookings!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "teacher_id" })
  teacher!: User;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "assistant_id" })
  assistant!: User;
}
