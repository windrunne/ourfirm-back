import { errors } from "../../utils/errors.js";
import { DocxRasterizer } from "./docx.rasterizer.js";
import { PdfRasterizer } from "./pdf.rasterizer.js";
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfRasterizer = new PdfRasterizer();
const docxRasterizer = new DocxRasterizer();
export function resolveSource(fileName, mimeType) {
    const ext = fileName.toLowerCase().split(".").pop() ?? "";
    if (mimeType === PDF_MIME || ext === "pdf") {
        return { kind: "pdf", rasterizer: pdfRasterizer };
    }
    if (mimeType === DOCX_MIME || ext === "docx") {
        return { kind: "docx", rasterizer: docxRasterizer };
    }
    if (ext === "doc" || mimeType === "application/msword") {
        throw errors.unsupportedFile("Legacy .doc files are not supported. Please convert to .docx or PDF and try again.");
    }
    throw errors.unsupportedFile(`Unsupported file type "${mimeType || ext || "unknown"}". Upload a PDF or DOCX document.`);
}
//# sourceMappingURL=index.js.map