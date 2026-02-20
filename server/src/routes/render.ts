import { Hono } from "hono";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { verifyPow } from "../core/pow/pow.js";
import { prisma } from "../core/db.js";
import { enqueueJob } from "../core/queue/worker.js";
import { anoneConfig } from "../makers/anone/config.js";

const render = new Hono();

const UPLOAD_DIR = path.resolve("uploads");
const OUTPUT_DIR = path.resolve("output");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

render.post("/", async (c) => {
  const body = await c.req.parseBody({ all: true });

  // Extract PoW fields
  const challengeStr = body["challenge"];
  const nonce = body["nonce"];

  if (typeof challengeStr !== "string" || typeof nonce !== "string") {
    return c.json({ error: "Missing challenge or nonce" }, 400);
  }

  // Verify PoW
  if (!verifyPow(challengeStr, nonce)) {
    return c.json({ error: "Invalid or expired PoW" }, 403);
  }

  // Extract images
  const rawImages = body["images[]"];
  const images: File[] = [];

  if (rawImages instanceof File) {
    images.push(rawImages);
  } else if (Array.isArray(rawImages)) {
    for (const item of rawImages) {
      if (item instanceof File) {
        images.push(item);
      }
    }
  }

  if (images.length === 0) {
    return c.json({ error: "No images provided" }, 400);
  }

  if (images.length > anoneConfig.maxImages) {
    return c.json(
      { error: `Maximum ${anoneConfig.maxImages} images allowed` },
      400
    );
  }

  // Validate images
  for (const img of images) {
    if (!ALLOWED_MIME_TYPES.includes(img.type)) {
      return c.json(
        { error: `Invalid file type: ${img.type}. Only JPG and PNG allowed.` },
        400
      );
    }
    if (img.size > MAX_FILE_SIZE) {
      return c.json(
        { error: `File too large: ${img.name}. Max 10MB per image.` },
        400
      );
    }
  }

  // Create job
  const jobId = uuidv4();
  const jobUploadDir = path.join(UPLOAD_DIR, jobId);
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  await fs.mkdir(jobUploadDir, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Save images to disk
  const imagePaths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const ext = images[i].type === "image/png" ? ".png" : ".jpg";
    const filePath = path.join(jobUploadDir, `${i}${ext}`);
    const buffer = Buffer.from(await images[i].arrayBuffer());
    await fs.writeFile(filePath, buffer);
    imagePaths.push(filePath);
  }

  // Create job record
  await prisma.job.create({
    data: { id: jobId, status: "waiting" },
  });

  // Enqueue FFmpeg processing
  enqueueJob({
    jobId,
    imagePaths,
    config: anoneConfig,
    outputPath,
  });

  return c.json({ jobId, status: "waiting" }, 202);
});

export default render;
