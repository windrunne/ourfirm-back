import { config } from "../../config.js";
import { clampUnit, normalizeRect } from "./geometry.js";
const CLOSING_PATTERN = /\b(sincerely|regards|faithfully|truly|cordially|respectfully|warmly|thanks|thank you)\b/i;
export function unionRect(boxes) {
    if (boxes.length === 0)
        return null;
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const box of boxes) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
    }
    return normalizeRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}
function centerY(box) {
    return box.y + box.height / 2;
}
export function locateLetterhead(first) {
    const pageIndex = first?.index ?? 0;
    if (!first || first.words.length === 0) {
        return missing("letterhead", pageIndex, "No text recognised in the top band of the first page.");
    }
    const band = config.regions.letterheadBand.bottom;
    const inBand = first.words.filter((word) => centerY(word.box) <= band);
    const box = unionRect(inBand.map((word) => word.box));
    if (!box) {
        return missing("letterhead", pageIndex, "No text recognised in the top band of the first page.");
    }
    return {
        type: "letterhead",
        pageIndex,
        box: padded(box),
        detected: true,
        confidence: averageConfidence(inBand),
    };
}
export function locateFooter(last) {
    const pageIndex = last?.index ?? 0;
    if (!last || last.words.length === 0) {
        return missing("footer", pageIndex, "No text recognised in the bottom band of the last page.");
    }
    const band = config.regions.footerBand.top;
    const inBand = last.words.filter((word) => centerY(word.box) >= band);
    const box = unionRect(inBand.map((word) => word.box));
    if (!box) {
        return missing("footer", pageIndex, "No text recognised in the bottom band of the last page.");
    }
    return {
        type: "footer",
        pageIndex,
        box: padded(box),
        detected: true,
        confidence: averageConfidence(inBand),
    };
}
export function locateSignature(last) {
    const pageIndex = last?.index ?? 0;
    if (!last || last.words.length === 0) {
        return missing("signature", pageIndex, "No text available to anchor a signature region.");
    }
    const closing = last.words.find((word) => CLOSING_PATTERN.test(word.text));
    const footerTop = config.regions.footerBand.top;
    if (!closing) {
        return missing("signature", pageIndex, "No closing salutation (e.g. \"Sincerely\") found to anchor the signature region.");
    }
    const top = clampUnit(closing.box.y + closing.box.height + 0.005);
    const bottom = clampUnit(Math.min(footerTop - 0.01, top + 0.14));
    if (bottom <= top) {
        return missing("signature", pageIndex, "Closing salutation is too close to the footer to extract a signature.");
    }
    const left = clampUnit(closing.box.x - 0.01);
    const box = normalizeRect({
        x: left,
        y: top,
        width: Math.min(0.55, 1 - left),
        height: bottom - top,
    });
    return { type: "signature", pageIndex, box, detected: true, confidence: 0.5 };
}
export function locateFromWords(first, last) {
    return [locateLetterhead(first), locateFooter(last), locateSignature(last)];
}
function averageConfidence(words) {
    if (words.length === 0)
        return 0;
    const sum = words.reduce((acc, word) => acc + word.confidence, 0);
    return Math.max(0.3, Math.min(1, sum / words.length));
}
function padded(box) {
    return normalizeRect({
        x: box.x - 0.012,
        y: box.y - 0.012,
        width: box.width + 0.024,
        height: box.height + 0.024,
    });
}
function missing(type, pageIndex, note) {
    return { type, pageIndex, box: null, detected: false, confidence: 0, note };
}
//# sourceMappingURL=layout-locator.js.map