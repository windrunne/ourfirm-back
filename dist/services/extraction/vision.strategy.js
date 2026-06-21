import sharp from "sharp";
import { config } from "../../config.js";
import { errors } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { locateFromWords } from "./layout-locator.js";
const SEND_WIDTH = 1000;
export class VisionLocator {
    name = "vision";
    isAvailable() {
        return { ok: Boolean(config.visionApi.apiKey), reason: "OCR.space API key not configured." };
    }
    async locate(doc, _ctx) {
        const first = doc.pages[0];
        const last = doc.pages[doc.pages.length - 1];
        const firstWords = await this.recognize(first, true, first.index === last.index);
        const lastWords = first.index === last.index ? firstWords : await this.recognize(last, false, true);
        return locateFromWords(firstWords, lastWords);
    }
    async recognize(page, isFirst, isLast) {
        const resized = sharp(page.png).resize({ width: SEND_WIDTH, withoutEnlargement: true });
        const { data, info } = await resized.jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
        const base64 = `data:image/jpeg;base64,${data.toString("base64")}`;
        const body = new URLSearchParams();
        body.set("base64Image", base64);
        body.set("isOverlayRequired", "true");
        body.set("OCREngine", "2");
        body.set("scale", "true");
        let response;
        try {
            response = await fetch(config.visionApi.endpoint, {
                method: "POST",
                headers: { apikey: config.visionApi.apiKey, "Content-Type": "application/x-www-form-urlencoded" },
                body,
            });
        }
        catch (error) {
            throw errors.renderFailed(`Could not reach the hosted vision API. (${error instanceof Error ? error.message : String(error)})`);
        }
        if (!response.ok) {
            throw errors.renderFailed(`Hosted vision API returned HTTP ${response.status}.`);
        }
        const json = (await response.json());
        if (json.IsErroredOnProcessing) {
            const message = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : json.ErrorMessage;
            throw errors.renderFailed(`Hosted vision API error: ${message ?? "unknown"}.`);
        }
        const words = parseWords(json, info.width, info.height);
        logger.info("vision.recognize", { page: page.index, words: words.length });
        return { index: page.index, isFirst, isLast, words };
    }
}
function parseWords(json, width, height) {
    const lines = json.ParsedResults?.[0]?.TextOverlay?.Lines ?? [];
    const words = [];
    for (const line of lines) {
        for (const word of line.Words ?? []) {
            if (!word.WordText?.trim())
                continue;
            words.push({
                text: word.WordText.trim(),
                confidence: 0.8,
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
//# sourceMappingURL=vision.strategy.js.map