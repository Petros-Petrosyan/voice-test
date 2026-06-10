// ─────────────────────────────────────────────────────────────
// Audio settings
// ─────────────────────────────────────────────────────────────

// The server expects audio at 16 kHz, so we downsample before sending
export const TARGET_SAMPLE_RATE = 16000;

// Number of audio samples processed per callback.
// 4096 is a good tradeoff: low enough latency, not too much CPU overhead.
export const BUFFER_SIZE = 4096;

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

// The backend endpoint that receives raw PCM16 audio and returns a response
export const SERVER_URL = "http://localhost:3001/buffer";

// ─────────────────────────────────────────────────────────────
// App states
// ─────────────────────────────────────────────────────────────

// All possible values for the `status` state in App.
// These strings are also used as CSS class modifiers (e.g. mic-button--idle).
export const STATUS = {
  IDLE: "idle",
  RECORDING: "recording",
  PROCESSING: "processing",
  PLAYING: "playing",
  PLAYING_MY_VOICE: "playingMyVoice",
  PLAYING_SERVER_VOICE: "playingServerVoice",
  ERROR: "error",
};

// The text shown under the mic button for each status
export const STATUS_LABELS = {
  [STATUS.IDLE]: "Hold to Speak",
  [STATUS.RECORDING]: "Recording…",
  [STATUS.PROCESSING]: "Processing…",
  [STATUS.PLAYING]: "Playing Response…",
  [STATUS.PLAYING_MY_VOICE]: "Playing Your Voice…",
  [STATUS.PLAYING_SERVER_VOICE]: "Playing Server Voice…",
  [STATUS.ERROR]: "Hold to Speak",
};
