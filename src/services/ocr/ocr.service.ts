import { createWorker, type Worker } from "tesseract.js";
import sharp from "sharp";
import { OCR_MIN_TEXT_LENGTH } from "../../constants/strategy.js";
import type { RasterPage } from "../../types.js";
import type { PageWords, WordBox } from "../extraction/layout-locator.js";
import { logger } from "../../utils/logger.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

export interface PageText {
  index: number;
  text: string;
  words: WordBox[];
  meanConfidence: number;
}

export async function recognizePage(page: RasterPage): Promise<PageText> {
  const worker = await getWorker();
  const meta = await sharp(page.png).metadata();
  const width = meta.width ?? page.width;
  const height = meta.height ?? page.height;

  const { data } = await worker.recognize(page.png, {}, { blocks: true });
  const words: WordBox[] = [];

  const sourceWords = (data as { words?: TesseractWord[] }).words ?? collectWords(data);
  for (const word of sourceWords) {
    if (!word.text?.trim() || !word.bbox) continue;
    words.push({
      text: word.text.trim(),
      confidence: (word.confidence ?? 0) / 100,
      box: {
        x: word.bbox.x0 / width,
        y: word.bbox.y0 / height,
        width: (word.bbox.x1 - word.bbox.x0) / width,
        height: (word.bbox.y1 - word.bbox.y0) / height,
      },
    });
  }

  return {
    index: page.index,
    text: data.text ?? "",
    words,
    meanConfidence: (data.confidence ?? 0) / 100,
  };
}

export async function pageHasTextLayer(text: string): Promise<boolean> {
  return text.replace(/\s+/g, "").length > OCR_MIN_TEXT_LENGTH;
}

export function toPageWords(pageText: PageText, isFirst: boolean, isLast: boolean): PageWords {
  return { index: pageText.index, isFirst, isLast, words: pageText.words };
}

interface TesseractWord {
  text: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

function collectWords(data: unknown): TesseractWord[] {
  const blocks = (data as { blocks?: unknown[] }).blocks ?? [];
  const words: TesseractWord[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const candidate = node as { text?: string; bbox?: TesseractWord["bbox"]; words?: unknown[]; paragraphs?: unknown[]; lines?: unknown[] };
    if (candidate.words) {
      for (const word of candidate.words) words.push(word as TesseractWord);
    }
    for (const key of ["paragraphs", "lines"] as const) {
      const children = candidate[key];
      if (Array.isArray(children)) children.forEach(visit);
    }
  };
  blocks.forEach(visit);
  if (words.length === 0) {
    logger.warn("OCR returned no structured words; falling back to empty word list");
  }
  return words;
}
