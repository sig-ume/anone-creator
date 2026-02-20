import crypto from "crypto";
import type { PowChallenge } from "../types.js";

const DIFFICULTY = 4;
const CHALLENGE_TTL_MS = 60_000; // 60 seconds

/** In-memory store for issued challenges (challenge string -> expiry timestamp) */
const activeChallenges = new Map<string, number>();

/** Generate a new PoW challenge */
export function createChallenge(): PowChallenge {
  const challenge = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  activeChallenges.set(challenge, expiresAt);
  return { challenge, difficulty: DIFFICULTY, expiresAt };
}

/** Verify a PoW solution */
export function verifyPow(challenge: string, nonce: string): boolean {
  const expiry = activeChallenges.get(challenge);

  // Challenge not found or already used
  if (expiry === undefined) {
    return false;
  }

  // Challenge expired
  if (Date.now() > expiry) {
    activeChallenges.delete(challenge);
    return false;
  }

  // Consume challenge (single-use)
  activeChallenges.delete(challenge);

  // Verify hash meets difficulty
  const hash = crypto
    .createHash("sha256")
    .update(challenge + nonce)
    .digest("hex");

  const prefix = "0".repeat(DIFFICULTY);
  return hash.startsWith(prefix);
}

/** Periodically clean up expired challenges */
export function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [challenge, expiry] of activeChallenges) {
    if (now > expiry) {
      activeChallenges.delete(challenge);
    }
  }
}
