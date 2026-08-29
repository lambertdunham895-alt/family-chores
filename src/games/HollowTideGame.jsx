import React from "react";

/* Thin wrapper around the static game at public/hollow-tide/index.html.
   The explicit pixel height matters — height:100% collapses inside the hub. */
export default function HollowTideGame() {
  return (
    <div style={{ width: "100%", height: "calc(100vh - 52px)", background: "#02060f" }}>
      <iframe
        src="/hollow-tide/index.html"
        title="Hollow Tide"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}
