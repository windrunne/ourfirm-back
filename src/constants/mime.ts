export const MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  octetStream: "application/octet-stream",
} as const;

export const ALLOWED_EXTENSIONS = ["pdf", "docx"] as const;

export const ALLOWED_UPLOAD_MIME: readonly string[] = [
  MIME_TYPES.pdf,
  MIME_TYPES.docx,
  MIME_TYPES.octetStream,
];
