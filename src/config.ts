import dotenv from "dotenv";
import path from "node:path";

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
]) {
  dotenv.config({ path: candidate });
}

function num(value: string | undefined, fallback: number): number {
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
} as const;

export type AppConfig = typeof config;
