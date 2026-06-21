import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { disposeOcr } from "../src/services/ocr/ocr.service.js";

const app = createApp();
const samplesDir = path.resolve(fileURLToPath(new URL("../../samples", import.meta.url)));

afterAll(async () => {
  await disposeOcr();
});

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});

describe("GET /api/strategies", () => {
  it("lists the three strategies with the heuristic always available", async () => {
    const response = await request(app).get("/api/strategies");
    expect(response.status).toBe(200);
    const names = response.body.strategies.map((s: { name: string }) => s.name);
    expect(names).toContain("heuristic");
    const heuristic = response.body.strategies.find((s: { name: string }) => s.name === "heuristic");
    expect(heuristic.available).toBe(true);
  });
});

describe("POST /api/extract", () => {
  it("rejects an unsupported file with 415", async () => {
    const response = await request(app)
      .post("/api/extract")
      .attach("file", Buffer.from("plain text"), "note.txt");
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FILE");
  });

  it("rejects a corrupt PDF with 422", async () => {
    const response = await request(app)
      .post("/api/extract")
      .attach("file", Buffer.from("%PDF-1.4 not really a pdf"), "broken.pdf");
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("CORRUPT_DOCUMENT");
  });

  it("extracts all three regions from the sample PDF", async () => {
    const response = await request(app)
      .post("/api/extract")
      .field("strategy", "heuristic")
      .field("format", "png")
      .attach("file", path.join(samplesDir, "acme-offer-letter.pdf"));

    expect(response.status).toBe(200);
    expect(response.body.pageCount).toBe(1);
    expect(response.body.regions).toHaveLength(3);
    const detected = response.body.regions.filter((r: { detected: boolean }) => r.detected);
    expect(detected.length).toBeGreaterThanOrEqual(2);
    for (const region of detected) {
      expect(region.image.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(region.image.sizeBytes).toBeGreaterThan(0);
    }
    expect(response.body.previews.length).toBeGreaterThan(0);
  });

  it("extracts from the sample DOCX", async () => {
    const response = await request(app)
      .post("/api/extract")
      .field("strategy", "heuristic")
      .attach("file", path.join(samplesDir, "blue-harbor-agreement.docx"));
    expect(response.status).toBe(200);
    expect(response.body.sourceKind).toBe("docx");
  });
});

describe("POST /api/extract/sample", () => {
  it("runs extraction against a named sample", async () => {
    const response = await request(app)
      .post("/api/extract/sample")
      .send({ name: "acme-offer-letter.pdf", strategy: "heuristic" });
    expect(response.status).toBe(200);
    expect(response.body.fileName).toBe("acme-offer-letter.pdf");
  });
});
