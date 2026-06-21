import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { router } from "./routes/extract.routes.js";

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", router);

  if (config.clientDist && fs.existsSync(config.clientDist)) {
    const indexHtml = path.join(config.clientDist, "index.html");
    app.use(express.static(config.clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
