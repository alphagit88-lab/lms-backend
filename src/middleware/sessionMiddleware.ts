import { Request, Response, NextFunction } from "express";

/**
 * Middleware to handle expired sessions gracefully
 * Checks if session exists but has expired, returns clear error message
 */
export const handleSessionExpiration = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If session exists but userId is missing, session may have expired
  if (req.session && !req.session.userId && req.session.cookie) {
    const maxAge = req.session.cookie.maxAge || 86400000; // Default 24 hours
    const expires = req.session.cookie.expires;

    // Check if session cookie has expired
    if (expires && new Date(expires) < new Date()) {
      return res.status(401).json({
        error: "Session expired",
        message: "Your session has expired. Please log in again.",
        code: "SESSION_EXPIRED",
      });
    }
  }

  next();
};

