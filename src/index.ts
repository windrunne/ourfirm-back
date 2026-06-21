import { createApp } from "./app.js";
import { config } from "./config.js";
import { listStrategies } from "./services/extraction/strategy-registry.js";
import { disposeOcr } from "./services/ocr/ocr.service.js";
import { logger } from "./utils/logger.js";

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info("server started", {
    port: config.port,
    openAiKeyPresent: Boolean(config.openAi.apiKey),
    availableStrategies: listStrategies()
      .filter((strategy) => strategy.available)
      .map((strategy) => strategy.name),
  });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("shutting down", { signal });
  server.close();
  await disposeOcr();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
