export const REGION_BANDS = {
  letterhead: { top: 0, bottom: 0.22 },
  footer: { top: 0.88, bottom: 1 },
  signature: { top: 0.4, bottom: 0.95 },
} as const;

export const INK_THRESHOLD = 128;
export const CONTENT_THRESHOLD = 225;
export const MIN_CONTENT_RATIO = 0.002;
export const MIN_INK_RATIO = 0.0006;

export const INK_DETECTION = {
  dilationRadius: 6,
  ruleLineWidthRatio: 0.9,
  minComponentPixels: 12,
  ruleLineHeightRatio: 0.04,
} as const;

export const SIGNATURE_SCORING = {
  widthWeightBase: 0.45,
  verticalBase: 1.15,
  verticalBias: 0.3,
  aspectMin: 1.5,
  aspectMax: 16,
  aspectBonus: 1.6,
  fillMin: 0.012,
  fillMax: 0.35,
  fillBonus: 1.5,
  fullWidthRatio: 0.97,
  fullWidthPenalty: 0.35,
  confidenceDivisor: 0.02,
  boxPadRatio: 0.5,
} as const;

export const TOP_BLOCK_MIN_GAP_FRACTION = 0.12;
export const LETTERHEAD_MAX_HEIGHT = 0.5;

export const REGION_PADDING = {
  band: 0.01,
  content: 0.008,
  signature: 0.012,
  letterhead: 0.01,
  embeddedImage: 0.008,
  word: 0.012,
} as const;

export const SIGNATURE_ANCHOR = {
  topGap: 0.005,
  maxHeight: 0.14,
  leftInset: 0.01,
  maxWidth: 0.55,
  footerGap: 0.01,
} as const;

export const MIN_CONFIDENCE = 0.3;

export const CONFIDENCE = {
  bandBase: 0.4,
  bandRatioWeight: 6,
  embeddedImage: 0.78,
  signatureFloor: 0.3,
  layoutSignature: 0.5,
  llmGrounded: 0.82,
  llmApproximate: 0.6,
  visionWord: 0.8,
} as const;

export const PREVIEW_PAGE_LIMIT = 8;

export const CLOSING_SALUTATION =
  /\b(sincerely|regards|faithfully|truly|cordially|respectfully|warmly|thanks|thank you)\b/i;
