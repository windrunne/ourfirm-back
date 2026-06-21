export function clampUnit(value) {
    if (Number.isNaN(value))
        return 0;
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return value;
}
export function normalizeRect(rect) {
    const x = clampUnit(rect.x);
    const y = clampUnit(rect.y);
    return {
        x,
        y,
        width: clampUnit(Math.min(rect.width, 1 - x)),
        height: clampUnit(Math.min(rect.height, 1 - y)),
    };
}
export function rectIsEmpty(rect) {
    return rect.width <= 0 || rect.height <= 0;
}
export function toPixelRect(rect, pageWidth, pageHeight) {
    const safe = normalizeRect(rect);
    const left = Math.round(safe.x * pageWidth);
    const top = Math.round(safe.y * pageHeight);
    const width = Math.max(1, Math.min(Math.round(safe.width * pageWidth), pageWidth - left));
    const height = Math.max(1, Math.min(Math.round(safe.height * pageHeight), pageHeight - top));
    return { left, top, width, height };
}
export function bandRect(top, bottom) {
    const safeTop = clampUnit(top);
    const safeBottom = clampUnit(bottom);
    return {
        x: 0,
        y: safeTop,
        width: 1,
        height: Math.max(0, safeBottom - safeTop),
    };
}
export function padRect(rect, pad) {
    return normalizeRect({
        x: rect.x - pad,
        y: rect.y - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
    });
}
export function offsetRectWithinBand(local, band) {
    return normalizeRect({
        x: band.x + local.x * band.width,
        y: band.y + local.y * band.height,
        width: local.width * band.width,
        height: local.height * band.height,
    });
}
//# sourceMappingURL=geometry.js.map