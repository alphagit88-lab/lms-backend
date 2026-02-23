/**
 * Pagination utilities
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
  totalPages: number;
}

/**
 * Parse pagination parameters from request query
 * @param query - Request query object
 * @param defaultLimit - Default items per page (default: 20)
 * @param maxLimit - Maximum items per page (default: 100)
 * @returns Parsed pagination parameters
 */
export function parsePagination(
  query: any,
  defaultLimit: number = 20,
  maxLimit: number = 100
): PaginationResult {
  const page = Math.max(1, parseInt(query.page) || 1);
  let limit = parseInt(query.limit) || defaultLimit;

  // Enforce maximum limit
  if (limit > maxLimit) {
    limit = maxLimit;
  }

  // Ensure limit is positive
  limit = Math.max(1, limit);

  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    totalPages: 0, // Will be calculated after query
  };
}

/**
 * Calculate total pages from total count and limit
 */
export function calculateTotalPages(totalCount: number, limit: number): number {
  return Math.ceil(totalCount / limit);
}

/**
 * Create pagination metadata for response
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = calculateTotalPages(total, limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

