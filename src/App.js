import { useCallback, useRef, useState } from "react";

import MicButton from "./components/MicButton";
import PlaybackButton from "./components/PlaybackButton";
import {
  BUFFER_SIZE,
  SERVER_URL,
  STATUS,
  STATUS_LABELS,
  TARGET_SAMPLE_RATE,
} from "./constants";
import "./styles/app.css";
import {
  downsample,
  floatToPcm16,
  mergeChunks,
  pcm16ToAudioBuffer,
} from "./utils/audioUtils";

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────
  // status drives which CSS styles are active and which buttons are enabled
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasRecording, setHasRecording] = useState(false); // show playback buttons after first recording

  // ── Refs ───────────────────────────────────────────────────────────────
  // Refs hold audio objects that don't need to trigger re-renders
  const audioCtxRef = useRef(null); // shared Web Audio context
  const streamRef = useRef(null); // microphone MediaStream
  const processorRef = useRef(null); // ScriptProcessorNode (captures raw audio)
  const sourceRef = useRef(null); // MediaStreamAudioSourceNode
  const chunksRef = useRef([]); // raw Float32 audio chunks collected while recording
  const isRecordingRef = useRef(false); // flag used inside the audio processor callback
  const lastRecordingRef = useRef(null); // { float32, sampleRate, downsampled } — saved for playback
  const myVoiceSourceRef = useRef(null); // AudioBufferSourceNode for "play my voice"
  const serverVoiceSourceRef = useRef(null); // AudioBufferSourceNode for "play server voice"

  // ── AudioContext ───────────────────────────────────────────────────────

  // Returns the shared AudioContext, creating a new one if it was never
  // opened or was closed after a previous session.
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    lastRecordingRef.current = null;
    setHasRecording(false);

    try {
      // Ask the browser for microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;

      const audioCtx = getAudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      // Build the audio graph: microphone → processor → destination
      // The processor must be connected to destination or the browser may skip its callbacks
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      isRecordingRef.current = true;

      // Each callback gives us one buffer of audio — copy it because the
      // underlying buffer is reused by the browser after the callback returns
      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        chunksRef.current.push(
          new Float32Array(e.inputBuffer.getChannelData(0)),
        );
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setStatus(STATUS.RECORDING);
    } catch (err) {
      setErrorMsg(`Microphone error: ${err.message}`);
      setStatus(STATUS.ERROR);
    }
  }, [getAudioContext]);

  const stopRecordingAndSend = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    // Tear down the recording audio graph and release the microphone
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const audioCtx = getAudioContext();
    const inputSampleRate = audioCtx.sampleRate;

    // Join all collected chunks into one array, then prepare the data for the server
    const merged = mergeChunks(chunksRef.current);
    chunksRef.current = [];

    const downsampled = downsample(merged, inputSampleRate, TARGET_SAMPLE_RATE);
    const pcmBuffer = floatToPcm16(downsampled);

    // Save the recording so the user can play it back with the buttons below
    lastRecordingRef.current = {
      float32: merged,
      sampleRate: inputSampleRate,
      downsampled,
    };
    setHasRecording(true);
    setStatus(STATUS.PROCESSING);

    try {
      const response = await fetch(SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: pcmBuffer,
      });

      if (!response.ok) {
        throw new Error(
          `Server responded with ${response.status} ${response.statusText}`,
        );
      }

      const responseBuffer = await response.arrayBuffer();

      // Empty response means the server had nothing to say — go back to idle
      if (responseBuffer.byteLength === 0) {
        setStatus(STATUS.IDLE);
        return;
      }

      // Decode and play the server's audio response
      setStatus(STATUS.PLAYING);
      const audioBuffer = pcm16ToAudioBuffer(
        responseBuffer,
        audioCtx,
        TARGET_SAMPLE_RATE,
      );
      const playbackSource = audioCtx.createBufferSource();
      playbackSource.buffer = audioBuffer;
      playbackSource.connect(audioCtx.destination);
      playbackSource.onended = () => setStatus(STATUS.IDLE);
      playbackSource.start();
    } catch (err) {
      setErrorMsg(`Request failed: ${err.message}`);
      setStatus(STATUS.ERROR);
    }
  }, [getAudioContext]);

  // ── Playback ───────────────────────────────────────────────────────────

  // Play back the raw microphone recording (full quality, original sample rate)
  const playMyVoice = useCallback(() => {
    if (!lastRecordingRef.current) return;
    const { float32, sampleRate } = lastRecordingRef.current;

    const audioCtx = getAudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();

    // Stop any currently-playing "my voice" clip before starting a new one
    myVoiceSourceRef.current?.stop();

    const audioBuffer = audioCtx.createBuffer(1, float32.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32);

    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(audioCtx.destination);
    // Only reset to idle if this clip is still the active one when it ends
    src.onended = () =>
      setStatus((s) => (s === STATUS.PLAYING_MY_VOICE ? STATUS.IDLE : s));
    src.start();

    myVoiceSourceRef.current = src;
    setStatus(STATUS.PLAYING_MY_VOICE);
  }, [getAudioContext]);

  // Play back the downsampled version (what was actually sent to the server)
  const playServerVoice = useCallback(() => {
    if (!lastRecordingRef.current) return;
    const { downsampled } = lastRecordingRef.current;

    const audioCtx = getAudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();

    serverVoiceSourceRef.current?.stop();

    const audioBuffer = audioCtx.createBuffer(
      1,
      downsampled.length,
      TARGET_SAMPLE_RATE,
    );
    audioBuffer.getChannelData(0).set(downsampled);

    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(audioCtx.destination);
    src.onended = () =>
      setStatus((s) => (s === STATUS.PLAYING_SERVER_VOICE ? STATUS.IDLE : s));
    src.start();

    serverVoiceSourceRef.current = src;
    setStatus(STATUS.PLAYING_SERVER_VOICE);
  }, [getAudioContext]);

  // ── Event handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback(() => {
    if (status === STATUS.IDLE || status === STATUS.ERROR) startRecording();
  }, [status, startRecording]);

  const handleMouseUp = useCallback(() => {
    if (status === STATUS.RECORDING) stopRecordingAndSend();
  }, [status, stopRecordingAndSend]);

  // Keyboard accessibility: hold Space or Enter to record, release to send
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        if (status === STATUS.IDLE || status === STATUS.ERROR) startRecording();
      }
    },
    [status, startRecording],
  );

  const handleKeyUp = useCallback(
    (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (status === STATUS.RECORDING) stopRecordingAndSend();
      }
    },
    [status, stopRecordingAndSend],
  );

  // ── Derived UI values ──────────────────────────────────────────────────

  // Mic button is disabled while audio is in-flight — only allow interaction at idle or error
  const isMicDisabled =
    status === STATUS.PROCESSING ||
    status === STATUS.PLAYING ||
    status === STATUS.PLAYING_MY_VOICE ||
    status === STATUS.PLAYING_SERVER_VOICE;

  const statusLabel = STATUS_LABELS[status];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <h1 className="app-title">Voice Interface</h1>

      <MicButton
        status={status}
        label={statusLabel}
        disabled={isMicDisabled}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      />

      <p className="status-label">{statusLabel}</p>

      {/* Playback buttons appear only after the first recording */}
      {hasRecording && (
        <PlaybackButton
          text="Play My Original Voice"
          ariaLabel="Play my original voice"
          isActive={status === STATUS.PLAYING_MY_VOICE}
          isDisabled={isMicDisabled && status !== STATUS.PLAYING_MY_VOICE}
          onClick={playMyVoice}
        />
      )}

      {hasRecording && (
        <PlaybackButton
          text="Play Transformed Voice For Server"
          ariaLabel="Play voice that send to server"
          isActive={status === STATUS.PLAYING_SERVER_VOICE}
          isDisabled={isMicDisabled && status !== STATUS.PLAYING_SERVER_VOICE}
          onClick={playServerVoice}
        />
      )}

      {status === STATUS.ERROR && errorMsg && (
        <p className="error-msg">{errorMsg}</p>
      )}
    </div>
  );
}
