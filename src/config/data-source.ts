import { DataSource } from "typeorm";
import dotenv from "dotenv";

// --- Explicit entity imports (required for Vercel serverless bundling) ---
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Course } from "../entities/Course";
import { Lesson } from "../entities/Lesson";
import { Enrollment } from "../entities/Enrollment";
import { LessonProgress } from "../entities/LessonProgress";
import { StudentParent } from "../entities/StudentParent";
import { TeacherAssistant } from "../entities/TeacherAssistant";
import { AvailabilitySlot } from "../entities/AvailabilitySlot";
import { Booking } from "../entities/Booking";
import { BookingPackage } from "../entities/BookingPackage";
import { Payment } from "../entities/Payment";
import { Transaction } from "../entities/Transaction";
import { Payout } from "../entities/Payout";
import { Exam } from "../entities/Exam";
import { Question } from "../entities/Question";
import { QuestionOption } from "../entities/QuestionOption";
import { AnswerSubmission } from "../entities/AnswerSubmission";
import { Class } from "../entities/Class";
import { Session } from "../entities/Session";
import { Recording } from "../entities/Recording";
import { StudentProfile } from "../entities/StudentProfile";
import { TeacherProfile } from "../entities/TeacherProfile";
import { ParentProfile } from "../entities/ParentProfile";
import { ProgressReport } from "../entities/ProgressReport";
import { Notification } from "../entities/Notification";
import { Content } from "../entities/Content";
import { AppSession } from "../entities/AppSession";

import * as pg from "@neondatabase/serverless";
dotenv.config();

// Attempt to set up WebSockets for Node environments if ws is available
// (Native WebSockets in Node 22+ are also automatically detected by newer neon-serverless versions)
try {
  const ws = require("ws");
  if (ws && (pg as any).neonConfig) {
      (pg as any).neonConfig.webSocketConstructor = ws;
  }
} catch (e) {
  // ws not found, neon-serverless will try to use global.WebSocket or fallback
}

export const AppDataSource = new DataSource({
  type: "postgres",
  driver: pg,
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || "lms_db",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  synchronize: false, // Turn off for stability during dev debugging
  logging: true, // Show us what's happening
  entities: [

    User, Category, Course, Lesson, Enrollment, LessonProgress,
    StudentParent, TeacherAssistant,
    AvailabilitySlot, Booking, BookingPackage,
    Payment, Transaction, Payout,
    Exam, Question, QuestionOption, AnswerSubmission,
    Class, Session, Recording,
    StudentProfile, TeacherProfile, ParentProfile,
    ProgressReport, Notification, Content, AppSession,
  ],
  migrations: [],
  subscribers: [],
});
