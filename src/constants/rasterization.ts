export const RASTER_MAX_PAGES = 30;

export const DOCX_LAYOUT = {
  pageWidth: 794,
  pageHeight: 1123,
  margin: 70,
  bodyFontSize: 15,
  headingSizes: { h1: 30, h2: 24, h3: 20, h4: 17, h5: 15, h6: 14 } as Record<string, number>,
  lineHeightRatio: 1.45,
  headingSpaceBefore: 10,
  paragraphSpaceAfter: 6,
  imageGap: 10,
  footerFontSize: 9,
  textColor: "#111111",
  footerColor: "#888888",
  footerRuleColor: "#dddddd",
  pageBackground: "#ffffff",
} as const;
