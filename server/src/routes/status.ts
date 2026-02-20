import { Hono } from "hono";
import { prisma } from "../core/db.js";

const status = new Hono();

status.get("/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  });
});

export default status;
