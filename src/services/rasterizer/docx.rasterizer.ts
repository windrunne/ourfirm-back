import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import JSZip from "jszip";
import mammoth from "mammoth";
import { parse, HTMLElement } from "node-html-parser";
import { DOCX_LAYOUT, RASTER_MAX_PAGES } from "../../constants/rasterization.js";
import type { EmbeddedImage, RasterDocument, RasterPage } from "../../types.js";
import { errors } from "../../utils/errors.js";
import type { DocumentRasterizer, RasterizeOptions } from "./types.js";

type Block =
  | { kind: "text"; text: string; size: number; bold: boolean; center: boolean }
  | { kind: "image"; data: Buffer }
  | { kind: "space"; height: number };

const {
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  margin: MARGIN,
  bodyFontSize: BODY_SIZE,
  headingSizes: HEADING_SIZES,
} = DOCX_LAYOUT;

export class DocxRasterizer implements DocumentRasterizer {
  async rasterize(buffer: Buffer, options: RasterizeOptions): Promise<RasterDocument> {
    let html: string;
    try {
      const result = await mammoth.convertToHtml(
        { buffer },
        { convertImage: mammoth.images.imgElement(inlineImage) },
      );
      html = result.value;
    } catch (error) {
      throw errors.corruptDocument(
        `The DOCX file could not be parsed. It may be corrupt. (${describe(error)})`,
      );
    }

    const blocks = await extractBlocks(html);
    if (blocks.length === 0) {
      throw errors.corruptDocument("The DOCX file did not contain any renderable content.");
    }

    const footerText = await extractFooterText(buffer);

    try {
      const { pages, embeddedImages } = await paintPages(
        blocks,
        options.scale,
        options.maxPages ?? RASTER_MAX_PAGES,
        footerText,
      );
      return { pages, source: "docx", embeddedImages };
    } catch (error) {
      throw errors.renderFailed(`Failed to render the DOCX content. (${describe(error)})`);
    }
  }
}

async function inlineImage(image: { read: (encoding: string) => Promise<string>; contentType: string }) {
  const base64 = await image.read("base64");
  return { src: `data:${image.contentType};base64,${base64}` };
}

