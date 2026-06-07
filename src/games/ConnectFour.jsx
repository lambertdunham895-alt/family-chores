// Connect Four — 2-player turn-based with bomb, swap, and block power-ups.
// Self-contained: game logic + sound effects + UI all in one file.

import React, { useState, useEffect, useRef } from "react";

/* ============================================================
   CONSTANTS
   ============================================================ */
const COLS = 7;
const ROWS = 6;
const STORAGE_KEY = "connect_four_totals_v1";

const PLAYER_COLORS = ["#ff5252", "#1abc9c"]; // P1 red, P2 teal
const PLAYER_NAMES = ["Player 1", "Player 2"];
const PLAYER_LABEL = ["1", "2"];

const POWERS = [
  { id: "bomb",  emoji: "💣", name: "Bomb Column",  desc: "Removes all discs in a column" },
  { id: "swap",  emoji: "🔄", name: "Swap Adjacent", desc: "Swap two side-by-side discs" },
  { id: "block", emoji: "🚫", name: "Place Block",   desc: "Drop a neutral block disc" },
];

/* ============================================================
   GAME LOGIC
   ============================================================ */
function makeEmptyBoard() {
  // board[row][col]: null = empty, 0 = P1, 1 = P2, "X" = neutral block
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function dropDisc(board, col, value) {
  // Find lowest empty row in column
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      const nb = board.map((row) => [...row]);
      nb[r][col] = value;
      return { board: nb, row: r };
    }
  }
  return null; // column full
}

function clearColumn(board, col) {
  const nb = board.map((row) => [...row]);
  for (let r = 0; r < ROWS; r++) nb[r][col] = null;
  // Let any floating discs fall — gravity
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (nb[r][c] !== null) stack.push(nb[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      nb[r][c] = stack.length ? stack.shift() : null;
    }
  }
  return nb;
}

function swapDiscs(board, r1, c1, r2, c2) {
  const nb = board.map((row) => [...row]);
  const tmp = nb[r1][c1];
  nb[r1][c1] = nb[r2][c2];
  nb[r2][c2] = tmp;
  return nb;
}

const DIRS = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal down-right
  [1, -1],  // diagonal down-left
];

function findWinningLine(board, value) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== value) continue;
      for (const [dr, dc] of DIRS) {
        const line = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr][nc] !== value) break;
          line.push([nr, nc]);
        }
        if (line.length === 4) return line;
      }
    }
  }
  return null;
}

function isBoardFull(board) {
  for (let c = 0; c < COLS; c++) if (board[0][c] === null) return false;
  return true;
}

function isColumnFull(board, col) {
  return board[0][col] !== null;
}

function adjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return (dr + dc === 1); // only orthogonal adjacency
}

/* ============================================================
   SOUND
   ============================================================ */
let audioCtx = null;
let soundEnabled = true;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function tone(freq, dur, type = "sine", gain = 0.15, slide) {
  if (!soundEnabled) return;
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}
function noise(dur, gain = 0.2) {
  if (!soundEnabled) return;
  const c = getCtx(); if (!c) return;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  src.start();
}
const sfx = {
  drop: () => tone(440, 0.12, "triangle", 0.18, 220),
  click: () => tone(420, 0.05, "square", 0.1),
  bomb: () => { noise(0.4, 0.35); tone(120, 0.4, "sawtooth", 0.2, 40); },
  swap: () => { tone(660, 0.1, "sine", 0.15, 880); setTimeout(() => tone(990, 0.1, "sine", 0.15, 1320), 60); },
  block: () => tone(220, 0.18, "sawtooth", 0.18, 180),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.2), i * 120)); },
  tie: () => { tone(330, 0.3, "sine", 0.15, 220); },
};

/* ============================================================
   COMPONENT
   ============================================================ */
