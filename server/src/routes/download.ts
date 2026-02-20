import { Hono } from "hono";
import { stream } from "hono/streaming";
import fs from "fs";
import path from "path";
import { prisma } from "../core/db.js";

const download = new Hono();

const OUTPUT_DIR = path.resolve("output");

download.get("/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  // Validate jobId format (UUID only, prevent path traversal)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return c.json({ error: "Invalid job ID" }, 400);
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || job.status !== "done") {
    return c.json({ error: "Video not ready or not found" }, 404);
  }

  const filePath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  if (!fs.existsSync(filePath)) {
    return c.json({ error: "Video file not found" }, 404);
  }

  const stat = fs.statSync(filePath);

  c.header("Content-Type", "video/mp4");
  c.header("Content-Length", stat.size.toString());
  c.header(
    "Content-Disposition",
    `attachment; filename="anone_${jobId.slice(0, 8)}.mp4"`
  );

  return stream(c, async (s) => {
    const readable = fs.createReadStream(filePath);
    for await (const chunk of readable) {
      await s.write(chunk as Uint8Array);
    }
  });
});

export default download;
