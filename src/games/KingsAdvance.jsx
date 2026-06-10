export default function KingsAdvance() {
  // The actual game is a standalone HTML build served from /kings-advance/.
  // It handles its own canvas, touch controls, landscape fit, and fullscreen.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "100dvh",
        background: "#05060a",
        display: "flex",
      }}
    >
      <iframe
        src="/kings-advance/index.html"
        title="King's Advance"
        allow="fullscreen"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          minHeight: "100dvh",
          border: "none",
          display: "block",
        }}
      />
    </div>
  );
}
