import { HeuristicLocator } from "./heuristic.strategy.js";
import { LlmLocator } from "./llm.strategy.js";
import { VisionLocator } from "./vision.strategy.js";
const registry = {
    heuristic: new HeuristicLocator(),
    vision: new VisionLocator(),
    llm: new LlmLocator(),
};
export function getLocator(name) {
    return registry[name];
}
const META = {
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
export function listStrategies() {
    return Object.keys(registry).map((name) => {
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
//# sourceMappingURL=strategy-registry.js.map