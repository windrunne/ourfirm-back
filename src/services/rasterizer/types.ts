import type { RasterDocument } from "../../types.js";

export interface RasterizeOptions {
  scale: number;
  maxPages?: number;
}

export interface DocumentRasterizer {
  rasterize(buffer: Buffer, options: RasterizeOptions): Promise<RasterDocument>;
}
