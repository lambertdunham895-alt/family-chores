import React from "react";

export default function StellarSiegeGame() {
  return (
    <div style={{ width: "100%", height: "calc(100vh - 52px)", background: "#000" }}>
      <iframe
        src="/stellar-siege/index.html"
        title="Stellar Siege"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="autoplay"
      />
    </div>
  );
}
