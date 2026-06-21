import multer from "multer";
import { config } from "../config.js";
const ALLOWED_EXTENSIONS = ["pdf", "docx"];
const ALLOWED_MIME = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
]);
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
        const ext = file.originalname.toLowerCase().split(".").pop() ?? "";
        if (ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME.has(file.mimetype)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
});
//# sourceMappingURL=upload.js.map