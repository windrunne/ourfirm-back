import sharp from "sharp";
import { config } from "../../config.js";
import { CONFIDENCE } from "../../constants/extraction.js";
import { VISION } from "../../constants/strategy.js";
import type { LocatedRegion, RasterDocument, RasterPage } from "../../types.js";
import { errors } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { locateFromWords, type PageWords, type WordBox } from "./layout-locator.js";
import type { LocatorContext, RegionLocator } from "./strategy.js";

interface OcrSpaceWord {
  WordText: string;
  Left: number;
  Top: number;
  Height: number;
  Width: number;
}

interface OcrSpaceResponse {
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: Array<{
    TextOverlay?: { Lines?: Array<{ Words?: OcrSpaceWord[] }> };
  }>;
}

export class VisionLocator implements RegionLocator {
  readonly name = "vision" as const;

  isAvailable(): { ok: boolean; reason?: string } {
    return { ok: Boolean(config.visionApi.apiKey), reason: "OCR.space API key not configured." };
  }

  async locate(doc: RasterDocument, _ctx: LocatorContext): Promise<LocatedRegion[]> {
    const first = doc.pages[0];
    const last = doc.pages[doc.pages.length - 1];
    const firstWords = await this.recognize(first, true, first.index === last.index);
    const lastWords =
      first.index === last.index ? firstWords : await this.recognize(last, false, true);
    return locateFromWords(firstWords, lastWords);
  }

  private async recognize(page: RasterPage, isFirst: boolean, isLast: boolean): Promise<PageWords> {
    const resized = sharp(page.png).resize({ width: VISION.sendWidth, withoutEnlargement: true });
    const { data, info } = await resized.jpeg({ quality: VISION.jpegQuality }).toBuffer({ resolveWithObject: true });
    const base64 = `data:image/jpeg;base64,${data.toString("base64")}`;

    const body = new URLSearchParams();
    body.set("base64Image", base64);
    body.set("isOverlayRequired", "true");
    body.set("OCREngine", VISION.ocrEngine);
    body.set("scale", "true");

    let response: Response;
    try {
      response = await fetch(config.visionApi.endpoint, {
        method: "POST",
        headers: { apikey: config.visionApi.apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (error) {
      throw errors.renderFailed(
        `Could not reach the hosted vision API. (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    if (!response.ok) {
      throw errors.renderFailed(`Hosted vision API returned HTTP ${response.status}.`);
    }

    const json = (await response.json()) as OcrSpaceResponse;
    if (json.IsErroredOnProcessing) {
      const message = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : json.ErrorMessage;
      throw errors.renderFailed(`Hosted vision API error: ${message ?? "unknown"}.`);
    }

    const words = parseWords(json, info.width, info.height);
    logger.info("vision.recognize", { page: page.index, words: words.length });
    return { index: page.index, isFirst, isLast, words };
  }
}

function parseWords(json: OcrSpaceResponse, width: number, height: number): WordBox[] {
  const lines = json.ParsedResults?.[0]?.TextOverlay?.Lines ?? [];
  const words: WordBox[] = [];
  for (const line of lines) {
    for (const word of line.Words ?? []) {
      if (!word.WordText?.trim()) continue;
      words.push({
        text: word.WordText.trim(),
        confidence: CONFIDENCE.visionWord,
        box: {
          x: word.Left / width,
          y: word.Top / height,
          width: word.Width / width,
          height: word.Height / height,
        },
      });
    }
  }
  return words;
}
