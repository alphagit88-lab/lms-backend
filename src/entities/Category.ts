import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  OneToMany 
} from "typeorm";
import { Course } from "./Course";

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true, length: 100 })
  name!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ length: 50, nullable: true })
  icon?: string;

  @Column({ name: "sort_order", default: 0 })
  sortOrder!: number;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @OneToMany(() => Course, (course) => course.category)
  courses!: Course[];
}
