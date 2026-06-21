import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export interface SampleInfo {
  name: string;
  sizeBytes: number;
  kind: "pdf" | "docx";
  description: string;
}

const DESCRIPTIONS: Record<string, string> = {
  "acme-offer-letter.pdf": "Single-page PDF letter with letterhead, footer and a vector signature.",
  "blue-harbor-agreement.docx": "Word document with letterhead, embedded signature image and a section footer.",
  "northwind-scanned-notice.pdf": "Image-only (scanned) PDF to exercise the OCR fallback path.",
};

export async function listSamples(): Promise<SampleInfo[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(config.samplesDir);
  } catch {
    return [];
  }
  const samples: SampleInfo[] = [];
  for (const name of entries.sort()) {
    const ext = name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") continue;
    const stat = await fs.stat(path.join(config.samplesDir, name));
    samples.push({
      name,
      sizeBytes: stat.size,
      kind: ext,
      description: DESCRIPTIONS[name] ?? "Sample document.",
    });
  }
  return samples;
}

export async function readSample(name: string): Promise<Buffer> {
  const safe = path.basename(name);
  const target = path.join(config.samplesDir, safe);
  if (path.dirname(target) !== path.resolve(config.samplesDir)) {
    throw new Error("Invalid sample path.");
  }
  return fs.readFile(target);
}
