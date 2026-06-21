import { createCanvas, loadImage } from "@napi-rs/canvas";
import JSZip from "jszip";
import mammoth from "mammoth";
import { parse, HTMLElement } from "node-html-parser";
import { errors } from "../../utils/errors.js";
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const MARGIN = 70;
const BODY_SIZE = 15;
const HEADING_SIZES = { h1: 30, h2: 24, h3: 20, h4: 17, h5: 15, h6: 14 };
export class DocxRasterizer {
    async rasterize(buffer, options) {
        let html;
        try {
            const result = await mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.imgElement(inlineImage) });
            html = result.value;
        }
        catch (error) {
            throw errors.corruptDocument(`The DOCX file could not be parsed. It may be corrupt. (${describe(error)})`);
        }
        const blocks = await extractBlocks(html);
        if (blocks.length === 0) {
            throw errors.corruptDocument("The DOCX file did not contain any renderable content.");
        }
        const footerText = await extractFooterText(buffer);
        try {
            const pages = await paintPages(blocks, options.scale, options.maxPages ?? 30, footerText);
            return { pages, source: "docx" };
        }
        catch (error) {
            throw errors.renderFailed(`Failed to render the DOCX content. (${describe(error)})`);
        }
    }
}
async function inlineImage(image) {
    const base64 = await image.read("base64");
    return { src: `data:${image.contentType};base64,${base64}` };
}
async function extractBlocks(html) {
    const root = parse(html);
    const blocks = [];
    const walk = async (node) => {
        for (const child of node.childNodes) {
            if (!(child instanceof HTMLElement))
                continue;
            const tag = child.rawTagName?.toLowerCase();
            if (tag === "img") {
                const img = await decodeImage(child);
                if (img)
                    blocks.push({ kind: "image", data: img });
                continue;
            }
            if (tag && HEADING_SIZES[tag]) {
                await pushImagesWithin(child, blocks);
                const text = collapse(child.text);
                if (text) {
                    blocks.push({ kind: "space", height: 10 });
                    blocks.push({ kind: "text", text, size: HEADING_SIZES[tag], bold: true, center: false });
                }
                continue;
            }
            if (tag === "p") {
                await pushImagesWithin(child, blocks);
                const text = collapse(child.text);
                if (text) {
                    blocks.push({
                        kind: "text",
                        text,
                        size: BODY_SIZE,
                        bold: isWhollyBold(child),
                        center: false,
                    });
                }
                blocks.push({ kind: "space", height: 6 });
                continue;
            }
            if (tag === "li") {
                await pushImagesWithin(child, blocks);
                const text = collapse(child.text);
                if (text) {
                    blocks.push({ kind: "text", text: `•  ${text}`, size: BODY_SIZE, bold: false, center: false });
                }
                continue;
            }
            await walk(child);
        }
    };
    await walk(root);
    return blocks;
}
async function pushImagesWithin(element, blocks) {
    for (const img of element.querySelectorAll("img")) {
        const data = await decodeImage(img);
        if (data)
            blocks.push({ kind: "image", data });
    }
}
async function decodeImage(img) {
    const src = img.getAttribute("src") ?? "";
    const match = src.match(/^data:[^;]+;base64,(.+)$/);
    if (!match)
        return null;
    try {
        return Buffer.from(match[1], "base64");
    }
    catch {
        return null;
    }
}
function isWhollyBold(element) {
    const strong = element.querySelector("strong");
    return Boolean(strong) && collapse(strong?.text ?? "") === collapse(element.text);
}
function collapse(text) {
    return text.replace(/\s+/g, " ").trim();
}
async function extractFooterText(buffer) {
    try {
        const zip = await JSZip.loadAsync(buffer);
        const footerFiles = Object.keys(zip.files).filter((name) => /word\/footer\d*\.xml$/i.test(name));
        const parts = [];
        for (const name of footerFiles) {
            const xml = await zip.files[name].async("string");
            const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
            const text = matches.map((m) => m.replace(/<[^>]+>/g, "")).join("");
            if (text.trim())
                parts.push(collapse(text));
        }
        return parts.join("   ").trim();
    }
    catch {
        return "";
    }
}
async function paintPages(blocks, scale, maxPages, footerText) {
    const width = Math.round(PAGE_WIDTH * scale);
    const height = Math.round(PAGE_HEIGHT * scale);
    const margin = Math.round(MARGIN * scale);
    const contentWidth = width - margin * 2;
    const pages = [];
    let canvas = createCanvas(width, height);
    let ctx = startPage(canvas, width, height);
    let cursorY = margin;
    const newPage = () => {
        pages.push(finishPage(canvas, pages.length, width, height));
        canvas = createCanvas(width, height);
        ctx = startPage(canvas, width, height);
        cursorY = margin;
    };
    for (const block of blocks) {
        if (pages.length >= maxPages)
            break;
        if (block.kind === "space") {
            cursorY += block.height * scale;
            continue;
        }
        if (block.kind === "image") {
            const drawn = await drawImage(ctx, block.data, margin, cursorY, contentWidth, scale);
            if (drawn.overflow && cursorY > margin) {
                newPage();
                const retry = await drawImage(ctx, block.data, margin, cursorY, contentWidth, scale);
                cursorY += retry.height + 10 * scale;
            }
            else {
                cursorY += drawn.height + 10 * scale;
            }
            if (cursorY > height - margin)
                newPage();
            continue;
        }
        const fontSize = block.size * scale;
        const lineHeight = fontSize * 1.45;
        ctx.font = `${block.bold ? "bold " : ""}${fontSize}px sans-serif`;
        ctx.fillStyle = "#111111";
        const lines = wrapText(ctx, block.text, contentWidth);
        for (const line of lines) {
            if (cursorY + lineHeight > height - margin) {
                newPage();
                ctx.font = `${block.bold ? "bold " : ""}${fontSize}px sans-serif`;
                ctx.fillStyle = "#111111";
            }
            const x = block.center ? (width - ctx.measureText(line).width) / 2 : margin;
            ctx.fillText(line, x, cursorY + fontSize);
            cursorY += lineHeight;
        }
    }
    if (footerText) {
        drawFooter(ctx, footerText, width, height, margin, scale);
    }
    pages.push(finishPage(canvas, pages.length, width, height));
    return pages;
}
function drawFooter(ctx, text, width, height, margin, scale) {
    const fontSize = 9 * scale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "#888888";
    const y = height - margin * 0.5;
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = Math.max(1, scale * 0.6);
    ctx.beginPath();
    ctx.moveTo(margin, y - fontSize * 1.6);
    ctx.lineTo(width - margin, y - fontSize * 1.6);
    ctx.stroke();
    const textWidth = ctx.measureText(text).width;
    ctx.fillText(text, Math.max(margin, (width - textWidth) / 2), y);
}
function startPage(canvas, width, height) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "alphabetic";
    return ctx;
}
function finishPage(canvas, index, width, height) {
    return { index, width, height, png: canvas.toBuffer("image/png") };
}
async function drawImage(ctx, data, x, y, maxWidth, scale) {
    const image = await loadImage(data);
    const naturalWidth = image.width;
    const naturalHeight = image.height;
    const drawWidth = Math.min(maxWidth, naturalWidth * scale);
    const drawHeight = (drawWidth / naturalWidth) * naturalHeight;
    const canvasHeight = ctx.canvas.height;
    const overflow = y + drawHeight > canvasHeight - x;
    if (!overflow) {
        ctx.drawImage(image, x, y, drawWidth, drawHeight);
    }
    return { height: drawHeight, overflow };
}
function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && current) {
            lines.push(current);
            current = word;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        lines.push(current);
    return lines.length > 0 ? lines : [""];
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=docx.rasterizer.js.map