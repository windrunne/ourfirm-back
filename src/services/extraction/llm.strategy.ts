import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import { config } from "../../config.js";
import { CONFIDENCE } from "../../constants/extraction.js";
import { LLM } from "../../constants/strategy.js";
import type { LocatedRegion, NormRect, RasterDocument, RasterPage, RegionType } from "../../types.js";
import { errors } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { normalizeRect } from "./geometry.js";
import { HeuristicLocator } from "./heuristic.strategy.js";
import { missingRegion, REGION_TYPES } from "./strategy.js";
import type { LocatorContext, RegionLocator } from "./strategy.js";

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

type RegionAnswer = z.infer<typeof boxSchema>;

const PROMPT = `You are a precise document-layout analyst. You are given an image of the FIRST page and an image of the LAST page of a document (they may be identical).
Return STRICT JSON with keys "letterhead", "footer", "signature".
- "letterhead": the company name/logo/contact block at the TOP of the FIRST page.
- "footer": the small text/page-number band at the BOTTOM of the LAST page.
- "signature": a handwritten or stylised signature mark on the LAST page (NOT the typed name).
Each value is an object: { "present": boolean, "box": [x, y, width, height], "note": string }.
Coordinates are fractions in [0,1] relative to the page the region belongs to (letterhead -> first page, footer/signature -> last page).
If a region is absent, set "present": false and omit "box". Respond with JSON only.`;

export interface LlmClient {
  complete(dataUrls: string[]): Promise<string>;
}

class OpenAiClient implements LlmClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(dataUrls: string[]): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: config.openAi.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            ...dataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        },
      ],
    });
    return completion.choices[0]?.message?.content ?? "{}";
  }
}

export class LlmLocator implements RegionLocator {
  readonly name = "llm" as const;
  private readonly client: LlmClient | null;

  constructor(client?: LlmClient) {
    this.client = client ?? (config.openAi.apiKey ? new OpenAiClient(config.openAi.apiKey) : null);
  }

  isAvailable(): { ok: boolean; reason?: string } {
    return {
      ok: this.client !== null,
      reason: "OpenAI API key not configured (set OPENAI_API_KEY to enable LLM extraction).",
    };
  }

  async locate(doc: RasterDocument, ctx: LocatorContext): Promise<LocatedRegion[]> {
    if (!this.client) {
      throw errors.strategyUnavailable("OpenAI API key not configured.");
    }
    const first = doc.pages[0];
    const last = doc.pages[doc.pages.length - 1];
    const dataUrls =
      first.index === last.index
        ? [await encode(first)]
        : [await encode(first), await encode(last)];

    let raw: string;
    try {
      raw = await this.client.complete(dataUrls);
    } catch (error) {
      throw errors.renderFailed(
        `LLM extraction request failed. (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    const parsed = safeParse(raw);
    if (!parsed) {
      logger.warn("llm.locate parse failure", { raw: raw.slice(0, 200) });
    }

    const grounded = await new HeuristicLocator().locate(doc, ctx);
    const byType = new Map(grounded.map((region) => [region.type, region]));
    const pageFor = (type: RegionType) => (type === "letterhead" ? first.index : last.index);

    return REGION_TYPES.map((type) => {
      const answer = parsed ? parsed[type] : undefined;
      const present = parsed ? answer!.present : Boolean(byType.get(type)?.detected);
      if (!present) {
        return missingRegion(type, pageFor(type), answer?.note ?? `The model reported no ${type}.`);
      }

      const geometry = byType.get(type);
      if (geometry?.detected && geometry.box) {
        return {
          type,
          pageIndex: geometry.pageIndex,
          box: geometry.box,
          detected: true,
          confidence: CONFIDENCE.llmGrounded,
          note: "Confirmed by the model and located from document geometry.",
        };
      }

      const hint = answerBox(answer);
      if (hint) {
        return {
          type,
          pageIndex: pageFor(type),
          box: hint,
          detected: true,
          confidence: CONFIDENCE.llmApproximate,
          note: "Approximate region reported by the model.",
        };
      }

      return missingRegion(
        type,
        pageFor(type),
        "The model reported this region but it could not be located precisely.",
      );
    });
  }
}

async function encode(page: RasterPage): Promise<string> {
  const buffer = await sharp(page.png)
    .resize({ width: LLM.sendWidth, withoutEnlargement: true })
    .jpeg({ quality: LLM.jpegQuality })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function safeParse(raw: string): z.infer<typeof responseSchema> | null {
  try {
    const json = JSON.parse(extractJson(raw));
    const result = responseSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

function answerBox(answer: RegionAnswer | undefined): NormRect | null {
  if (!answer?.present || !answer.box) return null;
  const [x, y, width, height] = answer.box;
  const box = normalizeRect({ x, y, width, height });
  return box.width > 0 && box.height > 0 ? box : null;
}
