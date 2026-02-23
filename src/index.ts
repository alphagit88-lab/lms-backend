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

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Use HTTPS in production
      sameSite: "lax",
      maxAge: parseInt(process.env.SESSION_MAX_AGE || "86400000"), // 24 hours default
    },
  })
);

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "LMS Backend API is running" });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api", userRoutes);

// Initialize Database and Start Server
AppDataSource.initialize()
  .then(() => {
    console.log("✓ Database connected successfully");
    
    app.listen(PORT, () => {
      console.log(`✓ Server is running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch((error) => {
    console.error("✗ Database connection failed:", error);
    process.exit(1);
  });

export default app;


