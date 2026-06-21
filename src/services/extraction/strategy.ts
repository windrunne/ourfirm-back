import type { LocatedRegion, RasterDocument, RegionType, StrategyName } from "../../types.js";

export const REGION_TYPES: RegionType[] = ["letterhead", "footer", "signature"];

export interface LocatorContext {
  useOcr: boolean;
}

export interface RegionLocator {
  readonly name: StrategyName;
  isAvailable(): { ok: boolean; reason?: string };
  locate(doc: RasterDocument, ctx: LocatorContext): Promise<LocatedRegion[]>;
}

export function missingRegion(type: RegionType, pageIndex: number, note: string): LocatedRegion {
  return { type, pageIndex, box: null, detected: false, confidence: 0, note };
}
