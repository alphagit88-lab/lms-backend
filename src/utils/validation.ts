/**
 * Validation utilities for common input validation patterns
 */

/**
 * Validates price is a positive number within reasonable range
 * @param price - Price value to validate
 * @param min - Minimum price (default: 0)
 * @param max - Maximum price (default: 1000000)
 * @returns Validation result with isValid flag and error message
 */
export function validatePrice(
  price: any,
  min: number = 0,
  max: number = 1000000
): { isValid: boolean; error?: string } {
  if (price === undefined || price === null) {
    return { isValid: true }; // Price is optional
  }

  const numPrice = typeof price === "string" ? parseFloat(price) : Number(price);

  if (isNaN(numPrice)) {
    return { isValid: false, error: "Price must be a valid number" };
  }

  if (numPrice < min) {
    return { isValid: false, error: `Price must be at least ${min}` };
  }

  if (numPrice > max) {
    return { isValid: false, error: `Price must not exceed ${max}` };
  }

  return { isValid: true };
}

/**
 * Validates string length matches database constraints
 * @param value - String value to validate
 * @param fieldName - Name of the field (for error messages)
 * @param maxLength - Maximum allowed length
 * @param minLength - Minimum required length (default: 1)
 * @returns Validation result with isValid flag and error message
 */
export function validateStringLength(
  value: any,
  fieldName: string,
  maxLength: number,
  minLength: number = 1
): { isValid: boolean; error?: string } {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional fields are valid if undefined
  }

  if (typeof value !== "string") {
    return { isValid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    return { isValid: false, error: `${fieldName} must be at least ${minLength} character(s)` };
  }

  if (trimmed.length > maxLength) {
    return { isValid: false, error: `${fieldName} must not exceed ${maxLength} characters` };
  }

  return { isValid: true };
}

/**
 * Validates date is in the future
 * @param date - Date value to validate
 * @param fieldName - Name of the field (for error messages)
 * @returns Validation result with isValid flag and error message
 */
export function validateFutureDate(
  date: any,
  fieldName: string
): { isValid: boolean; error?: string } {
  if (!date) {
    return { isValid: false, error: `${fieldName} is required` };
  }

  const dateObj = date instanceof Date ? date : new Date(date);

  if (isNaN(dateObj.getTime())) {
    return { isValid: false, error: `${fieldName} must be a valid date` };
  }

  if (dateObj <= new Date()) {
    return { isValid: false, error: `${fieldName} must be in the future` };
  }

  return { isValid: true };
}

/**
 * Validates date range (start date must be before end date)
 * @param startDate - Start date
 * @param endDate - End date
 * @param fieldNames - Names of the fields (for error messages)
 * @returns Validation result with isValid flag and error message
 */
export function validateDateRange(
  startDate: any,
  endDate: any,
  fieldNames: { start: string; end: string }
): { isValid: boolean; error?: string } {
  if (!startDate || !endDate) {
    return { isValid: false, error: "Both start and end dates are required" };
  }

  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { isValid: false, error: "Both dates must be valid" };
  }

  if (start >= end) {
    return {
      isValid: false,
      error: `${fieldNames.start} must be before ${fieldNames.end}`,
    };
  }

  return { isValid: true };
}

