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
import { Payment } from "./Payment";

export enum TransactionType {
  PAYMENT = "payment",
  REFUND = "refund",
  PAYOUT = "payout",
  PLATFORM_FEE = "platform_fee",
}

@Entity("transactions")
@Index(["userId", "transactionType"])
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "payment_id" })
  paymentId!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column({
    name: "transaction_type",
    type: "varchar",
    length: 20,
    enum: Object.values(TransactionType),
  })
  transactionType!: TransactionType;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount!: number;

  @Column({ length: 3, default: "USD" })
  currency!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "balance_after", type: "decimal", precision: 10, scale: 2, nullable: true })
  balanceAfter?: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  // Relationships
  @ManyToOne(() => Payment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "payment_id" })
  payment!: Payment;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user!: User;
}
