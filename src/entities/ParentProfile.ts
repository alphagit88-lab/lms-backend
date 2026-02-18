import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

export enum RelationshipType {
  MOTHER = "mother",
  FATHER = "father",
  GUARDIAN = "guardian",
  GRANDPARENT = "grandparent",
  OTHER = "other",
}

@Entity("parent_profiles")
export class ParentProfile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "parent_id", unique: true })
  parentId!: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: Object.values(RelationshipType),
    default: RelationshipType.GUARDIAN,
  })
  relationship!: RelationshipType;

  @Column({ length: 200, nullable: true })
  occupation?: string;

  @Column({ name: "emergency_contact", length: 20, nullable: true })
  emergencyContact?: string;

  @Column({ name: "preferred_language", length: 50, nullable: true })
  preferredLanguage?: string;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ type: "json", nullable: true })
  metadata?: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_id" })
  parent!: User;
}
