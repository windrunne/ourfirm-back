import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { errors, isAppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { cropRegion, makePreview } from "../image/image.utils.js";
import { recognizePage, toPageWords } from "../ocr/ocr.service.js";
import { resolveSource } from "../rasterizer/index.js";
import { HeuristicLocator } from "./heuristic.strategy.js";
import { locateFromWords } from "./layout-locator.js";
import { REGION_TYPES } from "./strategy.js";
import { getLocator } from "./strategy-registry.js";
const PREVIEW_PAGE_LIMIT = 8;
export class ExtractionService {
    async extract(file, options) {
        const started = Date.now();
        const warnings = [];
        if (!file.buffer || file.buffer.length === 0) {
            throw errors.emptyFile();
        }
        const { kind, rasterizer } = resolveSource(file.originalName, file.mimeType);
        const doc = await rasterizer.rasterize(file.buffer, { scale: config.renderScale });
        if (doc.pages.length === 0) {
            throw errors.renderFailed("The document produced no rendered pages.");
        }
        const { regions, strategyUsed } = await this.runStrategy(doc, options, warnings);
        let ocrUsed = false;
        let finalRegions = regions;
        if (options.useOcr && regions.some((region) => !region.detected)) {
            const result = await this.applyOcrFallback(doc, regions, warnings);
            finalRegions = result.regions;
            ocrUsed = result.ocrUsed;
        }
        const regionResults = await this.buildRegions(doc, finalRegions, options);
        const previews = await this.buildPreviews(doc);
        return {
            id: randomUUID(),
            fileName: file.originalName,
            sourceKind: kind,
            format: options.format,
            pageCount: doc.pages.length,
            previews,
            regions: regionResults,
            meta: {
                strategyRequested: options.strategy,
                strategyUsed,
                ocrUsed,
                processingMs: Date.now() - started,
                warnings,
            },
        };
    }
    async runStrategy(doc, options, warnings) {
        const locator = getLocator(options.strategy);
        const availability = locator.isAvailable();
        if (!availability.ok) {
            if (options.strategy === "heuristic") {
                throw errors.strategyUnavailable(availability.reason ?? "Strategy unavailable.");
            }
            warnings.push(`${options.strategy} strategy unavailable (${availability.reason ?? "not configured"}); used the heuristic engine instead.`);
            return { regions: await new HeuristicLocator().locate(doc, options), strategyUsed: "heuristic" };
        }
        try {
            return { regions: await locator.locate(doc, options), strategyUsed: options.strategy };
        }
        catch (error) {
            if (options.strategy === "heuristic")
                throw error;
            const message = isAppError(error) ? error.message : String(error);
            warnings.push(`${options.strategy} strategy failed (${message}); fell back to the heuristic engine.`);
            logger.warn("strategy fallback", { strategy: options.strategy, message });
            return { regions: await new HeuristicLocator().locate(doc, options), strategyUsed: "heuristic" };
        }
    }
    async applyOcrFallback(doc, regions, warnings) {
        try {
            const first = doc.pages[0];
            const last = doc.pages[doc.pages.length - 1];
            const firstText = await recognizePage(first);
            const lastText = first.index === last.index ? firstText : await recognizePage(last);
            const ocrRegions = locateFromWords(toPageWords(firstText, true, first.index === last.index), toPageWords(lastText, first.index === last.index, true));
            const merged = regions.map((region) => {
                if (region.detected)
                    return region;
                const replacement = ocrRegions.find((candidate) => candidate.type === region.type);
                if (replacement?.detected) {
                    return { ...replacement, note: "Recovered via OCR fallback." };
                }
                return region;
            });
            const recovered = merged.some((region, index) => region.detected && !regions[index].detected);
            if (recovered)
                warnings.push("Used OCR fallback to recover one or more regions.");
            return { regions: merged, ocrUsed: true };
        }
        catch (error) {
            warnings.push(`OCR fallback failed (${error instanceof Error ? error.message : String(error)}).`);
            return { regions, ocrUsed: false };
        }
    }
    async buildRegions(doc, located, options) {
        const byType = new Map(located.map((region) => [region.type, region]));
        const results = [];
        for (const type of REGION_TYPES) {
            const region = byType.get(type);
            if (!region || !region.detected || !region.box) {
                results.push({
                    type,
                    detected: false,
                    pageIndex: region?.pageIndex ?? 0,
                    pageNumber: (region?.pageIndex ?? 0) + 1,
                    confidence: 0,
                    box: null,
                    note: region?.note ?? `No ${type} detected.`,
                    image: null,
                });
                continue;
            }
            const page = doc.pages[region.pageIndex] ?? doc.pages[doc.pages.length - 1];
            const image = await cropRegion(page.png, region.box, page.width, page.height, options.format);
            results.push({
                type,
                detected: true,
                pageIndex: region.pageIndex,
                pageNumber: region.pageIndex + 1,
                confidence: Number(region.confidence.toFixed(2)),
                box: region.box,
                note: region.note,
                image,
            });
        }
        return results;
    }
    async buildPreviews(doc) {
        const pages = doc.pages.slice(0, PREVIEW_PAGE_LIMIT);
        const previews = [];
        for (const page of pages) {
            previews.push(await makePreview(page.png, config.previewMaxWidth, page.index + 1));
        }
        return previews;
    }
}
export const extractionService = new ExtractionService();
//# sourceMappingURL=extractor.js.map