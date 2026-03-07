export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "CONFLICT";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError("BAD_REQUEST", message, 400, details);
  }

  static notFound(message: string) {
    return new AppError("NOT_FOUND", message, 404);
  }

  static unauthorized(message: string) {
    return new AppError("UNAUTHORIZED", message, 401);
  }

  static validationError(message: string, details?: unknown) {
    return new AppError("VALIDATION_ERROR", message, 400, details);
  }

  static conflict(message: string) {
    return new AppError("CONFLICT", message, 409);
  }

  static internal(message: string) {
    return new AppError("INTERNAL_ERROR", message, 500);
  }
}
