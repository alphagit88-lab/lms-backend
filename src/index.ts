import "reflect-metadata";
import express, { Application, Request, Response } from "express";
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
import { RecordingFetchJob } from "./jobs/RecordingFetchJob";
import { startPayoutJob } from "./jobs/PayoutJob";
import { startBookingCleanupJob } from "./jobs/BookingCleanupJob";
import { startReminderJob } from "./jobs/ReminderJob";
import { startParentReportJob } from "./jobs/ParentReportJob";
import { startPerformanceAlertJob } from "./jobs/PerformanceAlertJob";

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(async (req: Request, res: Response, next) => {
  if (!AppDataSource.isInitialized) {
    try {
      await AppDataSource.initialize();
      console.log("✓ Database connected successfully (Serverless)");
    } catch (error) {
      console.error("✗ Database connection failed:", error);
      return res.status(500).json({ error: "Database connection failed" });
    }
  }
  next();
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));

app.use(cookieParser());

// Lazy DB init for serverless environments (e.g. Vercel)
app.use(async (req: Request, res: Response, next) => {
  if (!AppDataSource.isInitialized) {
    try {
      await AppDataSource.initialize();
      console.log("✓ Database connected (serverless/lazy init)");
    } catch (error: any) {
      console.error("✗ Database connection failed:", error);
      // Detailed error for debugging deployment issues (Vercel)
      return res.status(500).json({ 
        error: "Database connection failed", 
        message: error?.message || "Unknown error occurred during connection",
        hint: "Make sure your Vercel Environment Variables are correctly set and DB_SSL is 'true' if using Neon."
      });
    }
  }
  next();
});

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Use HTTPS in production
      // Frontend and backend are on different domains after deployment,
      // so SameSite must be None (with secure=true) in production.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: parseInt(process.env.SESSION_MAX_AGE || "86400000"), // 24 hours default
    },
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request ID middleware (should be early in the chain)
app.use(requestIdMiddleware);

// Input sanitization (before other middleware)
app.use(sanitizeInput);

// Session expiration handling
app.use(handleSessionExpiration);

// Rate limiting for all API routes
app.use("/api", apiRateLimiter);

// Serve static files (uploads)
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDir));

// Data sanitization middleware (removes passwords from responses)
app.use(sanitizeUserData);

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "LMS Backend API is running" });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
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


