import {
  INK_DETECTION,
  INK_THRESHOLD,
  MIN_CONFIDENCE,
  MIN_INK_RATIO,
  SIGNATURE_SCORING,
  TOP_BLOCK_MIN_GAP_FRACTION,
} from "../../constants/extraction.js";
import type { NormRect } from "../../types.js";
import type { GrayField } from "../image/image.utils.js";

export interface InkComponent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

export interface SignatureDetection {
  found: boolean;
  box: NormRect | null;
  inkRatio: number;
  confidence: number;
}

export interface InkDetectionParams {
  inkThreshold: number;
  minInkRatio: number;
  dilationRadius: number;
  ruleLineWidthRatio: number;
}

const DEFAULTS: InkDetectionParams = {
  inkThreshold: INK_THRESHOLD,
  minInkRatio: MIN_INK_RATIO,
  dilationRadius: INK_DETECTION.dilationRadius,
  ruleLineWidthRatio: INK_DETECTION.ruleLineWidthRatio,
};

export function binarize(field: GrayField, threshold: number): Uint8Array {
  const out = new Uint8Array(field.width * field.height);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = field.data[i] < threshold ? 1 : 0;
  }
  return out;
}

export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dx = -radius; dx <= radius && !on; dx += 1) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && mask[row + nx]) on = 1;
      }
      horizontal[row + x] = on;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -radius; dy <= radius && !on; dy += 1) {
        const ny = y + dy;
        if (ny >= 0 && ny < height && horizontal[ny * width + x]) on = 1;
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

export function connectedComponents(
  mask: Uint8Array,
  inkMask: Uint8Array,
  width: number,
  height: number,
): InkComponent[] {
  const labels = new Int32Array(width * height).fill(0);
  const components: InkComponent[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || labels[start] !== 0) continue;
    const label = components.length + 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixels = 0;

    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      const x = idx % width;
      const y = (idx - x) / width;
      if (inkMask[idx]) {
        pixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      if (x > 0 && mask[idx - 1] && labels[idx - 1] === 0) {
        labels[idx - 1] = label;
        stack.push(idx - 1);
      }
      if (x < width - 1 && mask[idx + 1] && labels[idx + 1] === 0) {
        labels[idx + 1] = label;
        stack.push(idx + 1);
      }
      if (y > 0 && mask[idx - width] && labels[idx - width] === 0) {
        labels[idx - width] = label;
        stack.push(idx - width);
      }
      if (y < height - 1 && mask[idx + width] && labels[idx + width] === 0) {
        labels[idx + width] = label;
        stack.push(idx + width);
      }
    }
    components.push({ minX, minY, maxX, maxY, pixels });
  }
  return components;
}

export function scoreComponent(
  component: InkComponent,
  width: number,
  height: number,
  params: InkDetectionParams,
): number {
  const boxWidth = component.maxX - component.minX + 1;
  const boxHeight = component.maxY - component.minY + 1;
  const widthRatio = boxWidth / width;
  const fill = component.pixels / (boxWidth * boxHeight);
  const aspect = boxWidth / Math.max(1, boxHeight);
  const verticalCenter = (component.minY + component.maxY) / 2 / height;

  const s = SIGNATURE_SCORING;
  if (component.pixels < INK_DETECTION.minComponentPixels) return 0;
  if (widthRatio > params.ruleLineWidthRatio && boxHeight < height * INK_DETECTION.ruleLineHeightRatio) {
    return 0;
  }

  let score = component.pixels * (s.widthWeightBase + widthRatio);
  score *= s.verticalBase - verticalCenter * s.verticalBias;
  if (aspect >= s.aspectMin && aspect <= s.aspectMax) score *= s.aspectBonus;
  if (fill > s.fillMin && fill < s.fillMax) score *= s.fillBonus;
  if (widthRatio > s.fullWidthRatio) score *= s.fullWidthPenalty;
  return score;
}

export function topContentBlock(
  field: GrayField,
  threshold: number,
  minGapFraction = TOP_BLOCK_MIN_GAP_FRACTION,
): NormRect | null {
  const { width, height } = field;
  const minInkPerRow = Math.max(1, Math.round(width * 0.004));
  const rowHasInk: boolean[] = new Array(height).fill(false);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (field.data[row + x] < threshold) count += 1;
    }
    rowHasInk[y] = count >= minInkPerRow;
  }

  let firstRow = -1;
  for (let y = 0; y < height; y += 1) {
    if (rowHasInk[y]) {
      firstRow = y;
      break;
    }
  }
  if (firstRow < 0) return null;

  const minGap = Math.max(3, Math.round(height * minGapFraction));
  let lastRow = firstRow;
  let blank = 0;
  for (let y = firstRow; y < height; y += 1) {
    if (rowHasInk[y]) {
      lastRow = y;
      blank = 0;
    } else {
      blank += 1;
      if (blank >= minGap) break;
    }
  }

  let minX = width;
  let maxX = -1;
  for (let y = firstRow; y <= lastRow; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (field.data[row + x] < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < 0) return null;

  return {
    x: minX / width,
    y: firstRow / height,
    width: (maxX - minX + 1) / width,
    height: (lastRow - firstRow + 1) / height,
  };
}

export function contentBoundingBox(field: GrayField, threshold: number): NormRect | null {
  const { width, height } = field;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (field.data[row + x] < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };
}

export function detectSignature(
  field: GrayField,
  params: Partial<InkDetectionParams> = {},
): SignatureDetection {
  const settings = { ...DEFAULTS, ...params };
  const { width, height } = field;
  const inkMask = binarize(field, settings.inkThreshold);

  let inkCount = 0;
  for (let i = 0; i < inkMask.length; i += 1) inkCount += inkMask[i];
  const inkRatio = inkMask.length === 0 ? 0 : inkCount / inkMask.length;
  if (inkRatio < settings.minInkRatio) {
    return { found: false, box: null, inkRatio, confidence: 0 };
  }

  const dilated = dilate(inkMask, width, height, settings.dilationRadius);
  const components = connectedComponents(dilated, inkMask, width, height);

  let best: InkComponent | null = null;
  let bestScore = 0;
  for (const component of components) {
    const score = scoreComponent(component, width, height, settings);
    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  }

  if (!best || bestScore <= 0) {
    return { found: false, box: null, inkRatio, confidence: 0 };
  }

  const pad = Math.round(settings.dilationRadius * SIGNATURE_SCORING.boxPadRatio);
  const minX = Math.max(0, best.minX - pad);
  const minY = Math.max(0, best.minY - pad);
  const maxX = Math.min(width - 1, best.maxX + pad);
  const maxY = Math.min(height - 1, best.maxY + pad);

  const box: NormRect = {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };

  const confidence = clamp01(bestScore / (width * height * SIGNATURE_SCORING.confidenceDivisor));
  return { found: true, box, inkRatio, confidence: Math.max(MIN_CONFIDENCE, confidence) };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
