import { describe, expect, it } from "vitest";
import {
  bandRect,
  clampUnit,
  normalizeRect,
  offsetRectWithinBand,
  padRect,
  toPixelRect,
} from "../src/services/extraction/geometry.js";

describe("clampUnit", () => {
  it("clamps values into the [0,1] range", () => {
    expect(clampUnit(-0.5)).toBe(0);
    expect(clampUnit(1.5)).toBe(1);
    expect(clampUnit(0.42)).toBe(0.42);
  });

  it("treats NaN as zero", () => {
    expect(clampUnit(Number.NaN)).toBe(0);
  });
});

describe("normalizeRect", () => {
  it("keeps rects inside page bounds", () => {
    const rect = normalizeRect({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1);
  });
});

describe("toPixelRect", () => {
  it("converts normalized rects to integer pixel rects", () => {
    const px = toPixelRect({ x: 0.1, y: 0.2, width: 0.5, height: 0.25 }, 1000, 2000);
    expect(px).toEqual({ left: 100, top: 400, width: 500, height: 500 });
  });

  it("never returns a zero-size crop", () => {
    const px = toPixelRect({ x: 0, y: 0, width: 0, height: 0 }, 100, 100);
    expect(px.width).toBeGreaterThanOrEqual(1);
    expect(px.height).toBeGreaterThanOrEqual(1);
  });
});

describe("bandRect", () => {
  it("builds a full-width band between two fractions", () => {
    const band = bandRect(0.1, 0.3);
    expect(band.x).toBe(0);
    expect(band.width).toBe(1);
    expect(band.y).toBeCloseTo(0.1);
    expect(band.height).toBeCloseTo(0.2);
  });
});

describe("offsetRectWithinBand", () => {
  it("maps a local rect into the band coordinate space", () => {
    const band = bandRect(0.5, 1);
    const mapped = offsetRectWithinBand({ x: 0, y: 0, width: 1, height: 0.5 }, band);
    expect(mapped.y).toBeCloseTo(0.5);
    expect(mapped.height).toBeCloseTo(0.25);
  });
});

describe("padRect", () => {
  it("expands a rect and clamps to bounds", () => {
    const padded = padRect({ x: 0, y: 0, width: 0.2, height: 0.2 }, 0.05);
    expect(padded.x).toBe(0);
    expect(padded.width).toBeGreaterThan(0.2);
  });
});
