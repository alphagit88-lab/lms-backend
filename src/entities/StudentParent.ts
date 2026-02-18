import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn,
  ManyToOne,
  JoinColumn 
} from "typeorm";
import { User } from "./User";

export enum LinkStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected"
}

@Entity("student_parents")
export class StudentParent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "student_id", type: "uuid" })
  studentId!: string;

  @Column({ name: "parent_id", type: "uuid" })
  parentId!: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: LinkStatus,
    default: LinkStatus.PENDING,
  })
  status!: LinkStatus;

  @Column({ type: "text", nullable: true })
  message?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ name: "accepted_at", type: "timestamp", nullable: true })
  acceptedAt?: Date;

  // Relationships
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: "student_id" })
  student!: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: "parent_id" })
  parent!: User;
}
