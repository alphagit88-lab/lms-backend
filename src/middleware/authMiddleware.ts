import "../types/express-session";
import { Request, Response, NextFunction } from "express";

/**
 * Middleware to check if user is authenticated
 * Verifies that a valid session exists with userId
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please log in to access this resource",
    });
  }

  next();
};

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 * @param roles - Array of allowed roles or single role string
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource",
      });
    }

    if (!req.session.userRole) {
      return res.status(403).json({
        error: "Access denied",
        message: "User role not found",
      });
    }

    if (!roles.includes(req.session.userRole)) {
      return res.status(403).json({
        error: "Access denied",
        message: `This resource requires one of the following roles: ${roles.join(
          ", "
        )}`,
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 * Shorthand for authorize('admin')
 */
export const isAdmin = authorize("admin");

/**
 * Middleware to check if user is instructor or admin
 * Common permission pattern for course management
 */
export const isInstructorOrAdmin = authorize("instructor", "admin");

/**
 * Middleware to check if user is student (any authenticated user can be a student)
 * This includes instructors and admins who can also enroll in courses
 */
export const isStudent = authenticate;
