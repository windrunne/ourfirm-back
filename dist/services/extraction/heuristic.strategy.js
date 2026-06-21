import { config } from "../../config.js";
import { bandRect, offsetRectWithinBand, padRect } from "./geometry.js";
import { contentBoundingBox, detectSignature } from "./ink-detection.js";
import { inkRatio, regionGrayField } from "../image/image.utils.js";
export class HeuristicLocator {
    name = "heuristic";
    isAvailable() {
        return { ok: true };
    }
    async locate(doc, _ctx) {
        const first = doc.pages[0];
        const last = doc.pages[doc.pages.length - 1];
        return [
            await this.locateBandRegion("letterhead", first, config.regions.letterheadBand),
            await this.locateBandRegion("footer", last, config.regions.footerBand),
            await this.locateSignature(last),
        ];
    }
    async locateBandRegion(type, page, band) {
        const bandBox = bandRect(band.top, band.bottom);
        const field = await regionGrayField(page.png, bandBox, page.width, page.height, 700);
        const ratio = inkRatio(field, config.contentThreshold);
        if (ratio < config.minContentRatio) {
            return {
                type,
                pageIndex: page.index,
                box: null,
                detected: false,
                confidence: 0,
                note: `No ${type} content found in the ${type === "letterhead" ? "top" : "bottom"} band of the page.`,
            };
        }
        const local = contentBoundingBox(field, config.contentThreshold);
        const box = local
            ? padRect(offsetRectWithinBand(local, bandBox), 0.01)
            : bandBox;
        return {
            type,
            pageIndex: page.index,
            box,
            detected: true,
            confidence: clamp(0.4 + ratio * 6),
        };
    }
    async locateSignature(page) {
        const band = bandRect(config.regions.signatureBand.top, config.regions.signatureBand.bottom);
        const field = await regionGrayField(page.png, band, page.width, page.height, 600);
        const detection = detectSignature(field, {
            inkThreshold: config.inkThreshold,
            minInkRatio: config.minInkRatio,
        });
        if (!detection.found || !detection.box) {
            return {
                type: "signature",
                pageIndex: page.index,
                box: null,
                detected: false,
                confidence: 0,
                note: "No signature-like ink cluster detected in the lower portion of the last page.",
            };
        }
        const box = padRect(offsetRectWithinBand(detection.box, band), 0.012);
        return {
            type: "signature",
            pageIndex: page.index,
            box,
            detected: true,
            confidence: detection.confidence,
        };
    }
}
function clamp(value) {
    return Math.max(0, Math.min(1, value));
}
//# sourceMappingURL=heuristic.strategy.js.map