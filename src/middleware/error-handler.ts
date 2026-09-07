import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Base custom application error class carrying HTTP status code and optional error details.
 */
export class AppError extends Error {
  public statusCode: number;
  public details?: Record<string, unknown>;

  /**
   * Creates an instance of AppError.
   *
   * @param message - Descriptive error message.
   * @param statusCode - HTTP status code (defaults to 400).
   * @param details - Optional additional error metadata or validation field information.
   */
  constructor(
    message: string,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Error thrown when input validation fails (HTTP 400).
 */
export class ValidationError extends AppError {
  /**
   * Creates an instance of ValidationError.
   *
   * @param message - Validation failure message.
   * @param details - Optional field validation details.
   */
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, details);
  }
}

/**
 * Error thrown when authentication credentials are missing or invalid (HTTP 401).
 */
export class UnauthorizedError extends AppError {
  /**
   * Creates an instance of UnauthorizedError.
   *
   * @param message - Authorization error message (defaults to 'Unauthorized').
   */
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * Error thrown when an authenticated user lacks required permissions (HTTP 403).
 */
export class ForbiddenError extends AppError {
  /**
   * Creates an instance of ForbiddenError.
   *
   * @param message - Forbidden action message (defaults to 'Forbidden').
   */
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * Error thrown when a requested resource is not found (HTTP 404).
 */
export class NotFoundError extends AppError {
  /**
   * Creates an instance of NotFoundError.
   *
   * @param message - Resource not found message (defaults to 'Not Found').
   */
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

/**
 * Error thrown when a resource state conflict occurs, such as duplicate package versions (HTTP 409).
 */
export class ConflictError extends AppError {
  /**
   * Creates an instance of ConflictError.
   *
   * @param message - Conflict error message.
   * @param details - Optional details regarding the conflict.
   */
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, details);
  }
}

/**
 * Error thrown when rate limits or maximum pending package quotas are exceeded (HTTP 429).
 */
export class RateLimitError extends AppError {
  /**
   * Creates an instance of RateLimitError.
   *
   * @param message - Rate limit exceeded message (defaults to 'Rate limit exceeded').
   */
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
  }
}

/**
 * Global Hono error handling middleware function for converting application errors to standard JSON responses.
 *
 * @param err - Error instance caught by Hono.
 * @param c - Hono context object.
 * @returns JSON response with status code and error details.
 */
export const globalErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        error: err.name,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      err.statusCode as ContentfulStatusCode,
    );
  }

  console.error('Unhandled Error:', err);
  return c.json(
    {
      error: 'InternalServerError',
      message: err.message || 'An unexpected internal server error occurred',
    },
    500,
  );
};
