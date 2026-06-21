import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import { config } from "../../config.js";
import { errors } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { normalizeRect } from "./geometry.js";
import { missingRegion } from "./strategy.js";
const SEND_WIDTH = 1100;
const boxSchema = z.object({
    present: z.boolean(),
    box: z.array(z.number()).length(4).optional(),
    note: z.string().optional(),
});
const responseSchema = z.object({
    letterhead: boxSchema,
    footer: boxSchema,
    signature: boxSchema,
});
const PROMPT = `You are a precise document-layout analyst. You are given an image of the FIRST page and an image of the LAST page of a document (they may be identical).
Return STRICT JSON with keys "letterhead", "footer", "signature".
- "letterhead": the company name/logo/contact block at the TOP of the FIRST page.
- "footer": the small text/page-number band at the BOTTOM of the LAST page.
- "signature": a handwritten or stylised signature mark on the LAST page (NOT the typed name).
Each value is an object: { "present": boolean, "box": [x, y, width, height], "note": string }.
Coordinates are fractions in [0,1] relative to the page the region belongs to (letterhead -> first page, footer/signature -> last page).
If a region is absent, set "present": false and omit "box". Respond with JSON only.`;
class OpenAiClient {
    client;
    constructor(apiKey) {
        this.client = new OpenAI({ apiKey });
    }
    async complete(dataUrls) {
        const completion = await this.client.chat.completions.create({
            model: config.openAi.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: PROMPT },
                        ...dataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
                    ],
                },
            ],
        });
        return completion.choices[0]?.message?.content ?? "{}";
    }
}
export class LlmLocator {
    name = "llm";
    client;
    constructor(client) {
        this.client = client ?? (config.openAi.apiKey ? new OpenAiClient(config.openAi.apiKey) : null);
    }
    isAvailable() {
        return {
            ok: this.client !== null,
            reason: "OpenAI API key not configured (set OPENAI_API_KEY to enable LLM extraction).",
        };
    }
    async locate(doc, _ctx) {
        if (!this.client) {
            throw errors.strategyUnavailable("OpenAI API key not configured.");
        }
        const first = doc.pages[0];
        const last = doc.pages[doc.pages.length - 1];
        const dataUrls = first.index === last.index
            ? [await encode(first)]
            : [await encode(first), await encode(last)];
        let raw;
        try {
            raw = await this.client.complete(dataUrls);
        }
        catch (error) {
            throw errors.renderFailed(`LLM extraction request failed. (${error instanceof Error ? error.message : String(error)})`);
        }
        const parsed = safeParse(raw);
        if (!parsed) {
            logger.warn("llm.locate parse failure", { raw: raw.slice(0, 200) });
            return [
                missingRegion("letterhead", first.index, "LLM returned an unparseable response."),
                missingRegion("footer", last.index, "LLM returned an unparseable response."),
                missingRegion("signature", last.index, "LLM returned an unparseable response."),
            ];
        }
        return [
            toRegion("letterhead", parsed.letterhead, first.index),
            toRegion("footer", parsed.footer, last.index),
            toRegion("signature", parsed.signature, last.index),
        ];
    }
}
async function encode(page) {
    const buffer = await sharp(page.png)
        .resize({ width: SEND_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
function safeParse(raw) {
    try {
        const json = JSON.parse(extractJson(raw));
        const result = responseSchema.safeParse(json);
        return result.success ? result.data : null;
    }
    catch {
        return null;
    }
}
function extractJson(raw) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}
function toRegion(type, answer, pageIndex) {
    if (!answer.present || !answer.box) {
        return missingRegion(type, pageIndex, answer.note ?? `LLM reported no ${type}.`);
    }
    const [x, y, width, height] = answer.box;
    const box = normalizeRect({ x, y, width, height });
    if (box.width <= 0 || box.height <= 0) {
        return missingRegion(type, pageIndex, `LLM returned an invalid ${type} box.`);
    }
    return { type, pageIndex, box, detected: true, confidence: 0.7, note: answer.note };
}
//# sourceMappingURL=llm.strategy.js.map