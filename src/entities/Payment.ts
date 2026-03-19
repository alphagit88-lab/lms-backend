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
  UNDER_REVIEW = "under_review",
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
  PAYHERE = "payhere",
  BANK_TRANSFER = "bank_transfer",
  WALLET = "wallet",
}

export enum PaymentType {
  COURSE_ENROLLMENT = "course_enrollment",
  BULK_COURSE_ENROLLMENT = "bulk_course_enrollment",
  BOOKING_SESSION = "booking_session",
  BOOKING_PACKAGE = "booking_package",
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

  @Column({ length: 3, default: "LKR" })
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

  /**
   * PayHere order_id (= our payment.id UUID) or legacy Stripe payment intent ID.
   * Column kept as stripe_payment_intent_id for backwards compatibility.
   */
  @Column({ name: "stripe_payment_intent_id", length: 255, nullable: true })
  gatewayOrderId?: string;

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

  // Track if this payment has been paid out
  @Column({ name: "payout_id", nullable: true })
  payoutId?: string;

  // Manual / bank-transfer payment fields
  @Column({ name: "bank_slip_url", length: 500, nullable: true })
  bankSlipUrl?: string;

  @Column({ name: "manual_review_note", type: "text", nullable: true })
  manualReviewNote?: string;
}
