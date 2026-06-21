import multer from "multer";
import { config } from "../config.js";
import { ALLOWED_EXTENSIONS, ALLOWED_UPLOAD_MIME } from "../constants/mime.js";

const allowedMime = new Set(ALLOWED_UPLOAD_MIME);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = file.originalname.toLowerCase().split(".").pop() ?? "";
    if ((ALLOWED_EXTENSIONS as readonly string[]).includes(ext) || allowedMime.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
});
