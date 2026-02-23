/**
 * Date utility functions for consistent date handling
 * All dates are handled in UTC to avoid timezone issues
 */

/**
 * Get current date/time in UTC
 */
export function getCurrentUTC(): Date {
  return new Date();
}

/**
 * Convert date to UTC ISO string
 */
export function toUTCString(date: Date | string): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toISOString();
}

/**
 * Parse date string to UTC Date object
 */
export function parseUTCDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Check if date is in the future
 */
export function isFutureDate(date: Date | string): boolean {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj > getCurrentUTC();
}

/**
 * Check if date is in the past
 */
export function isPastDate(date: Date | string): boolean {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj < getCurrentUTC();
}

/**
 * Get date at start of day (00:00:00) in UTC
 */
export function getStartOfDayUTC(date: Date = getCurrentUTC()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get date at end of day (23:59:59.999) in UTC
 */
export function getEndOfDayUTC(date: Date = getCurrentUTC()): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Format date for display (YYYY-MM-DD)
 */
export function formatDate(date: Date | string): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toISOString().split("T")[0];
}

/**
 * Format datetime for display (YYYY-MM-DD HH:mm:ss)
 */
export function formatDateTime(date: Date | string): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toISOString().replace("T", " ").substring(0, 19);
}