export default function ConnectFour() {
  const [board, setBoard] = useState(() => makeEmptyBoard());
  const [current, setCurrent] = useState(0);
  const [winner, setWinner] = useState(null); // null | 0 | 1 | "tie"
  const [winLine, setWinLine] = useState([]);
  const [round, setRound] = useState(1);
  const [totals, setTotals] = useState([0, 0]);
  const [powersUsed, setPowersUsed] = useState([{}, {}]); // per-player power-used flags
  const [mode, setMode] = useState("normal"); // normal | bomb | swap-pick1 | swap-pick2 | block
  const [swapFirst, setSwapFirst] = useState(null); // [r, c]
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [powerPickerOpen, setPowerPickerOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [lastDrop, setLastDrop] = useState(null); // [row, col] for animation hint
  const fId = useRef(1);
  const [floaters, setFloaters] = useState([]);

  useEffect(() => { soundEnabled = soundOn; }, [soundOn]);

  // Load all-time totals
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (Array.isArray(v) && v.length === 2) setTotals([v[0] | 0, v[1] | 0]);
      }
    } catch {}
  }, []);

  const addFloater = (col, text, color) => {
    const id = fId.current++;
    setFloaters((f) => [...f, { id, col, text, color }]);
    setTimeout(() => setFloaters((f) => f.filter((fl) => fl.id !== id)), 1100);
  };

  // Check for win/tie after every board change
  useEffect(() => {
    if (winner) return;
    // Check both players for a win
    for (const p of [0, 1]) {
      const line = findWinningLine(board, p);
      if (line) {
        setWinner(p);
        setWinLine(line);
        sfx.win();
        const newTotals = [...totals];
        newTotals[p] += 1;
        setTotals(newTotals);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newTotals)); } catch {}
        return;
      }
    }
    if (isBoardFull(board)) {
      setWinner("tie");
      sfx.tie();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  // ---------- ACTIONS ----------
  const handleColumnClick = (col) => {
    if (winner) return;

    // BOMB mode — clear the column
    if (mode === "bomb") {
      sfx.bomb();
      const nb = clearColumn(board, col);
      setBoard(nb);
      addFloater(col, "💥 BOOM!", "#f97316");
      markPowerUsed("bomb");
      setMode("normal");
      endTurn();
      return;
    }

    // BLOCK mode — drop a neutral block
    if (mode === "block") {
      if (isColumnFull(board, col)) return;
      sfx.block();
      const result = dropDisc(board, col, "X");
      if (!result) return;
      setBoard(result.board);
      setLastDrop([result.row, col]);
      addFloater(col, "🚫 Blocked!", "#6b7c8c");
      markPowerUsed("block");
      setMode("normal");
      endTurn();
      return;
    }

    // NORMAL — drop the current player's disc
    if (isColumnFull(board, col)) return;
    sfx.drop();
    const result = dropDisc(board, col, current);
    if (!result) return;
    setBoard(result.board);
    setLastDrop([result.row, col]);
    endTurn();
  };

  const handleDiscClick = (r, c) => {
    // Used only for swap mode
    if (mode !== "swap-pick1" && mode !== "swap-pick2") return;
    if (board[r][c] === null) return;

    if (mode === "swap-pick1") {
      setSwapFirst([r, c]);
      setMode("swap-pick2");
      return;
    }

    // swap-pick2
    if (mode === "swap-pick2" && swapFirst) {
      const [r1, c1] = swapFirst;
      if (r === r1 && c === c1) {
        // cancel selection
        setSwapFirst(null);
        setMode("swap-pick1");
        return;
      }
      if (!adjacent(r1, c1, r, c)) {
        addFloater(c, "Must be adjacent!", "#c0392b");
        return;
      }
      sfx.swap();
      const nb = swapDiscs(board, r1, c1, r, c);
      setBoard(nb);
      addFloater(c, "🔄 Swapped!", "#a78bfa");
      markPowerUsed("swap");
      setSwapFirst(null);
      setMode("normal");
      endTurn();
      return;
    }
  };

  const markPowerUsed = (powerId) => {
    const np = [...powersUsed];
    np[current] = { ...np[current], [powerId]: true };
    setPowersUsed(np);
  };

  const endTurn = () => {
    setTimeout(() => setCurrent((p) => 1 - p), 200);
  };

  const usePower = (powerId) => {
    setPowerPickerOpen(false);
    if (powersUsed[current][powerId]) return;
    sfx.click();
    if (powerId === "bomb") setMode("bomb");
    else if (powerId === "swap") setMode("swap-pick1");
    else if (powerId === "block") setMode("block");
  };

  const cancelMode = () => {
    setMode("normal");
    setSwapFirst(null);
  };

  const newRound = () => {
    setBoard(makeEmptyBoard());
    setCurrent(round % 2); // alternate who starts each round
    setWinner(null);
    setWinLine([]);
    setPowersUsed([{}, {}]);
    setMode("normal");
    setSwapFirst(null);
    setLastDrop(null);
    setFloaters([]);
    setRound((r) => r + 1);
  };

  const resetTotals = () => {
    if (!confirm("Reset all-time scores?")) return;
    setTotals([0, 0]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  // Helper for swap-pick UI to know which discs are tappable
  const swapAdjacents = swapFirst
    ? new Set([
        `${swapFirst[0] - 1},${swapFirst[1]}`,
        `${swapFirst[0] + 1},${swapFirst[1]}`,
        `${swapFirst[0]},${swapFirst[1] - 1}`,
        `${swapFirst[0]},${swapFirst[1] + 1}`,
      ])
    : null;

  const winSet = new Set(winLine.map(([r, c]) => `${r},${c}`));

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div style={S.app}>
      {/* Floating clouds */}
      <div style={S.cloudsLayer} aria-hidden>
        <div style={{ ...S.cloud, top: "8%", left: "10%", animationDelay: "0s" }}>☁️</div>
        <div style={{ ...S.cloud, top: "22%", right: "12%", animationDelay: "-8s", fontSize: 28 }}>☁️</div>
        <div style={{ ...S.cloud, top: "60%", left: "6%", animationDelay: "-3s", fontSize: 24 }}>☁️</div>
        <div style={{ ...S.cloud, top: "78%", right: "8%", animationDelay: "-12s" }}>☁️</div>
      </div>

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.titleBig}>
          <span style={{ ...S.titleWord, color: "#fbbf24" }}>CONNECT</span>{" "}
          <span style={{ ...S.titleWord, color: "#fff" }}>FOUR</span>
        </h1>
        <div style={S.subheader}>
          ROUND <span style={S.roundBadge}>{round}</span> · 2-PLAYER BATTLE
        </div>
        <div style={S.headerBtns}>
          <button style={S.iconBtn} onClick={() => setSoundOn((s) => !s)} title="Sound">
            {soundOn ? "🔊" : "🔇"}
          </button>
          <button style={S.iconBtn} onClick={() => setTutorialOpen(true)} title="How to play">❓</button>
          <button style={S.iconBtn} onClick={newRound} title="New round">↻</button>
        </div>
      </div>

      {/* Player cards */}
      <div style={S.scoreRow}>
        {[0, 1].map((p) => {
          const isP1 = p === 0;
          const gradient = isP1
            ? "linear-gradient(135deg,#ff6b6b 0%,#feca57 100%)"
            : "linear-gradient(135deg,#26d0ce 0%,#1abc9c 100%)";
          const isActive = current === p && !winner;
          const unusedPowers = POWERS.filter((pw) => !powersUsed[p][pw.id]).length;
          return (
            <div key={p} style={{
              ...S.scoreCard,
              background: gradient,
              ...(isActive ? S.scoreCardActive : { opacity: 0.85 }),
            }}>
              <div style={S.scoreCardTop}>
                <div style={S.scoreBigLetter}>{PLAYER_LABEL[p]}</div>
                <div style={S.scoreBigNum}>{totals[p]}</div>
              </div>
              <div style={S.scoreCardName}>{PLAYER_NAMES[p]}</div>
              <button
                style={{
                  ...S.scoreCardBtn,
                  ...(unusedPowers > 0 && isActive ? S.scoreCardBtnReady : {}),
                  cursor: unusedPowers > 0 && isActive ? "pointer" : "default",
                }}
                onClick={() => unusedPowers > 0 && isActive && setPowerPickerOpen(true)}
                disabled={unusedPowers === 0 || !isActive}
              >
                ⚡ POWERS ({unusedPowers})
              </button>
              <div style={S.powerChips}>
                {POWERS.map((pw) => (
                  <span
                    key={pw.id}
                    style={{ ...S.powerChip, opacity: powersUsed[p][pw.id] ? 0.3 : 1 }}
                    title={pw.name}
                  >
                    {pw.emoji}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Turn pill */}
      {!winner && (
        <div style={S.turnPillWrap}>
          <div style={S.turnPill}>
            {mode === "bomb" ? "💣 PICK A COLUMN TO BOMB!" :
             mode === "block" ? "🚫 PICK A COLUMN TO BLOCK!" :
             mode === "swap-pick1" ? "🔄 PICK FIRST DISC TO SWAP" :
             mode === "swap-pick2" ? "🔄 PICK ADJACENT DISC TO SWAP" :
             `${PLAYER_NAMES[current].toUpperCase()}'S TURN`}
          </div>
          {mode !== "normal" && (
            <button style={S.cancelModeBtn} onClick={cancelMode}>Cancel</button>
          )}
        </div>
      )}

      {/* Board */}
      <div style={S.boardWrap}>
        <div style={S.board}>
          {/* Column buttons (drop indicators above the board) */}
          <div style={S.colBtnsRow}>
            {Array.from({ length: COLS }, (_, c) => {
              const canDrop = !winner && !isColumnFull(board, c) && (mode === "normal" || mode === "bomb" || mode === "block");
              const isHot = canDrop && (mode === "bomb" || mode === "block");
              return (
                <button
                  key={c}
                  style={{
                    ...S.colBtn,
                    ...(canDrop ? S.colBtnActive : {}),
                    ...(isHot ? S.colBtnHot : {}),
                    background: mode === "normal" && canDrop ? PLAYER_COLORS[current] : (isHot ? "#fbbf24" : "#cbd5e0"),
                  }}
                  onClick={() => canDrop && handleColumnClick(c)}
                  disabled={!canDrop}
                >
                  {mode === "bomb" ? "💣" : mode === "block" ? "🚫" : "▼"}
                </button>
              );
            })}
          </div>

          {/* Grid */}
          <div style={S.grid}>
            {board.map((row, r) =>
              row.map((cell, c) => {
                const isWin = winSet.has(`${r},${c}`);
                const isLast = lastDrop && lastDrop[0] === r && lastDrop[1] === c;
                const isSwapFirst = swapFirst && swapFirst[0] === r && swapFirst[1] === c;
                const canSwapPick = mode === "swap-pick1" && cell !== null;
                const canSwapAdjacent = mode === "swap-pick2" && swapAdjacents && swapAdjacents.has(`${r},${c}`) && cell !== null;
                const swapTappable = canSwapPick || canSwapAdjacent;
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{
                      ...S.cell,
                      ...(swapTappable ? S.cellSwapTarget : {}),
                      cursor: swapTappable ? "pointer" : "default",
                    }}
                    onClick={() => swapTappable && handleDiscClick(r, c)}
                  >
                    {cell !== null && (
                      <div
                        style={{
                          ...S.disc,
                          background: cell === "X" ? "#6b7c8c" : PLAYER_COLORS[cell],
                          ...(isWin ? S.discWin : {}),
                          ...(isLast ? S.discLast : {}),
                          ...(isSwapFirst ? S.discSwapSel : {}),
                        }}
                      >
                        {cell === "X" && <span style={S.blockX}>🚫</span>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Floating text per column */}
          {floaters.map((f) => (
            <div key={f.id} style={{
              ...S.floater,
              left: `${(f.col + 0.5) * (100 / COLS)}%`,
              color: f.color,
            }}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <span>Round: <strong>{round}</strong></span>
        <span>All-time: <strong style={{ color: PLAYER_COLORS[0] }}>{totals[0]}</strong> – <strong style={{ color: PLAYER_COLORS[1] }}>{totals[1]}</strong></span>
        <button style={S.resetBtn} onClick={resetTotals}>Reset</button>
      </div>

      {/* Power picker modal */}
      {powerPickerOpen && (
        <div style={S.modalOverlay} onClick={() => setPowerPickerOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalTitle}>Pick a Power</h2>
            <div style={S.powerGrid}>
              {POWERS.map((pw) => {
                const used = powersUsed[current][pw.id];
                return (
                  <button
                    key={pw.id}
                    style={{ ...S.powerBtn, opacity: used ? 0.4 : 1, cursor: used ? "not-allowed" : "pointer" }}
                    onClick={() => !used && usePower(pw.id)}
                    disabled={used}
                  >
                    <span style={{ fontSize: 36 }}>{pw.emoji}</span>
                    <span style={S.powerName}>{pw.name}</span>
                    <span style={S.powerDesc}>{pw.desc}</span>
                    {used && <span style={S.usedTag}>USED</span>}
                  </button>
                );
              })}
            </div>
            <button style={S.modalCloseBtn} onClick={() => setPowerPickerOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tutorial modal */}
      {tutorialOpen && (
        <div style={S.modalOverlay} onClick={() => setTutorialOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalTitle}>How to Play</h2>
            <ul style={S.tutorialList}>
              <li><strong>Tap a column</strong> to drop your disc into it.</li>
              <li><strong>Get 4 in a row</strong> — horizontal, vertical, or diagonal — to win!</li>
              <li>Each player gets <strong>3 one-time powers</strong>:</li>
              <li style={{ marginLeft: 16 }}><strong>💣 Bomb Column</strong> — wipes a whole column clean</li>
              <li style={{ marginLeft: 16 }}><strong>🔄 Swap Adjacent</strong> — swap two side-by-side discs</li>
              <li style={{ marginLeft: 16 }}><strong>🚫 Place Block</strong> — drop a neutral blocker</li>
              <li>Tap the <strong>POWERS</strong> button on your card to use them.</li>
              <li>Powers count as your turn — use them wisely!</li>
            </ul>
            <button style={S.modalCloseBtn} onClick={() => setTutorialOpen(false)}>Got it!</button>
          </div>
        </div>
      )}

      {/* Winner modal */}
      {winner !== null && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <h2 style={{ ...S.modalTitle, fontSize: 28 }}>
              {winner === "tie" ? "🤝 It's a tie!" : `🏆 ${PLAYER_NAMES[winner]} wins!`}
            </h2>
            <div style={S.winScores}>
              <div style={{ color: PLAYER_COLORS[0], fontWeight: 900, fontSize: 22 }}>P1: {totals[0]}</div>
              <div style={{ color: PLAYER_COLORS[1], fontWeight: 900, fontSize: 22 }}>P2: {totals[1]}</div>
            </div>
            <button style={{ ...S.modalCloseBtn, background: "#3d7a4e", color: "#fff" }} onClick={newRound}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const S = {
  app: {
    maxWidth: 560, margin: "0 auto", padding: "16px 14px 30px",
    fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#1a2b3c",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #87ceeb 0%, #b6e0f5 50%, #d9f0fc 100%)",
    position: "relative", overflow: "hidden",
  },
  cloudsLayer: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" },
  cloud: { position: "absolute", fontSize: 32, opacity: 0.85, animation: "c4cloudfloat 24s linear infinite" },

  header: { position: "relative", zIndex: 2, textAlign: "center", marginBottom: 14 },
  titleBig: {
    margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: 1,
    textShadow: "3px 3px 0 #1a2b3c, 6px 6px 0 rgba(0,0,0,0.15)",
    fontFamily: "'Segoe UI Black', 'Arial Black', sans-serif",
    lineHeight: 1.05,
  },
  titleWord: { display: "inline-block", WebkitTextStroke: "1px #1a2b3c" },
  subheader: { fontSize: 13, fontWeight: 800, color: "#1a2b3c", letterSpacing: 1.5, marginTop: 6 },
  roundBadge: {
    display: "inline-block", background: "#fbbf24", color: "#1a2b3c",
    padding: "2px 10px", borderRadius: 20, fontWeight: 900, margin: "0 4px",
    border: "2px solid #1a2b3c",
  },
  headerBtns: { display: "flex", gap: 8, justifyContent: "center", marginTop: 10 },
  iconBtn: {
    background: "#fff", border: "2.5px solid #1a2b3c", borderRadius: 10,
    padding: "6px 12px", fontSize: 16, cursor: "pointer",
    boxShadow: "0 3px 0 #1a2b3c", fontWeight: 700,
  },

  scoreRow: { position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  scoreCard: {
    border: "3px solid #1a2b3c", borderRadius: 16, padding: 12,
    boxShadow: "0 4px 0 #1a2b3c", transition: "transform 0.15s",
  },
  scoreCardActive: { transform: "translateY(-3px)", boxShadow: "0 7px 0 #1a2b3c" },
  scoreCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  scoreBigLetter: { fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1, textShadow: "2px 2px 0 #1a2b3c" },
  scoreBigNum: { fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1, textShadow: "2px 2px 0 #1a2b3c" },
  scoreCardName: {
    fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.95)",
    textTransform: "uppercase", letterSpacing: 1, marginTop: 4, marginBottom: 8,
    textShadow: "1px 1px 0 rgba(0,0,0,0.3)",
  },
  scoreCardBtn: {
    width: "100%", background: "#1a2b3c", color: "#fff",
    border: "none", borderRadius: 8, padding: "8px 0",
    fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
  },
  scoreCardBtnReady: {
    background: "#fbbf24", color: "#1a2b3c",
    animation: "c4pulseready 1.2s ease-in-out infinite",
  },
  powerChips: { display: "flex", justifyContent: "center", gap: 8, marginTop: 8, fontSize: 18 },
  powerChip: { transition: "opacity 0.3s" },

  turnPillWrap: { position: "relative", zIndex: 2, textAlign: "center", marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  turnPill: {
    display: "inline-block",
    background: "#fff", border: "3px solid #1a2b3c", borderRadius: 30,
    padding: "8px 22px", fontWeight: 900, fontSize: 13, color: "#1a2b3c",
    letterSpacing: 1, boxShadow: "0 3px 0 #1a2b3c",
  },
  cancelModeBtn: {
    background: "#fff", border: "2px solid #1a2b3c", borderRadius: 8,
    padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 2px 0 #1a2b3c",
  },

  boardWrap: { position: "relative", zIndex: 2, width: "100%", maxWidth: 480, margin: "0 auto", marginBottom: 14 },
  board: { position: "relative" },
  colBtnsRow: { display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 4, marginBottom: 6 },
  colBtn: {
    aspectRatio: "1",
    color: "#fff", border: "2.5px solid #1a2b3c", borderRadius: 10,
    fontSize: 18, fontWeight: 900, cursor: "default",
    boxShadow: "0 3px 0 #1a2b3c", transition: "transform 0.1s",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  colBtnActive: { cursor: "pointer" },
  colBtnHot: { animation: "c4hotpulse 0.9s ease-in-out infinite" },

  grid: {
    background: "#3a7bd5",
    border: "4px solid #1a2b3c",
    borderRadius: 14,
    padding: 8,
    display: "grid",
    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
    gap: 6,
    boxShadow: "0 5px 0 #1a2b3c",
  },
  cell: {
    aspectRatio: "1",
    background: "rgba(0,0,0,0.25)",
    border: "2px solid #1a2b3c",
    borderRadius: "50%",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  cellSwapTarget: {
    background: "rgba(251,191,36,0.4)",
    boxShadow: "inset 0 0 0 3px #fbbf24",
  },
  disc: {
    width: "88%", height: "88%", borderRadius: "50%",
    border: "2.5px solid #1a2b3c",
    boxShadow: "inset 0 -4px 6px rgba(0,0,0,0.3), inset 0 3px 5px rgba(255,255,255,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  discWin: { animation: "c4winflash 0.7s ease-in-out infinite", boxShadow: "0 0 0 4px #fbbf24, inset 0 -4px 6px rgba(0,0,0,0.3)" },
  discLast: { animation: "c4drop 0.3s ease-out" },
  discSwapSel: { boxShadow: "0 0 0 4px #fbbf24, inset 0 -4px 6px rgba(0,0,0,0.3)" },
  blockX: { fontSize: 18 },

  floater: {
    position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
    fontSize: 18, fontWeight: 900, pointerEvents: "none",
    animation: "c4floatup 1.1s ease-out forwards",
    textShadow: "2px 2px 0 #1a2b3c",
    WebkitTextStroke: "0.5px #1a2b3c",
    whiteSpace: "nowrap", zIndex: 5,
  },

  footer: {
    position: "relative", zIndex: 2,
    display: "flex", justifyContent: "space-around", alignItems: "center",
    fontSize: 12, color: "#1a2b3c", padding: "10px 6px",
    background: "#fff", borderRadius: 14, border: "3px solid #1a2b3c",
    boxShadow: "0 3px 0 #1a2b3c", fontWeight: 700,
  },
  resetBtn: {
    background: "#fff", border: "2px solid #1a2b3c", borderRadius: 6,
    padding: "3px 10px", fontSize: 11, color: "#1a2b3c", cursor: "pointer", fontWeight: 700,
  },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(26,43,60,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: "#fff", borderRadius: 20, padding: 24, maxWidth: 440, width: "100%", border: "4px solid #1a2b3c", boxShadow: "0 8px 0 #1a2b3c" },
  modalTitle: { color: "#1a2b3c", margin: "0 0 16px", fontSize: 24, textAlign: "center", fontWeight: 900 },
  powerGrid: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  powerBtn: {
    background: "#fff", border: "3px solid #1a2b3c", borderRadius: 14,
    padding: "12px 14px", display: "flex", flexDirection: "row", alignItems: "center", gap: 12,
    fontWeight: 800, boxShadow: "0 4px 0 #1a2b3c", textAlign: "left",
    position: "relative",
  },
  powerName: { fontSize: 15, color: "#1a2b3c", flex: 1, display: "block" },
  powerDesc: { fontSize: 11, color: "#6b7c8c", fontWeight: 600, display: "block", marginTop: 2 },
  usedTag: {
    position: "absolute", right: 10, top: 10,
    background: "#c0392b", color: "#fff", fontSize: 10, fontWeight: 800,
    padding: "2px 6px", borderRadius: 4,
  },
  modalCloseBtn: {
    display: "block", width: "100%", marginTop: 16,
    background: "#fbbf24", color: "#1a2b3c", border: "3px solid #1a2b3c",
    borderRadius: 12, padding: "12px 0", fontSize: 16, fontWeight: 900, cursor: "pointer",
    boxShadow: "0 4px 0 #1a2b3c", letterSpacing: 1,
  },
  tutorialList: { paddingLeft: 18, lineHeight: 1.7, fontSize: 14, color: "#1a2b3c" },
  winScores: { display: "flex", justifyContent: "space-around", margin: "16px 0", padding: "12px 0", borderTop: "3px solid #1a2b3c", borderBottom: "3px solid #1a2b3c" },
};

// Inject keyframes
if (typeof document !== "undefined") {
  const styleId = "c4-keyframes";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `
      @keyframes c4cloudfloat {
        0% { transform: translateX(0); }
        50% { transform: translateX(20px); }
        100% { transform: translateX(0); }
      }
      @keyframes c4pulseready {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes c4hotpulse {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes c4drop {
        0% { transform: translateY(-200%); }
        70% { transform: translateY(8%); }
        100% { transform: translateY(0); }
      }
      @keyframes c4winflash {
        0%, 100% { box-shadow: 0 0 0 4px #fbbf24, inset 0 -4px 6px rgba(0,0,0,0.3); }
        50% { box-shadow: 0 0 0 6px #fde047, 0 0 20px #fbbf24, inset 0 -4px 6px rgba(0,0,0,0.3); }
      }
      @keyframes c4floatup {
        0% { opacity: 0; transform: translate(-50%, 100%) scale(0.8); }
        15% { opacity: 1; transform: translate(-50%, 20%) scale(1.15); }
        100% { opacity: 0; transform: translate(-50%, -100%) scale(1); }
      }
    `;
    document.head.appendChild(s);
  }
}
