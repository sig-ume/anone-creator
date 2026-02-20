import { prisma } from "../db.js";
import { compose } from "../ffmpeg/composer.js";
import type { ComposeRequest } from "../types.js";

const MAX_CONCURRENT = 1;
const JOB_TIMEOUT_MS = 120_000; // 120 seconds

let runningCount = 0;
const queue: ComposeRequest[] = [];

/** Add a job to the processing queue */
export function enqueueJob(request: ComposeRequest): void {
  queue.push(request);
  processNext();
}

/** Check if the queue can accept more jobs */
export function canAcceptJob(): boolean {
  return true; // Always accept into queue; concurrency is managed at processing level
}

/** Get current queue stats */
export function getQueueStats() {
  return {
    running: runningCount,
    queued: queue.length,
    maxConcurrent: MAX_CONCURRENT,
  };
}

async function processNext(): Promise<void> {
  if (runningCount >= MAX_CONCURRENT || queue.length === 0) {
    return;
  }

  const request = queue.shift()!;
  runningCount++;

  try {
    await prisma.job.update({
      where: { id: request.jobId },
      data: { status: "running" },
    });

    const startTime = Date.now();

    // Run FFmpeg with timeout
    await Promise.race([
      compose(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Job timeout")), JOB_TIMEOUT_MS)
      ),
    ]);

    const processingTimeMs = Date.now() - startTime;

    await prisma.job.update({
      where: { id: request.jobId },
      data: {
        status: "done",
        finishedAt: new Date(),
        processingTimeMs,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Job ${request.jobId} failed:`, message);

    await prisma.job.update({
      where: { id: request.jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
  } finally {
    runningCount--;
    processNext();
  }
}
