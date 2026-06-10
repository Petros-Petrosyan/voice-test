// A small pill-shaped button for replaying a recorded audio clip.
// isActive highlights the button while that clip is currently playing.
export default function PlaybackButton({
  text,
  ariaLabel,
  isActive,
  isDisabled,
  onClick,
}) {
  return (
    <button
      className={`play-voice-button${isActive ? " play-voice-button--active" : ""}`}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
    >
      ▶ {text}
    </button>
  );
}
