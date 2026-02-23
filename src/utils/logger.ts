import { Request } from "express";
import { getRequestId } from "../middleware/requestId";

/**
 * Enhanced console logger with request ID support
 */
export class Logger {
  /**
   * Log info message with request ID
   */
  static info(message: string, req?: Request, data?: any) {
    const requestId = req ? getRequestId(req) : undefined;
    const logData = requestId ? `[${requestId}] ${message}` : message;
    console.log(logData, data || "");
  }

  /**
   * Log error message with request ID
   */
  static error(message: string, error?: any, req?: Request) {
    const requestId = req ? getRequestId(req) : undefined;
    const logData = requestId ? `[${requestId}] ${message}` : message;
    console.error(logData, error || "");
  }

  /**
   * Log warning message with request ID
   */
  static warn(message: string, req?: Request, data?: any) {
    const requestId = req ? getRequestId(req) : undefined;
    const logData = requestId ? `[${requestId}] ${message}` : message;
    console.warn(logData, data || "");
  }

  /**
   * Log debug message with request ID
   */
  static debug(message: string, req?: Request, data?: any) {
    if (process.env.NODE_ENV === "development") {
      const requestId = req ? getRequestId(req) : undefined;
      const logData = requestId ? `[${requestId}] ${message}` : message;
      console.debug(logData, data || "");
    }
  }
}

