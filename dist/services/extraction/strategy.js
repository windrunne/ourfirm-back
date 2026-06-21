export const REGION_TYPES = ["letterhead", "footer", "signature"];
export function missingRegion(type, pageIndex, note) {
    return { type, pageIndex, box: null, detected: false, confidence: 0, note };
}
//# sourceMappingURL=strategy.js.map