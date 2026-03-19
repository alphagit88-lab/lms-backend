import rateLimit from "express-rate-limit";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Rate limiter for authentication endpoints
 * Prevents brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 10, // Dev: unlimited; Prod: 10 attempts per 15 min
  message: "Too many login attempts from this IP, please try again after 15 minutes",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: () => isDev,
});

/**
 * Rate limiter for registration endpoint
 * Prevents spam registrations
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDev ? 1000 : 10, // Dev: unlimited; Prod: 10 per hour
  message: "Too many registration attempts from this IP, please try again after 1 hour",
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

/**
 * Rate limiter for password reset endpoint
 * Prevents abuse of reset functionality
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 5, // Dev: unlimited; Prod: 5 per 15 min
  message: "Too many password reset attempts from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

/**
 * Rate limiter for general API endpoints
 * Prevents abuse and DDoS
 */
export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isDev ? 10000 : 200, // Dev: unlimited; Prod: 200 per minute
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

/**
 * Rate limiter for file upload endpoints
 * Prevents abuse of file storage
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 20, // Dev: unlimited; Prod: 20 uploads per 15 min
  message: "Too many file uploads from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

