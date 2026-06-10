import { useRef, useState, useCallback } from 'react';
import './App.css';
import { downsample, floatToPcm16, pcm16ToAudioBuffer } from './audioUtils';

const TARGET_SAMPLE_RATE = 16000;
const SERVER_URL = 'http://localhost:3001/buffer';

// Collect all Float32 chunks from a ScriptProcessorNode into one flat array.
function mergeChunks(chunks) {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export default function App() {
  const [status, setStatus] = useState('idle'); // idle | recording | processing | playing | error
  const [errorMsg, setErrorMsg] = useState('');

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const chunksRef = useRef([]);
  const isRecordingRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = getAudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // bufferSize 4096 is a reasonable tradeoff for latency vs. overhead
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      isRecordingRef.current = true;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        // Copy the channel data — the buffer is reused after this callback returns
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setStatus('recording');
    } catch (err) {
      setErrorMsg(`Microphone error: ${err.message}`);
      setStatus('error');
    }
  }, [getAudioContext]);

  const stopRecordingAndSend = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    // Tear down the recording graph
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const audioCtx = getAudioContext();
    const inputSampleRate = audioCtx.sampleRate;
    const merged = mergeChunks(chunksRef.current);
    chunksRef.current = [];

    const downsampled = downsample(merged, inputSampleRate, TARGET_SAMPLE_RATE);
    const pcmBuffer = floatToPcm16(downsampled);

    setStatus('processing');

    try {
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcmBuffer,
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status} ${response.statusText}`);
      }

      const responseBuffer = await response.arrayBuffer();
      if (responseBuffer.byteLength === 0) {
        setStatus('idle');
        return;
      }

      setStatus('playing');
      const audioBuffer = pcm16ToAudioBuffer(responseBuffer, audioCtx, TARGET_SAMPLE_RATE);
      const playbackSource = audioCtx.createBufferSource();
      playbackSource.buffer = audioBuffer;
      playbackSource.connect(audioCtx.destination);
      playbackSource.onended = () => setStatus('idle');
      playbackSource.start();
    } catch (err) {
      setErrorMsg(`Request failed: ${err.message}`);
      setStatus('error');
    }
  }, [getAudioContext]);

  const handleMouseDown = useCallback(() => {
    if (status === 'idle' || status === 'error') startRecording();
  }, [status, startRecording]);

  const handleMouseUp = useCallback(() => {
    if (status === 'recording') stopRecordingAndSend();
  }, [status, stopRecordingAndSend]);

  // Keyboard accessibility: Space / Enter to hold-to-speak
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        if (status === 'idle' || status === 'error') startRecording();
      }
    },
    [status, startRecording]
  );

  const handleKeyUp = useCallback(
    (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (status === 'recording') stopRecordingAndSend();
      }
    },
    [status, stopRecordingAndSend]
  );

  const isDisabled = status === 'processing' || status === 'playing';

  const statusLabel = {
    idle: 'Hold to Speak',
    recording: 'Recording…',
    processing: 'Processing…',
    playing: 'Playing Response…',
    error: 'Hold to Speak',
  }[status];

  return (
    <div className="app">
      <h1 className="app-title">Voice Interface</h1>

      <button
        className={`mic-button mic-button--${status}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => { e.preventDefault(); handleMouseDown(); }}
        onTouchEnd={(e) => { e.preventDefault(); handleMouseUp(); }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        disabled={isDisabled}
        aria-label={statusLabel}
      >
        <MicIcon status={status} />
      </button>

      <p className="status-label">{statusLabel}</p>

      {status === 'error' && errorMsg && (
        <p className="error-msg">{errorMsg}</p>
      )}
    </div>
  );
}

function MicIcon({ status }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {status === 'playing' ? (
        // Speaker / waveform icon during playback
        <>
          <path d="M3 9v6h4l5 5V4L7 9H3z" />
          <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" opacity=".7" />
          <path d="M19 12c0 3.31-2.69 6-6 6v2c4.42 0 8-3.58 8-8s-3.58-8-8-8v2c3.31 0 6 2.69 6 6z" opacity=".4" />
        </>
      ) : (
        // Microphone icon
        <>
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2z" />
        </>
      )}
    </svg>
  );
}
