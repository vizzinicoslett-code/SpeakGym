export type TrainingType = "structured" | "triple" | "voice" | "free";
export type Difficulty = "easy" | "normal" | "hard" | "chaos";
export interface AudioTake {
  id: string;
  label: string;
  blob: Blob;
  duration: number;
  mimeType: string;
}
export interface InterruptWord {
  word: string;
  at: number;
  used: boolean;
}
export interface TrainingSession {
  id: string;
  type: TrainingType;
  startedAt: number;
  duration: number;
  prompt: string;
  difficulty?: Difficulty;
  interruptWords: InterruptWord[];
  selfReview: Record<string, boolean | number | string>;
  audio: AudioTake[];
  completed: boolean;
  dailyId?: string;
}
export interface AppSettings {
  defaultDuration: number;
  freeDuration: number;
  autoRecord: boolean;
  cueSound: boolean;
  tripleDifficulty: Difficulty;
  autoDaily: boolean;
}
export interface TrainingConfig {
  type: TrainingType;
  prompt: string;
  duration: number;
  prepSeconds: number | null;
  recordAudio: boolean;
  difficulty: Difficulty;
  dailyId?: string;
}
