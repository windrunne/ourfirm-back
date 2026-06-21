export class AppError extends Error {
    code;
    status;
    details;
    constructor(code, message, status, details) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
export const errors = {
    unsupportedFile: (message) => new AppError("UNSUPPORTED_FILE", message, 415),
    emptyFile: () => new AppError("EMPTY_FILE", "The uploaded file is empty.", 400),
    fileTooLarge: (message) => new AppError("FILE_TOO_LARGE", message, 413),
    corruptDocument: (message) => new AppError("CORRUPT_DOCUMENT", message, 422),
    renderFailed: (message) => new AppError("RENDER_FAILED", message, 422),
    strategyUnavailable: (message) => new AppError("STRATEGY_UNAVAILABLE", message, 400),
    validation: (message, details) => new AppError("VALIDATION_ERROR", message, 400, details),
    internal: (message) => new AppError("INTERNAL_ERROR", message, 500),
};
export function isAppError(error) {
    return error instanceof AppError;
}
//# sourceMappingURL=errors.js.map