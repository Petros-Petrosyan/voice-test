/**
 * Downsamples a Float32Array from inputSampleRate to targetSampleRate.
 * Simple linear interpolation — good enough for speech at 16kHz.
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
    const a = buffer[idx] ?? 0;
    const b = buffer[idx + 1] ?? a;
    output[i] = a + frac * (b - a);
  }
  return output;
}

/**
 * Converts a Float32Array (–1.0 … 1.0) to a raw PCM16 Little-Endian ArrayBuffer.
 */
export function floatToPcm16(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, clamped * 0x7fff, true); // true = little-endian
  }
  return buffer;
}

/**
 * Decodes a raw PCM16 LE ArrayBuffer at 16kHz into a Web Audio AudioBuffer.
 */
export function pcm16ToAudioBuffer(arrayBuffer, audioContext, sampleRate = 16000) {
  const dataView = new DataView(arrayBuffer);
  const numSamples = arrayBuffer.byteLength / 2;
  const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < numSamples; i++) {
    channelData[i] = dataView.getInt16(i * 2, true) / 0x7fff; // little-endian
  }
  return audioBuffer;
}
