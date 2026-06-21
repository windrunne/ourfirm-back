import {
  CONFIDENCE,
  CONTENT_THRESHOLD,
  INK_THRESHOLD,
  MIN_CONTENT_RATIO,
  MIN_INK_RATIO,
  REGION_BANDS,
  REGION_PADDING,
} from "../../constants/extraction.js";
import { GRAY_FIELD_MAX_WIDTH, REGION_FIELD_MAX_WIDTH } from "../../constants/image.js";
import type { EmbeddedImage, LocatedRegion, NormRect, RasterDocument, RasterPage } from "../../types.js";
import { bandRect, offsetRectWithinBand, padRect } from "./geometry.js";
import { contentBoundingBox, detectSignature } from "./ink-detection.js";
import { inkRatio, regionGrayField } from "../image/image.utils.js";
import type { LocatorContext, RegionLocator } from "./strategy.js";

const EMBEDDED_IMAGE_MIN_AREA = 0.0008;

export class HeuristicLocator implements RegionLocator {
  readonly name = "heuristic" as const;

  isAvailable(): { ok: boolean } {
    return { ok: true };
  }

  async locate(doc: RasterDocument, _ctx: LocatorContext): Promise<LocatedRegion[]> {
    const first = doc.pages[0];
    const last = doc.pages[doc.pages.length - 1];
    return [
      await this.locateBandRegion("letterhead", first, REGION_BANDS.letterhead),
      await this.locateBandRegion("footer", last, REGION_BANDS.footer),
      await this.locateSignature(last, doc.embeddedImages ?? []),
    ];
  }

  private async locateBandRegion(
    type: "letterhead" | "footer",
    page: RasterPage,
    band: { top: number; bottom: number },
  ): Promise<LocatedRegion> {
    const bandBox = bandRect(band.top, band.bottom);
    const field = await regionGrayField(page.png, bandBox, page.width, page.height, GRAY_FIELD_MAX_WIDTH);
    const ratio = inkRatio(field, CONTENT_THRESHOLD);

    if (ratio < MIN_CONTENT_RATIO) {
      return {
        type,
        pageIndex: page.index,
        box: null,
        detected: false,
        confidence: 0,
        note: `No ${type} content found in the ${type === "letterhead" ? "top" : "bottom"} band of the page.`,
      };
    }

    const local = contentBoundingBox(field, CONTENT_THRESHOLD);
    const box = local
      ? padRect(offsetRectWithinBand(local, bandBox), REGION_PADDING.band)
      : bandBox;

    return {
      type,
      pageIndex: page.index,
      box,
      detected: true,
      confidence: clamp(CONFIDENCE.bandBase + ratio * CONFIDENCE.bandRatioWeight),
    };
  }

  private async locateSignature(
    page: RasterPage,
    embeddedImages: EmbeddedImage[],
  ): Promise<LocatedRegion> {
    const band = REGION_BANDS.signature;
    const imageHint = pickSignatureImage(embeddedImages, page.index, band);
    if (imageHint) {
      return {
        type: "signature",
        pageIndex: page.index,
        box: padRect(imageHint.box, REGION_PADDING.embeddedImage),
        detected: true,
        confidence: CONFIDENCE.embeddedImage,
        note: "Located from an embedded image in the signature area.",
      };
    }

    const bandBox = bandRect(band.top, band.bottom);
    const field = await regionGrayField(page.png, bandBox, page.width, page.height, REGION_FIELD_MAX_WIDTH);
    const detection = detectSignature(field, {
      inkThreshold: INK_THRESHOLD,
      minInkRatio: MIN_INK_RATIO,
    });

    if (!detection.found || !detection.box) {
      return {
        type: "signature",
        pageIndex: page.index,
        box: null,
        detected: false,
        confidence: 0,
        note: "No signature-like ink cluster detected in the lower portion of the last page.",
      };
    }

    const box: NormRect = padRect(offsetRectWithinBand(detection.box, bandBox), REGION_PADDING.signature);
    return {
      type: "signature",
      pageIndex: page.index,
      box,
      detected: true,
      confidence: detection.confidence,
    };
  }
}

function pickSignatureImage(
  images: EmbeddedImage[],
  pageIndex: number,
  band: { top: number; bottom: number },
): EmbeddedImage | null {
  const candidates = images.filter((image) => {
    if (image.pageIndex !== pageIndex) return false;
    const centerY = image.box.y + image.box.height / 2;
    const area = image.box.width * image.box.height;
    return centerY >= band.top && centerY <= band.bottom && area >= EMBEDDED_IMAGE_MIN_AREA;
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.box.y - a.box.y)[0];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
