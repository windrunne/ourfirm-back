import {
  CLOSING_SALUTATION,
  CONFIDENCE,
  MIN_CONFIDENCE,
  REGION_BANDS,
  REGION_PADDING,
  SIGNATURE_ANCHOR,
} from "../../constants/extraction.js";
import type { LocatedRegion, NormRect } from "../../types.js";
import { clampUnit, normalizeRect } from "./geometry.js";

export interface WordBox {
  text: string;
  box: NormRect;
  confidence: number;
}

export interface PageWords {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  words: WordBox[];
}

export function unionRect(boxes: NormRect[]): NormRect | null {
  if (boxes.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return normalizeRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function centerY(box: NormRect): number {
  return box.y + box.height / 2;
}

export function locateLetterhead(first: PageWords | undefined): LocatedRegion {
  const pageIndex = first?.index ?? 0;
  if (!first || first.words.length === 0) {
    return missing("letterhead", pageIndex, "No text recognised in the top band of the first page.");
  }
  const band = REGION_BANDS.letterhead.bottom;
  const inBand = first.words.filter((word) => centerY(word.box) <= band);
  const box = unionRect(inBand.map((word) => word.box));
  if (!box) {
    return missing("letterhead", pageIndex, "No text recognised in the top band of the first page.");
  }
  return {
    type: "letterhead",
    pageIndex,
    box: padded(box),
    detected: true,
    confidence: averageConfidence(inBand),
  };
}

export function locateFooter(last: PageWords | undefined): LocatedRegion {
  const pageIndex = last?.index ?? 0;
  if (!last || last.words.length === 0) {
    return missing("footer", pageIndex, "No text recognised in the bottom band of the last page.");
  }
  const band = REGION_BANDS.footer.top;
  const inBand = last.words.filter((word) => centerY(word.box) >= band);
  const box = unionRect(inBand.map((word) => word.box));
  if (!box) {
    return missing("footer", pageIndex, "No text recognised in the bottom band of the last page.");
  }
  return {
    type: "footer",
    pageIndex,
    box: padded(box),
    detected: true,
    confidence: averageConfidence(inBand),
  };
}

export function locateSignature(last: PageWords | undefined): LocatedRegion {
  const pageIndex = last?.index ?? 0;
  if (!last || last.words.length === 0) {
    return missing("signature", pageIndex, "No text available to anchor a signature region.");
  }
  const closing = last.words.find((word) => CLOSING_SALUTATION.test(word.text));
  const footerTop = REGION_BANDS.footer.top;

  if (!closing) {
    return missing(
      "signature",
      pageIndex,
      "No closing salutation (e.g. \"Sincerely\") found to anchor the signature region.",
    );
  }

  const top = clampUnit(closing.box.y + closing.box.height + SIGNATURE_ANCHOR.topGap);
  const bottom = clampUnit(Math.min(footerTop - SIGNATURE_ANCHOR.footerGap, top + SIGNATURE_ANCHOR.maxHeight));
  if (bottom <= top) {
    return missing("signature", pageIndex, "Closing salutation is too close to the footer to extract a signature.");
  }
  const left = clampUnit(closing.box.x - SIGNATURE_ANCHOR.leftInset);
  const box: NormRect = normalizeRect({
    x: left,
    y: top,
    width: Math.min(SIGNATURE_ANCHOR.maxWidth, 1 - left),
    height: bottom - top,
  });
  return { type: "signature", pageIndex, box, detected: true, confidence: CONFIDENCE.layoutSignature };
}

export function locateFromWords(first: PageWords | undefined, last: PageWords | undefined): LocatedRegion[] {
  return [locateLetterhead(first), locateFooter(last), locateSignature(last)];
}

function averageConfidence(words: WordBox[]): number {
  if (words.length === 0) return 0;
  const sum = words.reduce((acc, word) => acc + word.confidence, 0);
  return Math.max(MIN_CONFIDENCE, Math.min(1, sum / words.length));
}

function padded(box: NormRect): NormRect {
  const pad = REGION_PADDING.word;
  return normalizeRect({
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  });
}

function missing(
  type: LocatedRegion["type"],
  pageIndex: number,
  note: string,
): LocatedRegion {
  return { type, pageIndex, box: null, detected: false, confidence: 0, note };
}
