import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { getPending, getGenerated, postGenerate, deleteBatch } from "./routes/sit";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // SIT module routes (English backend per spec)
  app.get("/api/sit/pending", getPending);
  app.get("/api/sit/generated", getGenerated);
  app.post("/api/requirements/generate", postGenerate);
  app.delete("/api/sit/batches/:batchId", deleteBatch);

  return app;
}
