// SVG icon inside the mic button.
// Shows a speaker when audio is playing, and a microphone for all other states.
export default function MicIcon({ status }) {
  const isPlaying = status === "playing";

  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {isPlaying ? (
        // Speaker / waveform icon — shown while the server response plays back
        <>
          <path d="M3 9v6h4l5 5V4L7 9H3z" />
          <path
            d="M16.5 12A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
            opacity=".7"
          />
          <path
            d="M19 12c0 3.31-2.69 6-6 6v2c4.42 0 8-3.58 8-8s-3.58-8-8-8v2c3.31 0 6 2.69 6 6z"
            opacity=".4"
          />
        </>
      ) : (
        // Microphone icon — shown during idle, recording, processing, etc.
        <>
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2z" />
        </>
      )}
    </svg>
  );
}