async function extractBlocks(html: string): Promise<Block[]> {
  const root = parse(html);
  const blocks: Block[] = [];

  const walk = async (node: HTMLElement): Promise<void> => {
    for (const child of node.childNodes) {
      if (!(child instanceof HTMLElement)) continue;
      const tag = child.rawTagName?.toLowerCase();
      if (tag === "img") {
        const img = await decodeImage(child);
        if (img) blocks.push({ kind: "image", data: img });
        continue;
      }
      if (tag && HEADING_SIZES[tag]) {
        await pushImagesWithin(child, blocks);
        const text = collapse(child.text);
        if (text) {
          blocks.push({ kind: "space", height: DOCX_LAYOUT.headingSpaceBefore });
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
        blocks.push({ kind: "space", height: DOCX_LAYOUT.paragraphSpaceAfter });
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

async function pushImagesWithin(element: HTMLElement, blocks: Block[]): Promise<void> {
  for (const img of element.querySelectorAll("img")) {
    const data = await decodeImage(img);
    if (data) blocks.push({ kind: "image", data });
  }
}

async function decodeImage(img: HTMLElement): Promise<Buffer | null> {
  const src = img.getAttribute("src") ?? "";
  const match = src.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function isWhollyBold(element: HTMLElement): boolean {
  const strong = element.querySelector("strong");
  return Boolean(strong) && collapse(strong?.text ?? "") === collapse(element.text);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function extractFooterText(buffer: Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const footerFiles = Object.keys(zip.files).filter((name) => /word\/footer\d*\.xml$/i.test(name));
    const parts: string[] = [];
    for (const name of footerFiles) {
      const xml = await zip.files[name].async("string");
      const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
      const text = matches.map((m) => m.replace(/<[^>]+>/g, "")).join("");
      if (text.trim()) parts.push(collapse(text));
    }
    return parts.join("   ").trim();
  } catch {
    return "";
  }
}

async function paintPages(
  blocks: Block[],
  scale: number,
  maxPages: number,
  footerText: string,
): Promise<{ pages: RasterPage[]; embeddedImages: EmbeddedImage[] }> {
  const width = Math.round(PAGE_WIDTH * scale);
  const height = Math.round(PAGE_HEIGHT * scale);
  const margin = Math.round(MARGIN * scale);
  const contentWidth = width - margin * 2;
  const pages: RasterPage[] = [];
  const embeddedImages: EmbeddedImage[] = [];

  let canvas = createCanvas(width, height);
  let ctx = startPage(canvas, width, height);
  let cursorY = margin;

  const newPage = () => {
    pages.push(finishPage(canvas, pages.length, width, height));
    canvas = createCanvas(width, height);
    ctx = startPage(canvas, width, height);
    cursorY = margin;
  };

  const recordImage = (drawWidth: number, drawHeight: number, top: number) => {
    embeddedImages.push({
      pageIndex: pages.length,
      box: {
        x: margin / width,
        y: top / height,
        width: drawWidth / width,
        height: drawHeight / height,
      },
    });
  };

  for (const block of blocks) {
    if (pages.length >= maxPages) break;

    if (block.kind === "space") {
      cursorY += block.height * scale;
      continue;
    }

    if (block.kind === "image") {
      const drawn = await drawImage(ctx, block.data, margin, cursorY, contentWidth, scale);
      if (drawn.overflow && cursorY > margin) {
        newPage();
        const retry = await drawImage(ctx, block.data, margin, cursorY, contentWidth, scale);
        recordImage(retry.width, retry.height, cursorY);
        cursorY += retry.height + DOCX_LAYOUT.imageGap * scale;
      } else {
        recordImage(drawn.width, drawn.height, cursorY);
        cursorY += drawn.height + DOCX_LAYOUT.imageGap * scale;
      }
      if (cursorY > height - margin) newPage();
      continue;
    }

    const fontSize = block.size * scale;
    const lineHeight = fontSize * DOCX_LAYOUT.lineHeightRatio;
    ctx.font = `${block.bold ? "bold " : ""}${fontSize}px sans-serif`;
    ctx.fillStyle = DOCX_LAYOUT.textColor;
    const lines = wrapText(ctx, block.text, contentWidth);
    for (const line of lines) {
      if (cursorY + lineHeight > height - margin) {
        newPage();
        ctx.font = `${block.bold ? "bold " : ""}${fontSize}px sans-serif`;
        ctx.fillStyle = DOCX_LAYOUT.textColor;
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
  return { pages, embeddedImages };
}

function drawFooter(
  ctx: SKRSContext2D,
  text: string,
  width: number,
  height: number,
  margin: number,
  scale: number,
): void {
  const fontSize = DOCX_LAYOUT.footerFontSize * scale;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = DOCX_LAYOUT.footerColor;
  const y = height - margin * 0.5;
  ctx.strokeStyle = DOCX_LAYOUT.footerRuleColor;
  ctx.lineWidth = Math.max(1, scale * 0.6);
  ctx.beginPath();
  ctx.moveTo(margin, y - fontSize * 1.6);
  ctx.lineTo(width - margin, y - fontSize * 1.6);
  ctx.stroke();
  const textWidth = ctx.measureText(text).width;
  ctx.fillText(text, Math.max(margin, (width - textWidth) / 2), y);
}

function startPage(canvas: Canvas, width: number, height: number): SKRSContext2D {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = DOCX_LAYOUT.pageBackground;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "alphabetic";
  return ctx;
}

function finishPage(
  canvas: Canvas,
  index: number,
  width: number,
  height: number,
): RasterPage {
  return { index, width, height, png: canvas.toBuffer("image/png") };
}

async function drawImage(
  ctx: SKRSContext2D,
  data: Buffer,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
): Promise<{ width: number; height: number; overflow: boolean }> {
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
  return { width: drawWidth, height: drawHeight, overflow };
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
