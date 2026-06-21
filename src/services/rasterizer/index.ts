import { MIME_TYPES } from "../../constants/mime.js";
import { errors } from "../../utils/errors.js";
import { DocxRasterizer } from "./docx.rasterizer.js";
import { PdfRasterizer } from "./pdf.rasterizer.js";
import type { DocumentRasterizer } from "./types.js";
import type { SourceKind } from "../../types.js";

const pdfRasterizer = new PdfRasterizer();
const docxRasterizer = new DocxRasterizer();

export interface ResolvedSource {
  kind: SourceKind;
  rasterizer: DocumentRasterizer;
}

export function resolveSource(fileName: string, mimeType: string): ResolvedSource {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mimeType === MIME_TYPES.pdf || ext === "pdf") {
    return { kind: "pdf", rasterizer: pdfRasterizer };
  }
  if (mimeType === MIME_TYPES.docx || ext === "docx") {
    return { kind: "docx", rasterizer: docxRasterizer };
  }
  if (ext === "doc" || mimeType === MIME_TYPES.doc) {
    throw errors.unsupportedFile(
      "Legacy .doc files are not supported. Please convert to .docx or PDF and try again.",
    );
  }
  throw errors.unsupportedFile(
    `Unsupported file type "${mimeType || ext || "unknown"}". Upload a PDF or DOCX document.`,
  );
}

export type { DocumentRasterizer } from "./types.js";
