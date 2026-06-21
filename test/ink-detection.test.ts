import { describe, expect, it } from "vitest";
import {
  binarize,
  connectedComponents,
  contentBoundingBox,
  detectSignature,
  dilate,
  topContentBlock,
} from "../src/services/extraction/ink-detection.js";
import type { GrayField } from "../src/services/image/image.utils.js";

function blankField(width: number, height: number): GrayField {
  return { width, height, data: new Uint8Array(width * height).fill(255) };
}

function withRect(field: GrayField, x0: number, y0: number, x1: number, y1: number, value = 0): GrayField {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      field.data[y * field.width + x] = value;
    }
  }
  return field;
}

describe("binarize", () => {
  it("marks pixels below the threshold as ink", () => {
    const field: GrayField = { width: 2, height: 1, data: new Uint8Array([10, 200]) };
    expect(Array.from(binarize(field, 128))).toEqual([1, 0]);
  });
});

describe("dilate", () => {
  it("grows a single ink pixel by the radius in both axes", () => {
    const mask = new Uint8Array(25);
    mask[12] = 1;
    const out = dilate(mask, 5, 5, 1);
    expect(out[12]).toBe(1);
    expect(out[11]).toBe(1);
    expect(out[7]).toBe(1);
    expect(out[0]).toBe(0);
  });
});

describe("connectedComponents", () => {
  it("finds two separate blobs", () => {
    const width = 10;
    const height = 5;
    const mask = new Uint8Array(width * height);
    mask[0] = 1;
    mask[1] = 1;
    mask[8] = 1;
    mask[9] = 1;
    const components = connectedComponents(mask, mask, width, height);
    expect(components).toHaveLength(2);
  });
});

describe("contentBoundingBox", () => {
  it("returns null for a blank field", () => {
    expect(contentBoundingBox(blankField(20, 20), 200)).toBeNull();
  });

  it("returns the bounds of the ink region", () => {
    const field = withRect(blankField(100, 100), 20, 30, 40, 50);
    const box = contentBoundingBox(field, 128);
    expect(box).not.toBeNull();
    expect(box!.x).toBeCloseTo(0.2, 1);
    expect(box!.y).toBeCloseTo(0.3, 1);
  });
});

describe("topContentBlock", () => {
  it("returns only the top block when a wide whitespace gap follows it", () => {
    const field = blankField(200, 400);
    withRect(field, 20, 10, 180, 60);
    withRect(field, 20, 300, 180, 340);
    const block = topContentBlock(field, 128, 0.1);
    expect(block).not.toBeNull();
    expect(block!.y).toBeCloseTo(10 / 400, 1);
    expect(block!.height).toBeLessThan(0.3);
  });

  it("returns null for a blank field", () => {
    expect(topContentBlock(blankField(50, 50), 128)).toBeNull();
  });
});

describe("detectSignature", () => {
  it("reports no signature on a blank field", () => {
    const result = detectSignature(blankField(300, 200));
    expect(result.found).toBe(false);
    expect(result.box).toBeNull();
  });

  it("locates an isolated wide ink cluster", () => {
    const field = withRect(blankField(300, 200), 30, 150, 180, 175);
    const result = detectSignature(field, { minInkRatio: 0.0001 });
    expect(result.found).toBe(true);
    expect(result.box).not.toBeNull();
    expect(result.box!.y).toBeGreaterThan(0.5);
  });

  it("ignores a thin full-width rule line", () => {
    const field = withRect(blankField(300, 200), 0, 100, 300, 102);
    const result = detectSignature(field, { minInkRatio: 0.0001 });
    expect(result.found).toBe(false);
  });
});
