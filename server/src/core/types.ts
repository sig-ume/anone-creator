export interface MakerConfig {
  name: string;
  bpm: number;
  beatDuration: number;
  videoDuration: number;
  maxImages: number;
  timestamps: number[];
  baseVideoPath: string;
}

export type JobStatus = "waiting" | "running" | "done" | "failed";

export interface ComposeRequest {
  jobId: string;
  imagePaths: string[];
  config: MakerConfig;
  outputPath: string;
}

export interface PowChallenge {
  challenge: string;
  difficulty: number;
  expiresAt: number;
}
