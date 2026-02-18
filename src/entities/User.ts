import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  OneToMany 
} from "typeorm";
import { Course } from "./Course";
import { Enrollment } from "./Enrollment";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 255, select: false })
  password!: string;

  @Column({ name: "first_name", length: 100 })
  firstName!: string;

  @Column({ name: "last_name", length: 100 })
  lastName!: string;

  @Column({ length: 20, nullable: true })
  phone?: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: ["student", "instructor", "parent", "admin"],
    default: "student",
  })
  role!: string;

  @Column({
    type: "varchar",
    length: 20,
    enum: ["active", "inactive", "suspended", "pending"],
    default: "active",
  })
  status!: string;

  @Column({ type: "text", nullable: true })
  bio?: string;

  @Column({ name: "profile_picture", length: 500, nullable: true })
  profilePicture?: string;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @Column({ name: "email_verified", default: false })
  emailVerified!: boolean;

  @Column({ name: "last_login_at", type: "timestamp", nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relationships
  @OneToMany(() => Course, (course) => course.instructor)
  courses!: Course[];

  @OneToMany(() => Enrollment, (enrollment) => enrollment.student)
  enrollments!: Enrollment[];
}
