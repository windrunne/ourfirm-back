import { MulterError } from "multer";
import { errors, isAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
export function notFoundHandler(_req, res) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}
export function errorHandler(error, _req, res, _next) {
    const appError = normalize(error);
    if (appError.status >= 500) {
        logger.error("request failed", { code: appError.code, message: appError.message });
    }
    else {
        logger.warn("request rejected", { code: appError.code, message: appError.message });
    }
    res.status(appError.status).json({
        error: { code: appError.code, message: appError.message, details: appError.details },
    });
}
function normalize(error) {
    if (isAppError(error))
        return error;
    if (error instanceof MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return errors.fileTooLarge("The uploaded file exceeds the maximum allowed size.");
        }
        return errors.validation(`Upload error: ${error.message}`);
    }
    logger.error("unexpected error", { message: error instanceof Error ? error.message : String(error) });
    return errors.internal("An unexpected error occurred while processing the document.");
}
//# sourceMappingURL=errorHandler.js.map