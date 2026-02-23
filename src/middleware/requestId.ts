import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

/**
 * Middleware to add unique request ID to each request
 * Helps trace requests across distributed systems and logs
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Generate or use existing request ID
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();

  // Add to request object for use in controllers
  (req as any).requestId = requestId;

  // Add to response headers
  res.setHeader("X-Request-Id", requestId);

  // Add to response locals for logging
  res.locals.requestId = requestId;

  next();
};

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string {
  return (req as any).requestId || "unknown";
}

