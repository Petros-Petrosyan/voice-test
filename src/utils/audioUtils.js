// ─────────────────────────────────────────────────────────────
// Audio processing utilities
// ─────────────────────────────────────────────────────────────

/**
 * Joins all the small Float32 chunks collected during recording
 * into one flat array that's easier to work with.
 */
export function mergeChunks(chunks) {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Downsamples a Float32Array from inputSampleRate to targetSampleRate.
 * Uses linear interpolation — accurate enough for speech at 16 kHz.
 */
export function downsample(buffer, inputSampleRate, targetSampleRate) {
  if (inputSampleRate === targetSampleRate) return buffer;

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.floor(buffer.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    // Interpolate between the two nearest source samples
    const a = buffer[idx] ?? 0;
    const b = buffer[idx + 1] ?? a;
    output[i] = a + frac * (b - a);
  }

  return output;
}

/**
 * Converts a Float32Array (range –1.0 to 1.0) into a raw PCM16
 * Little-Endian ArrayBuffer ready to send over the network.
 */
export function floatToPcm16(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2); // 2 bytes per sample
  const view = new DataView(buffer);

  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, clamped * 0x7fff, true); // true = little-endian
  }

  return buffer;
}

/**
 * Decodes a raw PCM16 LE ArrayBuffer into a Web Audio AudioBuffer
 * so it can be played through the AudioContext.
 */
export function pcm16ToAudioBuffer(
  arrayBuffer,
  audioContext,
  sampleRate = 16000,
) {
  const dataView = new DataView(arrayBuffer);
  const numSamples = arrayBuffer.byteLength / 2; // 2 bytes per sample
  const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    channelData[i] = dataView.getInt16(i * 2, true) / 0x7fff; // little-endian, normalize to –1…1
  }

  return audioBuffer;
}
