import {
  CONTENT_THRESHOLD,
  INK_THRESHOLD,
  LETTERHEAD_MAX_HEIGHT,
  MIN_INK_RATIO,
  REGION_PADDING,
} from "../../constants/extraction.js";
import { GRAY_FIELD_MAX_WIDTH } from "../../constants/image.js";
import type { NormRect, RegionType } from "../../types.js";
import { regionGrayField } from "../image/image.utils.js";
import { offsetRectWithinBand, padRect } from "./geometry.js";
import { contentBoundingBox, detectSignature, topContentBlock } from "./ink-detection.js";

export async function refineRegionBox(
  png: Buffer,
  box: NormRect,
  pageWidth: number,
  pageHeight: number,
  type: RegionType,
): Promise<NormRect> {
  const field = await regionGrayField(png, box, pageWidth, pageHeight, GRAY_FIELD_MAX_WIDTH);

  if (type === "signature") {
    const detection = detectSignature(field, {
      inkThreshold: INK_THRESHOLD,
      minInkRatio: MIN_INK_RATIO,
    });
    if (detection.found && detection.box) {
      return padRect(offsetRectWithinBand(detection.box, box), REGION_PADDING.band);
    }
  }

  if (type === "letterhead") {
    const block = topContentBlock(field, CONTENT_THRESHOLD);
    if (block) {
      const capped = { ...block, height: Math.min(block.height, LETTERHEAD_MAX_HEIGHT) };
      return padRect(offsetRectWithinBand(capped, box), REGION_PADDING.letterhead);
    }
  }

  const content = contentBoundingBox(field, CONTENT_THRESHOLD);
  if (!content) return box;
  return padRect(offsetRectWithinBand(content, box), REGION_PADDING.content);
}
