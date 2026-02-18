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

export enum PaymentStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
  PARTIALLY_REFUNDED = "partially_refunded",
}

export enum PaymentMethod {
  CREDIT_CARD = "credit_card",
  DEBIT_CARD = "debit_card",
  PAYPAL = "paypal",
  STRIPE = "stripe",
  BANK_TRANSFER = "bank_transfer",
  WALLET = "wallet",
}

export enum PaymentType {
  COURSE_ENROLLMENT = "course_enrollment",
  BOOKING_SESSION = "booking_session",
  CONTENT_PURCHASE = "content_purchase",
  SUBSCRIPTION = "subscription",
}

@Entity("payments")
@Index(["userId", "paymentStatus"])
@Index(["paymentDate"])
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", comment: "User who made payment" })
  userId!: string;

  @Column({
    type: "varchar",
    length: 30,
    enum: Object.values(PaymentType),
  })
  paymentType!: PaymentType;

  @Column({ name: "reference_id", comment: "ID of course/booking/content purchased" })
  referenceId!: string;

  @Column({ name: "recipient_id", nullable: true, comment: "Teacher receiving payment" })
  recipientId?: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  platformFee!: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  refundAmount?: number;

  @Column({ length: 3, default: "USD" })
  currency!: string;

  @Column({
    name: "payment_method",
    type: "varchar",
    length: 20,
    enum: Object.values(PaymentMethod),
  })
  paymentMethod!: PaymentMethod;

  @Column({
    name: "payment_status",
    type: "varchar",
    length: 30,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
  })
  paymentStatus!: PaymentStatus;

  @Column({ name: "transaction_id", length: 255, nullable: true })
  transactionId?: string;

  @Column({ name: "stripe_payment_intent_id", length: 255, nullable: true })
  stripePaymentIntentId?: string;

  @Column({ name: "payment_date", type: "timestamp", nullable: true })
  paymentDate?: Date;

  @Column({ name: "refund_date", type: "timestamp", nullable: true })
  refundDate?: Date;

  @Column({ name: "failure_reason", type: "text", nullable: true })
  failureReason?: string;

  @Column({ type: "json", nullable: true })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "recipient_id" })
  recipient?: User;
}
