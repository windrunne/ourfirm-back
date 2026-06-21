import * as mupdf from "mupdf";
import { errors } from "../../utils/errors.js";
const MAX_PAGES_DEFAULT = 30;
export class PdfRasterizer {
    async rasterize(buffer, options) {
        let doc;
        try {
            doc = mupdf.Document.openDocument(buffer, "application/pdf");
        }
        catch (error) {
            throw errors.corruptDocument(`The PDF could not be opened. It may be corrupt or password protected. (${describe(error)})`);
        }
        let total;
        try {
            total = doc.countPages();
        }
        catch (error) {
            throw errors.corruptDocument(`The PDF page tree could not be read. (${describe(error)})`);
        }
        if (total <= 0) {
            throw errors.corruptDocument("The PDF does not contain any pages.");
        }
        const limit = Math.min(total, options.maxPages ?? MAX_PAGES_DEFAULT);
        const matrix = mupdf.Matrix.scale(options.scale, options.scale);
        const pages = [];
        for (let index = 0; index < limit; index += 1) {
            try {
                const page = doc.loadPage(index);
                const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
                const png = Buffer.from(pixmap.asPNG());
                pages.push({ index, width: pixmap.getWidth(), height: pixmap.getHeight(), png });
                pixmap.destroy();
                page.destroy();
            }
            catch (error) {
                throw errors.renderFailed(`Failed to render page ${index + 1} of the PDF. (${describe(error)})`);
            }
        }
        doc.destroy();
        return { pages, source: "pdf" };
    }
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=pdf.rasterizer.js.map