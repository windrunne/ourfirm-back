export type RegionType = "letterhead" | "footer" | "signature";

export type StrategyName = "heuristic" | "llm" | "vision";

export type ImageFormat = "png" | "jpeg";

export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RasterPage {
  index: number;
  width: number;
  height: number;
  png: Buffer;
}

export interface EmbeddedImage {
  pageIndex: number;
  box: NormRect;
}

export interface RasterDocument {
  pages: RasterPage[];
  source: SourceKind;
  embeddedImages?: EmbeddedImage[];
}

export type SourceKind = "pdf" | "docx";

export interface LocatedRegion {
  type: RegionType;
  pageIndex: number;
  box: NormRect | null;
  detected: boolean;
  confidence: number;
  note?: string;
}

export interface RegionImage {
  format: ImageFormat;
  width: number;
  height: number;
  sizeBytes: number;
  dataUrl: string;
}

export interface RegionResult {
  type: RegionType;
  detected: boolean;
  pageIndex: number;
  pageNumber: number;
  confidence: number;
  box: NormRect | null;
  note?: string;
  image: RegionImage | null;
}

export interface PreviewImage {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface ExtractionMeta {
  strategyRequested: StrategyName;
  strategyUsed: StrategyName;
  ocrUsed: boolean;
  processingMs: number;
  warnings: string[];
}

export interface ExtractionResult {
  id: string;
  fileName: string;
  sourceKind: SourceKind;
  format: ImageFormat;
  pageCount: number;
  previews: PreviewImage[];
  regions: RegionResult[];
  meta: ExtractionMeta;
}

export interface ExtractionOptions {
  strategy: StrategyName;
  format: ImageFormat;
  useOcr: boolean;
}
