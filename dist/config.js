import "dotenv/config";
import path from "node:path";
function num(value, fallback) {
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
}
export const config = {
    port: num(process.env.PORT, 4000),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    samplesDir: process.env.SAMPLES_DIR ?? path.resolve(process.cwd(), "..", "samples"),
    clientDist: process.env.CLIENT_DIST ?? "",
    maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
    renderScale: num(process.env.RENDER_SCALE, 2),
    previewMaxWidth: num(process.env.PREVIEW_MAX_WIDTH, 1000),
    openAi: {
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    },
    visionApi: {
        apiKey: process.env.OCR_SPACE_API_KEY ?? "helloworld",
        endpoint: process.env.OCR_SPACE_ENDPOINT ?? "https://api.ocr.space/parse/image",
    },
    regions: {
        letterheadBand: { top: 0, bottom: 0.22 },
        footerBand: { top: 0.88, bottom: 1 },
        signatureBand: { top: 0.4, bottom: 0.95 },
    },
    inkThreshold: 128,
    contentThreshold: 225,
    minContentRatio: 0.002,
    minInkRatio: 0.0006,
};
//# sourceMappingURL=config.js.map