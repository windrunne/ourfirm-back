export type ErrorCode =
  | "UNSUPPORTED_FILE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "CORRUPT_DOCUMENT"
  | "RENDER_FAILED"
  | "STRATEGY_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errors = {
  unsupportedFile: (message: string) => new AppError("UNSUPPORTED_FILE", message, 415),
  emptyFile: () => new AppError("EMPTY_FILE", "The uploaded file is empty.", 400),
  fileTooLarge: (message: string) => new AppError("FILE_TOO_LARGE", message, 413),
  corruptDocument: (message: string) => new AppError("CORRUPT_DOCUMENT", message, 422),
  renderFailed: (message: string) => new AppError("RENDER_FAILED", message, 422),
  strategyUnavailable: (message: string) => new AppError("STRATEGY_UNAVAILABLE", message, 400),
  validation: (message: string, details?: unknown) =>
    new AppError("VALIDATION_ERROR", message, 400, details),
  internal: (message: string) => new AppError("INTERNAL_ERROR", message, 500),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
