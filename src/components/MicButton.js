import MicIcon from "./MicIcon";

// The big circular hold-to-speak button in the center of the screen.
// Responds to mouse, touch, and keyboard (Space / Enter).
export default function MicButton({
  status,
  label,
  disabled,
  onMouseDown,
  onMouseUp,
  onKeyDown,
  onKeyUp,
}) {
  // Touch events need preventDefault to stop the browser from also firing
  // the equivalent mouse events on touch devices (which would double-trigger).
  const handleTouchStart = (e) => {
    e.preventDefault();
    onMouseDown();
  };
  const handleTouchEnd = (e) => {
    e.preventDefault();
    onMouseUp();
  };

  return (
    <button
      className={`mic-button mic-button--${status}`}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      disabled={disabled}
      aria-label={label}
    >
      <MicIcon status={status} />
    </button>
  );
}
