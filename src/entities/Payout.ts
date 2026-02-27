import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn
} from "typeorm";
import { User } from "./User";

export enum PayoutStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
}

export enum PayoutMethod {
    BANK_TRANSFER = "bank_transfer",
    MOBILE_MONEY = "mobile_money",
}

@Entity("payouts")
export class Payout {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ name: "teacher_id" })
    teacherId!: string;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    amount!: number;

    @Column({ name: "period_start", type: "date" })
    periodStart!: Date;

    @Column({ name: "period_end", type: "date" })
    periodEnd!: Date;

    @Column({
        type: "varchar",
        length: 20,
        enum: Object.values(PayoutStatus),
        default: PayoutStatus.PENDING,
    })
    status!: PayoutStatus;

    @Column({
        name: "payout_method",
        type: "varchar",
        length: 50,
        enum: Object.values(PayoutMethod),
        default: PayoutMethod.BANK_TRANSFER,
    })
    payoutMethod!: PayoutMethod;

    @Column({ name: "bank_details", type: "jsonb", nullable: true })
    bankDetails?: Record<string, string>;

    @Column({ name: "processed_at", type: "timestamp", nullable: true })
    processedAt?: Date;

    @Column({ length: 255, nullable: true })
    reference?: string;

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date;

    @ManyToOne(() => User)
    @JoinColumn({ name: "teacher_id" })
    teacher!: User;
}
