import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { logger } from "../../utils/logger.js";
let workerPromise = null;
async function getWorker() {
    if (!workerPromise) {
        workerPromise = createWorker("eng");
    }
    return workerPromise;
}
export async function disposeOcr() {
    if (workerPromise) {
        const worker = await workerPromise;
        await worker.terminate();
        workerPromise = null;
    }
}
export async function recognizePage(page) {
    const worker = await getWorker();
    const meta = await sharp(page.png).metadata();
    const width = meta.width ?? page.width;
    const height = meta.height ?? page.height;
    const { data } = await worker.recognize(page.png, {}, { blocks: true });
    const words = [];
    const sourceWords = data.words ?? collectWords(data);
    for (const word of sourceWords) {
        if (!word.text?.trim() || !word.bbox)
            continue;
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
export async function pageHasTextLayer(text) {
    return text.replace(/\s+/g, "").length > 12;
}
export function toPageWords(pageText, isFirst, isLast) {
    return { index: pageText.index, isFirst, isLast, words: pageText.words };
}
function collectWords(data) {
    const blocks = data.blocks ?? [];
    const words = [];
    const visit = (node) => {
        if (!node || typeof node !== "object")
            return;
        const candidate = node;
        if (candidate.words) {
            for (const word of candidate.words)
                words.push(word);
        }
        for (const key of ["paragraphs", "lines"]) {
            const children = candidate[key];
            if (Array.isArray(children))
                children.forEach(visit);
        }
    };
    blocks.forEach(visit);
    if (words.length === 0) {
        logger.warn("OCR returned no structured words; falling back to empty word list");
    }
    return words;
}
//# sourceMappingURL=ocr.service.js.map