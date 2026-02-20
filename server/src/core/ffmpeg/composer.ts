import { spawn } from "child_process";
import type { ComposeRequest } from "../types.js";

/**
 * Build and execute the FFmpeg command for chromakey compositing.
 *
 * Strategy:
 * 1. Input unique images once, reference them multiple times in filters
 * 2. Scale each to cover 1920x1080 (cover mode)
 * 3. Trim each segment to the correct beat duration
 * 4. Concatenate into a background slideshow
 * 5. Chromakey the foreground video and overlay
 */
export async function compose(request: ComposeRequest): Promise<void> {
  const { imagePaths, config, outputPath } = request;

  // Build the 25-slot sequence with looping
  const slotCount = config.maxImages;
  const slots: { imageIndex: number; duration: number }[] = [];

  for (let i = 0; i < slotCount; i++) {
    const imageIndex = i % imagePaths.length;
    const duration =
      i < slotCount - 1
        ? config.timestamps[i + 1] - config.timestamps[i]
        : config.videoDuration - config.timestamps[i];
    slots.push({ imageIndex, duration });
  }

  const args = buildFFmpegArgs(
    config.baseVideoPath,
    imagePaths,
    slots,
    outputPath
  );

  return runFFmpeg(args);
}

interface Slot {
  imageIndex: number;
  duration: number;
}

function buildFFmpegArgs(
  baseVideoPath: string,
  uniqueImages: string[],
  slots: Slot[],
  outputPath: string
): string[] {
  const args: string[] = ["-y"];

  // Input 0: base video
  args.push("-i", baseVideoPath);

  // Inputs 1..N: unique images (each as a single-frame stream)
  for (const img of uniqueImages) {
    args.push("-i", img);
  }

  // Build complex filter graph
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < slots.length; i++) {
    const { imageIndex, duration } = slots[i];
    const inputIdx = imageIndex + 1; // offset by 1 (base video is 0)

    // For each slot: scale the source image to cover 1920x1080 and trim to duration.
    // Use split if the same image is used in multiple slots.
    filterParts.push(
      `[${inputIdx}:v]` +
        `scale=1920:1080:force_original_aspect_ratio=increase,` +
        `crop=1920:1080,` +
        `setsar=1,` +
        `loop=loop=-1:size=1:start=0,` +
        `trim=duration=${duration.toFixed(6)},` +
        `setpts=PTS-STARTPTS,` +
        `fps=30` +
        `[bg${i}]`
    );
    concatInputs.push(`[bg${i}]`);
  }

  // Concatenate all background segments into one stream
  filterParts.push(
    `${concatInputs.join("")}concat=n=${slots.length}:v=1:a=0[bgall]`
  );

  // Apply chromakey to foreground (remove green)
  filterParts.push(`[0:v]chromakey=0x00FF00:0.3:0.1[fg]`);

  // Overlay foreground onto background slideshow
  filterParts.push(`[bgall][fg]overlay=0:0:shortest=1[out]`);

  args.push("-filter_complex", filterParts.join(";\n"));
  args.push("-map", "[out]");
  args.push("-map", "0:a?"); // Copy audio from base video if present
  args.push("-c:v", "libx264");
  args.push("-preset", "fast");
  args.push("-crf", "23");
  args.push("-c:a", "aac");
  args.push("-movflags", "+faststart");
  args.push(outputPath);

  return args;
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`)
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}
