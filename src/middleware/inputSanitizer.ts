import { Request, Response, NextFunction } from "express";

/**
 * Sanitize string input to prevent XSS attacks
 * Removes HTML tags and dangerous characters
 */
function sanitizeString(input: string): string {
  if (typeof input !== "string") return input;
  
  return input
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[<>'"]/g, "") // Remove dangerous characters
    .trim();
}

/**
 * Recursively sanitize object/array inputs
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === "object") {
    const sanitized: any = {};
    // Use Object.keys() to safely handle null-prototype objects (e.g. Express ParsedQs)
    for (const key of Object.keys(obj)) {
      // Skip file uploads and binary data
      if (key === "file" || key === "buffer" || Buffer.isBuffer(obj[key])) {
        sanitized[key] = obj[key];
      } else {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Middleware to sanitize request body, query, and params
 * Prevents XSS attacks by cleaning user inputs
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    // req.query is a read-only getter in newer Node/Express — mutate in place
    const sanitizedQuery = sanitizeObject(req.query);
    Object.keys(sanitizedQuery).forEach((key) => {
      (req.query as any)[key] = sanitizedQuery[key];
    });
  }
  if (req.params) {
    req.params = sanitizeObject(req.params) as any;
  }
  next();
};

