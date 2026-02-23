import { Response } from "express";

/**
 * Standardized error response format
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
  message?: string;
}

/**
 * Standardized success response format
 */
export interface SuccessResponse<T = any> {
  message: string;
  data?: T;
  [key: string]: any; // Allow additional fields for flexibility
}

/**
 * Send standardized error response
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  code?: string,
  details?: any
): Response {
  const response: ErrorResponse = {
    error,
    ...(code && { code }),
    ...(details && { details }),
  };

  return res.status(statusCode).json(response);
}

/**
 * Send standardized success response
 */
export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
  additionalFields?: Record<string, any>
): Response {
  const response: SuccessResponse<T> = {
    message,
    ...(data !== undefined && { data }),
    ...additionalFields,
  };

  return res.status(statusCode).json(response);
}

/**
 * Common error codes
 */
export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED",
  AUTHORIZATION_DENIED = "AUTHORIZATION_DENIED",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

