import React from "react";

// N7 Pinball — embeds the standalone game in the Games Hub.
// Static files live at public/n7-pinball/ (index.html + assets/).
export default function PinballGame() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#05060a", zIndex: 50 }}>
      <iframe
        src="/n7-pinball/index.html"
        title="N7 Pinball"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="fullscreen"
      />
    </div>
  );
}
