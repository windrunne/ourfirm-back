import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { LlmLocator, type LlmClient } from "../src/services/extraction/llm.strategy.js";
import type { RasterDocument } from "../src/types.js";

async function fakeDoc(): Promise<RasterDocument> {
  const png = await sharp({
    create: { width: 200, height: 280, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  return { source: "pdf", pages: [{ index: 0, width: 200, height: 280, png }] };
}

function client(payload: unknown): LlmClient {
  return { complete: async () => JSON.stringify(payload) };
}

describe("LlmLocator", () => {
  it("is unavailable without a configured client", () => {
    const original = config.openAi.apiKey;
    (config.openAi as { apiKey: string }).apiKey = "";
    try {
      expect(new LlmLocator(undefined).isAvailable().ok).toBe(false);
    } finally {
      (config.openAi as { apiKey: string }).apiKey = original;
    }
  });

  it("maps a well-formed response into located regions", async () => {
    const locator = new LlmLocator(
      client({
        letterhead: { present: true, box: [0.1, 0.02, 0.8, 0.15] },
        footer: { present: true, box: [0.1, 0.9, 0.8, 0.06] },
        signature: { present: false, note: "no signature" },
      }),
    );
    const regions = await locator.locate(await fakeDoc(), { useOcr: false });
    const byType = Object.fromEntries(regions.map((r) => [r.type, r]));
    expect(byType.letterhead.detected).toBe(true);
    expect(byType.letterhead.box?.width).toBeCloseTo(0.8, 1);
    expect(byType.footer.detected).toBe(true);
    expect(byType.signature.detected).toBe(false);
    expect(byType.signature.note).toBe("no signature");
  });

  it("falls back to not-detected when the model returns invalid JSON", async () => {
    const locator = new LlmLocator({ complete: async () => "not json at all" });
    const regions = await locator.locate(await fakeDoc(), { useOcr: false });
    expect(regions.every((region) => !region.detected)).toBe(true);
  });

  it("rejects a zero-area box", async () => {
    const locator = new LlmLocator(
      client({
        letterhead: { present: true, box: [0.1, 0.1, 0, 0] },
        footer: { present: false },
        signature: { present: false },
      }),
    );
    const regions = await locator.locate(await fakeDoc(), { useOcr: false });
    expect(regions.find((r) => r.type === "letterhead")?.detected).toBe(false);
  });
});
