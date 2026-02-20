import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import cron from "node-cron";
import fs from "fs/promises";
import path from "path";

import challenge from "./routes/challenge.js";
import render from "./routes/render.js";
import status from "./routes/status.js";
import download from "./routes/download.js";
import { cleanupExpiredChallenges } from "./core/pow/pow.js";
import { prisma } from "./core/db.js";

const app = new Hono();

// CORS: restrict to same origin (no cross-origin access)
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "",
    allowMethods: ["GET", "POST"],
  })
);

// Rate limiting (simple in-memory IP-based)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP

app.use("/api/*", async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
  }

  await next();
});

// API routes
app.route("/api/challenge", challenge);
app.route("/api/render", render);
app.route("/api/status", status);
app.route("/api/download", download);

// Static files (frontend)
app.use("/*", serveStatic({ root: "./server/public" }));

// Cleanup crons
// Clean expired PoW challenges every minute
cron.schedule("* * * * *", () => {
  cleanupExpiredChallenges();
});

// Clean old request count entries every 5 minutes
cron.schedule("*/5 * * * *", () => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (now > entry.resetAt) {
      requestCounts.delete(ip);
    }
  }
});

// Clean old uploads every hour (older than 1 hour)
cron.schedule("0 * * * *", async () => {
  try {
    const uploadsDir = path.resolve("uploads");
    const entries = await fs.readdir(uploadsDir).catch(() => []);
    const cutoff = Date.now() - 60 * 60 * 1000;

    for (const entry of entries) {
      const entryPath = path.join(uploadsDir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory() && stat.mtimeMs < cutoff) {
        await fs.rm(entryPath, { recursive: true });
        console.log(`Cleaned up upload dir: ${entry}`);
      }
    }
  } catch (e) {
    console.error("Upload cleanup error:", e);
  }
});

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(path.resolve("uploads"), { recursive: true });
  await fs.mkdir(path.resolve("output"), { recursive: true });
}

// Start server
const PORT = parseInt(process.env.PORT ?? "3000", 10);

ensureDirectories().then(() => {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
