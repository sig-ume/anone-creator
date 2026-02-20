import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** BPM of the base video */
const BPM = 128;

/** Duration of one beat in seconds */
const BEAT_DURATION = 60 / BPM; // 0.46875s

/** Total duration of the base video in seconds */
const VIDEO_DURATION = 15;

/** Maximum number of background images */
const MAX_IMAGES = 25;

/**
 * Generate timestamps for background image switching.
 * - Images 1-24: one beat each
 * - Image 25: last measure (4 beats = 1.875s)
 */
function generateTimestamps(): number[] {
  const timestamps: number[] = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    timestamps.push(i * BEAT_DURATION);
  }
  return timestamps;
}

export const anoneConfig = {
  name: "anone",
  bpm: BPM,
  beatDuration: BEAT_DURATION,
  videoDuration: VIDEO_DURATION,
  maxImages: MAX_IMAGES,
  timestamps: generateTimestamps(),
  baseVideoPath: path.resolve(__dirname, "../../../assets/base-video.mp4"),
};
