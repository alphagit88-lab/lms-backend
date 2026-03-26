import "reflect-metadata";
import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import cookieParser from "cookie-parser";
import { AppDataSource } from "./config/data-source";
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import courseRoutes from "./routes/courseRoutes";
import lessonRoutes from "./routes/lessonRoutes";
import enrollmentRoutes from "./routes/enrollmentRoutes";
import parentRoutes from "./routes/parentRoutes";
import availabilityRoutes from "./routes/availabilityRoutes";
import bookingRoutes from "./routes/bookingRoutes";
import assistantRoutes from "./routes/assistantRoutes";
import profileRoutes from "./routes/profileRoutes";
import adminRoutes from "./routes/adminRoutes";
import contentRoutes from "./routes/contentRoutes";
import recordingRoutes from "./routes/recordingRoutes";
import { sanitizeUserData } from "./middleware/authMiddleware";
import { sanitizeInput } from "./middleware/inputSanitizer";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { handleSessionExpiration } from "./middleware/sessionMiddleware";
import { requestIdMiddleware } from "./middleware/requestId";
import path from "path";
import sessionRoutes from "./routes/sessionRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import examRoutes from "./routes/examRoutes";
import questionRoutes from "./routes/questionRoutes";
import submissionRoutes from "./routes/submissionRoutes";
import gradingRoutes from "./routes/gradingRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import progressReportRoutes from "./routes/progressReportRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import { RecordingFetchJob } from "./jobs/RecordingFetchJob";
import { startPayoutJob } from "./jobs/PayoutJob";
import { startBookingCleanupJob } from "./jobs/BookingCleanupJob";
import { startReminderJob } from "./jobs/ReminderJob";
import { startParentReportJob } from "./jobs/ParentReportJob";
import { startPerformanceAlertJob } from "./jobs/PerformanceAlertJob";

dotenv.config();

const PORT = process.env.PORT || 5000;

const app: Application = express();
app.set("trust proxy", 1);

// 1. CORS MUST BE FIRST to ensure every response has the correct headers
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "https://lms-frontend-chi-six.vercel.app"
    ].filter(Boolean) as string[];
    
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie"]
}));

app.use(cookieParser());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// 2. Lazy DB init for serverless environments (e.g. Vercel)
let dbMigrated = false;
app.use(async (req: Request, res: Response, next) => {
  // CRITICAL: Preflight requests (OPTIONS) MUST skip the database connection
  // Otherwise, the browser hangs forever while the database tries to wake up.
  if (req.method === "OPTIONS") {
    return next();
  }

  if (!AppDataSource.isInitialized) {
    try {
      console.log("... Connecting to database ...");
      await AppDataSource.initialize();
      console.log("✓ Database connected successfully");
    } catch (error: any) {
      console.error("✗ Database connection failed:", error);
      return res.status(500).json({ 
        error: "Database connection failed", 
        message: error?.message || "Unknown error during initialization"
      });
    }
  }

  // One-time migration: ensure `destroyedAt` column exists on app_sessions
  // (Required by connect-typeorm v2 for soft-delete; without it, logout fails
  //  silently and subsequent logins crash with duplicate key errors.)
  if (!dbMigrated) {
    dbMigrated = true; // set early to prevent concurrent migrations
    try {
      const cols = await AppDataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'app_sessions' AND column_name = 'destroyedAt'`
      );
      if (cols.length === 0) {
        await AppDataSource.query(`ALTER TABLE "app_sessions" ADD COLUMN "destroyedAt" TIMESTAMP`);
        // Purge all existing sessions since they lack the destroyedAt column
        // and may cause duplicate key errors
        await AppDataSource.query(`DELETE FROM "app_sessions"`);
        console.log("✓ Added missing destroyedAt column to app_sessions and purged stale sessions");
      }
    } catch (migErr) {
      console.warn("Session migration check failed (non-fatal):", migErr);
    }
  }

  next();
});

import { getSessionStore } from "./config/session-store";

// Session configuration
const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  store: getSessionStore(),
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: parseInt(process.env.SESSION_MAX_AGE || "86400000"),
  },
});

app.use((req: Request, res: Response, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }
  return sessionMiddleware(req, res, next);
});

// Request ID middleware (should be early in the chain)
app.use(requestIdMiddleware);

// Input sanitization (before other middleware)
app.use(sanitizeInput);

// Session expiration handling
app.use(handleSessionExpiration);

// Rate limiting for all API routes
app.use("/api", apiRateLimiter);

// Serve static files (uploads)
const isVercel = !!process.env.VERCEL;
const uploadDir = isVercel 
  ? "/tmp/uploads" 
  : (process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
app.use("/uploads", express.static(uploadDir));

// Data sanitization middleware (removes passwords from responses)
app.use(sanitizeUserData);

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "LMS Backend API is running" });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    secureCookie: (process.env.NODE_ENV === "production" || !!process.env.VERCEL)
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/assistants", assistantRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/grading", gradingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/progress-reports", progressReportRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api", userRoutes);

// Internal endpoint for Vercel Cron / manual triggering
// (Vercel doesn't run long-lived background intervals, so we expose a trigger endpoint.)
app.all("/api/internal/jobs/recordings-fetch", async (req: Request, res: Response) => {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (secret) {
    const providedHeader = req.headers["x-internal-key"];
    const providedQuery = typeof req.query?.key === "string" ? req.query.key : undefined;
    const provided = providedHeader || providedQuery;
    if (provided !== secret) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  try {
    await RecordingFetchJob.run();
    return res.json({ ok: true });
  } catch (error) {
    console.error("Failed to run RecordingFetchJob:", error);
    return res.status(500).json({ error: "Failed to run job" });
  }
});

// Global Error Handler
// Middleware with 4 arguments is treated as error handler by Express
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global error:", err);
  
  if (err instanceof Error) {
    if (err.message.includes("Invalid file type")) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message.includes("File too large")) {
      return res.status(413).json({ error: "File too large. Max size is 100MB." });
    }
  }

  // Multer errors often have a code property
  if (err.code === "LIMIT_FILE_SIZE") {
     return res.status(413).json({ error: "File too large. Max size is 100MB." });
  }

  res.status(500).json({ 
    error: "Internal Server Error", 
    message: err.message || "An unexpected error occurred"
  });
});

// Start server + background jobs only outside Vercel serverless
if (!process.env.VERCEL) {
  AppDataSource.initialize()
    .then(() => {
      console.log("✓ Database connected successfully");

      app.listen(PORT, () => {
        console.log(`✓ Server is running on port ${PORT}`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);

        // Start background jobs
        RecordingFetchJob.start(30 * 60 * 1000); // Check every 30 mins
        startPayoutJob();
        startBookingCleanupJob();
        startReminderJob();
        startParentReportJob();
        startPerformanceAlertJob();
      });
    })
    .catch((error) => {
      console.error("✗ Database connection failed:", error);
      process.exit(1);
    });
}

export default app;


