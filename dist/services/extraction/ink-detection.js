const DEFAULTS = {
    inkThreshold: 128,
    minInkRatio: 0.0006,
    dilationRadius: 6,
    ruleLineWidthRatio: 0.9,
};
export function binarize(field, threshold) {
    const out = new Uint8Array(field.width * field.height);
    for (let i = 0; i < out.length; i += 1) {
        out[i] = field.data[i] < threshold ? 1 : 0;
    }
    return out;
}
export function dilate(mask, width, height, radius) {
    const horizontal = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
        const row = y * width;
        for (let x = 0; x < width; x += 1) {
            let on = 0;
            for (let dx = -radius; dx <= radius && !on; dx += 1) {
                const nx = x + dx;
                if (nx >= 0 && nx < width && mask[row + nx])
                    on = 1;
            }
            horizontal[row + x] = on;
        }
    }
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let on = 0;
            for (let dy = -radius; dy <= radius && !on; dy += 1) {
                const ny = y + dy;
                if (ny >= 0 && ny < height && horizontal[ny * width + x])
                    on = 1;
            }
            out[y * width + x] = on;
        }
    }
    return out;
}
export function connectedComponents(mask, inkMask, width, height) {
    const labels = new Int32Array(width * height).fill(0);
    const components = [];
    const stack = [];
    for (let start = 0; start < mask.length; start += 1) {
        if (mask[start] === 0 || labels[start] !== 0)
            continue;
        const label = components.length + 1;
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let pixels = 0;
        stack.push(start);
        labels[start] = label;
        while (stack.length > 0) {
            const idx = stack.pop();
            const x = idx % width;
            const y = (idx - x) / width;
            if (inkMask[idx]) {
                pixels += 1;
                if (x < minX)
                    minX = x;
                if (x > maxX)
                    maxX = x;
                if (y < minY)
                    minY = y;
                if (y > maxY)
                    maxY = y;
            }
            if (x > 0 && mask[idx - 1] && labels[idx - 1] === 0) {
                labels[idx - 1] = label;
                stack.push(idx - 1);
            }
            if (x < width - 1 && mask[idx + 1] && labels[idx + 1] === 0) {
                labels[idx + 1] = label;
                stack.push(idx + 1);
            }
            if (y > 0 && mask[idx - width] && labels[idx - width] === 0) {
                labels[idx - width] = label;
                stack.push(idx - width);
            }
            if (y < height - 1 && mask[idx + width] && labels[idx + width] === 0) {
                labels[idx + width] = label;
                stack.push(idx + width);
            }
        }
        components.push({ minX, minY, maxX, maxY, pixels });
    }
    return components;
}
export function scoreComponent(component, width, height, params) {
    const boxWidth = component.maxX - component.minX + 1;
    const boxHeight = component.maxY - component.minY + 1;
    const widthRatio = boxWidth / width;
    const fill = component.pixels / (boxWidth * boxHeight);
    const aspect = boxWidth / Math.max(1, boxHeight);
    const verticalCenter = (component.minY + component.maxY) / 2 / height;
    if (component.pixels < 12)
        return 0;
    if (widthRatio > params.ruleLineWidthRatio && boxHeight < height * 0.04)
        return 0;
    let score = component.pixels;
    score *= 0.6 + verticalCenter * 0.8;
    if (aspect >= 1.4 && aspect <= 12)
        score *= 1.4;
    if (fill > 0.02 && fill < 0.45)
        score *= 1.3;
    if (widthRatio > 0.97)
        score *= 0.4;
    return score;
}
export function contentBoundingBox(field, threshold) {
    const { width, height } = field;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
        const row = y * width;
        for (let x = 0; x < width; x += 1) {
            if (field.data[row + x] < threshold) {
                if (x < minX)
                    minX = x;
                if (x > maxX)
                    maxX = x;
                if (y < minY)
                    minY = y;
                if (y > maxY)
                    maxY = y;
            }
        }
    }
    if (maxX < 0)
        return null;
    return {
        x: minX / width,
        y: minY / height,
        width: (maxX - minX + 1) / width,
        height: (maxY - minY + 1) / height,
    };
}
export function detectSignature(field, params = {}) {
    const settings = { ...DEFAULTS, ...params };
    const { width, height } = field;
    const inkMask = binarize(field, settings.inkThreshold);
    let inkCount = 0;
    for (let i = 0; i < inkMask.length; i += 1)
        inkCount += inkMask[i];
    const inkRatio = inkMask.length === 0 ? 0 : inkCount / inkMask.length;
    if (inkRatio < settings.minInkRatio) {
        return { found: false, box: null, inkRatio, confidence: 0 };
    }
    const dilated = dilate(inkMask, width, height, settings.dilationRadius);
    const components = connectedComponents(dilated, inkMask, width, height);
    let best = null;
    let bestScore = 0;
    for (const component of components) {
        const score = scoreComponent(component, width, height, settings);
        if (score > bestScore) {
            bestScore = score;
            best = component;
        }
    }
    if (!best || bestScore <= 0) {
        return { found: false, box: null, inkRatio, confidence: 0 };
    }
    const pad = Math.round(settings.dilationRadius * 0.5);
    const minX = Math.max(0, best.minX - pad);
    const minY = Math.max(0, best.minY - pad);
    const maxX = Math.min(width - 1, best.maxX + pad);
    const maxY = Math.min(height - 1, best.maxY + pad);
    const box = {
        x: minX / width,
        y: minY / height,
        width: (maxX - minX + 1) / width,
        height: (maxY - minY + 1) / height,
    };
    const confidence = clamp01(bestScore / (width * height * 0.02));
    return { found: true, box, inkRatio, confidence: Math.max(0.3, confidence) };
}
function clamp01(value) {
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return value;
}
//# sourceMappingURL=ink-detection.js.map