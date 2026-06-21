import { describe, expect, it } from "vitest";
import {
  locateFooter,
  locateLetterhead,
  locateSignature,
  unionRect,
  type PageWords,
  type WordBox,
} from "../src/services/extraction/layout-locator.js";

function word(text: string, x: number, y: number, w = 0.1, h = 0.02, confidence = 0.9): WordBox {
  return { text, confidence, box: { x, y, width: w, height: h } };
}

function page(words: WordBox[], opts: Partial<PageWords> = {}): PageWords {
  return { index: 0, isFirst: true, isLast: true, words, ...opts };
}

describe("unionRect", () => {
  it("returns null for no boxes", () => {
    expect(unionRect([])).toBeNull();
  });

  it("computes the bounding union", () => {
    const box = unionRect([
      { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ]);
    expect(box!.x).toBeCloseTo(0.1);
    expect(box!.width).toBeCloseTo(0.6);
  });
});

describe("locateLetterhead", () => {
  it("detects words in the top band", () => {
    const result = locateLetterhead(page([word("ACME", 0.1, 0.05), word("body", 0.1, 0.5)]));
    expect(result.detected).toBe(true);
    expect(result.box!.y).toBeLessThan(0.1);
  });

  it("reports nothing for an empty page", () => {
    expect(locateLetterhead(page([])).detected).toBe(false);
  });
});

describe("locateFooter", () => {
  it("detects words in the bottom band", () => {
    const result = locateFooter(page([word("Page 1", 0.4, 0.95)]));
    expect(result.detected).toBe(true);
  });

  it("ignores body words above the footer band", () => {
    expect(locateFooter(page([word("body", 0.4, 0.5)])).detected).toBe(false);
  });
});

describe("locateSignature", () => {
  it("anchors the region below a closing salutation", () => {
    const result = locateSignature(page([word("Sincerely", 0.1, 0.7), word("Page", 0.4, 0.95)]));
    expect(result.detected).toBe(true);
    expect(result.box!.y).toBeGreaterThan(0.7);
  });

  it("reports nothing when no closing salutation exists", () => {
    const result = locateSignature(page([word("random", 0.1, 0.7)]));
    expect(result.detected).toBe(false);
    expect(result.note).toMatch(/salutation/i);
  });
});
