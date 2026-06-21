import * as mupdf from "mupdf";
import { RASTER_MAX_PAGES } from "../../constants/rasterization.js";
import type { RasterDocument, RasterPage } from "../../types.js";
import { errors } from "../../utils/errors.js";
import type { DocumentRasterizer, RasterizeOptions } from "./types.js";

export class PdfRasterizer implements DocumentRasterizer {
  async rasterize(buffer: Buffer, options: RasterizeOptions): Promise<RasterDocument> {
    let doc: mupdf.Document;
    try {
      doc = mupdf.Document.openDocument(buffer, "application/pdf");
    } catch (error) {
      throw errors.corruptDocument(
        `The PDF could not be opened. It may be corrupt or password protected. (${describe(error)})`,
      );
    }

    let total: number;
    try {
      total = doc.countPages();
    } catch (error) {
      throw errors.corruptDocument(`The PDF page tree could not be read. (${describe(error)})`);
    }

    if (total <= 0) {
      throw errors.corruptDocument("The PDF does not contain any pages.");
    }

    const limit = Math.min(total, options.maxPages ?? RASTER_MAX_PAGES);
    const matrix = mupdf.Matrix.scale(options.scale, options.scale);
    const pages: RasterPage[] = [];

    for (let index = 0; index < limit; index += 1) {
      try {
        const page = doc.loadPage(index);
        const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
        const png = Buffer.from(pixmap.asPNG());
        pages.push({ index, width: pixmap.getWidth(), height: pixmap.getHeight(), png });
        pixmap.destroy();
        page.destroy();
      } catch (error) {
        throw errors.renderFailed(
          `Failed to render page ${index + 1} of the PDF. (${describe(error)})`,
        );
      }
    }

    doc.destroy();
    return { pages, source: "pdf" };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
