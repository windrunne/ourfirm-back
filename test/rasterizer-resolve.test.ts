import { describe, expect, it } from "vitest";
import { resolveSource } from "../src/services/rasterizer/index.js";
import { isAppError } from "../src/utils/errors.js";

describe("resolveSource", () => {
  it("resolves PDF by mime type", () => {
    expect(resolveSource("file.pdf", "application/pdf").kind).toBe("pdf");
  });

  it("resolves DOCX by extension when mime is generic", () => {
    expect(resolveSource("file.docx", "application/octet-stream").kind).toBe("docx");
  });

  it("rejects legacy .doc with a helpful message", () => {
    try {
      resolveSource("file.doc", "application/msword");
      throw new Error("expected to throw");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe("UNSUPPORTED_FILE");
        expect(error.message).toMatch(/\.docx/);
      }
    }
  });

  it("rejects unsupported types", () => {
    expect(() => resolveSource("file.txt", "text/plain")).toThrow();
  });
});
