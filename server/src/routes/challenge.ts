import { Hono } from "hono";
import { createChallenge } from "../core/pow/pow.js";

const challenge = new Hono();

challenge.get("/", (c) => {
  const pow = createChallenge();
  return c.json(pow);
});

export default challenge;
