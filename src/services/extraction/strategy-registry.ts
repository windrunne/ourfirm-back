import type { StrategyName } from "../../types.js";
import { HeuristicLocator } from "./heuristic.strategy.js";
import { LlmLocator } from "./llm.strategy.js";
import { VisionLocator } from "./vision.strategy.js";
import type { RegionLocator } from "./strategy.js";

const registry: Record<StrategyName, RegionLocator> = {
  heuristic: new HeuristicLocator(),
  vision: new VisionLocator(),
  llm: new LlmLocator(),
};

export function getLocator(name: StrategyName): RegionLocator {
  return registry[name];
}

export interface StrategyDescriptor {
  name: StrategyName;
  label: string;
  description: string;
  available: boolean;
  reason?: string;
}

const META: Record<StrategyName, { label: string; description: string }> = {
  heuristic: {
    label: "Heuristic (built-in)",
    description: "Pixel-based band cropping with custom ink-cluster signature detection. Always available, fully offline.",
  },
  vision: {
    label: "Hosted Vision OCR",
    description: "Uses the OCR.space hosted API to read word positions, then derives regions from text layout.",
  },
  llm: {
    label: "LLM Vision (OpenAI)",
    description: "Asks an OpenAI vision model for region bounding boxes. Requires OPENAI_API_KEY.",
  },
};

export function listStrategies(): StrategyDescriptor[] {
  return (Object.keys(registry) as StrategyName[]).map((name) => {
    const availability = registry[name].isAvailable();
    return {
      name,
      label: META[name].label,
      description: META[name].description,
      available: availability.ok,
      reason: availability.ok ? undefined : availability.reason,
    };
  });
}
