import sharp from "sharp";
import {
  FLATTEN_BACKGROUND,
  GRAY_FIELD_MAX_WIDTH,
  JPEG_QUALITY,
  PNG_COMPRESSION_LEVEL,
  REGION_FIELD_MAX_WIDTH,
} from "../../constants/image.js";
import type { ImageFormat, NormRect, RegionImage } from "../../types.js";
import { toPixelRect } from "../extraction/geometry.js";

export interface GrayField {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function toGrayField(png: Buffer, maxWidth = GRAY_FIELD_MAX_WIDTH): Promise<GrayField> {
  const base = sharp(png).greyscale();
  const meta = await base.metadata();
  const scale = meta.width && meta.width > maxWidth ? maxWidth / meta.width : 1;
  const pipeline = scale < 1 ? base.resize({ width: Math.round((meta.width ?? maxWidth) * scale) }) : base;
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

export async function regionGrayField(
  png: Buffer,
  rect: NormRect,
  pageWidth: number,
  pageHeight: number,
  maxWidth = REGION_FIELD_MAX_WIDTH,
): Promise<GrayField> {
  const px = toPixelRect(rect, pageWidth, pageHeight);
  const base = sharp(png).extract(px).greyscale();
  const scale = px.width > maxWidth ? maxWidth / px.width : 1;
  const pipeline = scale < 1 ? base.resize({ width: Math.round(px.width * scale) }) : base;
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

export function inkRatio(field: GrayField, threshold: number): number {
  let dark = 0;
  for (let i = 0; i < field.data.length; i += 1) {
    if (field.data[i] < threshold) dark += 1;
  }
  return field.data.length === 0 ? 0 : dark / field.data.length;
}

export async function regionInkRatio(
  png: Buffer,
  rect: NormRect,
  pageWidth: number,
  pageHeight: number,
  threshold: number,
): Promise<number> {
  const px = toPixelRect(rect, pageWidth, pageHeight);
  const cropped = await sharp(png).extract(px).greyscale().raw().toBuffer();
  let dark = 0;
  for (let i = 0; i < cropped.length; i += 1) {
    if (cropped[i] < threshold) dark += 1;
  }
  return cropped.length === 0 ? 0 : dark / cropped.length;
}

export async function cropRegion(
  png: Buffer,
  rect: NormRect,
  pageWidth: number,
  pageHeight: number,
  format: ImageFormat,
): Promise<RegionImage> {
  const px = toPixelRect(rect, pageWidth, pageHeight);
  const extracted = sharp(png).extract(px).flatten({ background: FLATTEN_BACKGROUND });
  const encoded =
    format === "jpeg"
      ? extracted.jpeg({ quality: JPEG_QUALITY })
      : extracted.png({ compressionLevel: PNG_COMPRESSION_LEVEL });
  const buffer = await encoded.toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    format,
    width: meta.width ?? px.width,
    height: meta.height ?? px.height,
    sizeBytes: buffer.length,
    dataUrl: toDataUrl(buffer, format),
  };
}

export async function makePreview(
  png: Buffer,
  maxWidth: number,
  pageNumber: number,
): Promise<{ pageNumber: number; width: number; height: number; dataUrl: string }> {
  const meta = await sharp(png).metadata();
  const needsResize = (meta.width ?? 0) > maxWidth;
  const pipeline = needsResize ? sharp(png).resize({ width: maxWidth }) : sharp(png);
  const buffer = await pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL }).toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return {
    pageNumber,
    width: outMeta.width ?? meta.width ?? maxWidth,
    height: outMeta.height ?? meta.height ?? maxWidth,
    dataUrl: toDataUrl(buffer, "png"),
  };
}

export function toDataUrl(buffer: Buffer, format: ImageFormat): string {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
