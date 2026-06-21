import { Router } from "express";
import { z } from "zod";
import { extractionService } from "../services/extraction/extractor.js";
import { listStrategies } from "../services/extraction/strategy-registry.js";
import { listSamples, readSample } from "../services/samples.service.js";
import { upload } from "../middleware/upload.js";
import { errors } from "../utils/errors.js";
const optionsSchema = z.object({
    strategy: z.enum(["heuristic", "vision", "llm"]).default("heuristic"),
    format: z.enum(["png", "jpeg"]).default("png"),
    useOcr: z
        .union([z.boolean(), z.string()])
        .transform((value) => value === true || value === "true")
        .default(false),
});
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const router = Router();
router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
router.get("/strategies", (_req, res) => {
    res.json({ strategies: listStrategies() });
});
router.get("/samples", async (_req, res, next) => {
    try {
        res.json({ samples: await listSamples() });
    }
    catch (error) {
        next(error);
    }
});
router.get("/samples/:name", async (req, res, next) => {
    try {
        const buffer = await readSample(req.params.name);
        const ext = req.params.name.toLowerCase().split(".").pop();
        res.setHeader("Content-Type", ext === "docx" ? DOCX_MIME : PDF_MIME);
        res.setHeader("Content-Disposition", `inline; filename="${req.params.name}"`);
        res.send(buffer);
    }
    catch {
        next(errors.validation("Sample not found."));
    }
});
router.post("/extract", upload.single("file"), handleExtract);
router.post("/extract/sample", handleSampleExtract);
async function handleExtract(req, res, next) {
    try {
        if (!req.file) {
            throw errors.unsupportedFile("No supported file was uploaded. Upload a PDF or DOCX document.");
        }
        const options = parseOptions(req.body);
        const file = {
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
        };
        res.json(await extractionService.extract(file, options));
    }
    catch (error) {
        next(error);
    }
}
async function handleSampleExtract(req, res, next) {
    try {
        const name = z.string().min(1).parse(req.body?.name);
        const options = parseOptions(req.body);
        const buffer = await readSample(name);
        const ext = name.toLowerCase().split(".").pop();
        const file = {
            buffer,
            originalName: name,
            mimeType: ext === "docx" ? DOCX_MIME : PDF_MIME,
        };
        res.json(await extractionService.extract(file, options));
    }
    catch (error) {
        next(error);
    }
}
function parseOptions(body) {
    const result = optionsSchema.safeParse(body ?? {});
    if (!result.success) {
        throw errors.validation("Invalid extraction options.", result.error.flatten());
    }
    return result.data;
}
//# sourceMappingURL=extract.routes.js.map