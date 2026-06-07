import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Sparkles, Volume2, VolumeX, Bomb, Flame } from "lucide-react";
import * as Tone from "tone";

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// ---------- Sound ----------
let soundEnabled = true;
let synthsReady = false;
let placeSynth, bombSynth, winSynth, drawSynth, fuseSynth, clickSynth;

function initSynths() {
  if (synthsReady) return;
  placeSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.1 },
  }).toDestination();
  bombSynth = new Tone.NoiseSynth({
    noise: { type: "brown" },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.2 },
  }).toDestination();
  bombSynth.volume.value = -6;
  winSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.3 },
  }).toDestination();
  winSynth.volume.value = -10;
  drawSynth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.05, decay: 0.3, sustain: 0.1, release: 0.3 },
  }).toDestination();
  drawSynth.volume.value = -12;
  fuseSynth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
  }).toDestination();
  fuseSynth.volume.value = -14;
  clickSynth = new Tone.MembraneSynth().toDestination();
  clickSynth.volume.value = -18;
  synthsReady = true;
}

const sfx = {
  placeX: () => { if (!soundEnabled) return; initSynths(); placeSynth.triggerAttackRelease("E5", "16n"); },
  placeO: () => { if (!soundEnabled) return; initSynths(); placeSynth.triggerAttackRelease("A4", "16n"); },
  bomb: () => {
    if (!soundEnabled) return; initSynths();
    bombSynth.triggerAttackRelease("4n");
    placeSynth.triggerAttackRelease("C2", "8n", Tone.now() + 0.02);
  },
  win: () => {
    if (!soundEnabled) return; initSynths();
    const now = Tone.now();
    winSynth.triggerAttackRelease(["C5", "E5", "G5"], "8n", now);
    winSynth.triggerAttackRelease(["D5", "F5", "A5"], "8n", now + 0.15);
    winSynth.triggerAttackRelease(["E5", "G5", "C6"], "4n", now + 0.3);
  },
  draw: () => { if (!soundEnabled) return; initSynths(); drawSynth.triggerAttackRelease("A3", "4n"); },
  fuse: () => { if (!soundEnabled) return; initSynths(); fuseSynth.triggerAttackRelease("G5", "32n"); },
  reset: () => { if (!soundEnabled) return; initSynths(); clickSynth.triggerAttackRelease("C3", "16n"); },
  click: () => { if (!soundEnabled) return; initSynths(); clickSynth.triggerAttackRelease("C2", "32n"); },
};

function setSoundEnabled(on) {
  soundEnabled = on;
  if (on && Tone.context.state !== "running") Tone.start();
}

// ---------- Confetti ----------
function ConfettiBurst({ trigger, colors }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const spawn = (originX) => {
      for (let i = 0; i < 80; i++) {
        const angle = (Math.random() - 0.5) * Math.PI * 0.8 - Math.PI / 2;
        const speed = 8 + Math.random() * 14;
        particles.push({
          x: originX * canvas.width,
          y: canvas.height * 0.6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 6 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.3,
          life: 1,
          shape: Math.random() > 0.5 ? "rect" : "circle",
        });
      }
    };
    spawn(0.25);
    spawn(0.75);
    setTimeout(() => spawn(0.5), 200);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 0.35; // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;
        p.life -= 0.008;
        if (p.life <= 0 || p.y > canvas.height + 50) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (particles.length > 0) animRef.current = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    tick();
    return () => cancelAnimationFrame(animRef.current);
  }, [trigger, colors]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1000,
      }}
    />
  );
}

// ---------- Toast ----------
function Toast({ message, sub, show }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 20, left: "50%", transform: "translateX(-50%)",
        background: "white",
        border: "4px solid #1a1a2e",
        borderRadius: 16,
        padding: "12px 20px",
        fontFamily: "system-ui, sans-serif",
        fontWeight: 900,
        color: "#1a1a2e",
        boxShadow: "0 6px 0 #1a1a2e",
        zIndex: 2000,
        textAlign: "center",
        animation: "toastIn 0.3s ease",
        maxWidth: 320,
      }}
    >
      <div style={{ fontSize: 16 }}>{message}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ---------- Game ----------
function checkWinner(cells) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return { winner: cells[a], line };
    }
  }
  return null;
}

const STORAGE_KEY = "ettt:scores:v1";

export default function ExplosiveTicTacToe() {
  const [cells, setCells] = useState(Array(9).fill(null));
  const [current, setCurrent] = useState("X");
  const [winningLine, setWinningLine] = useState(null);
  const [winner, setWinner] = useState(null);
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0, streakPlayer: null, streakCount: 0 });
  const [scoresLoaded, setScoresLoaded] = useState(false);
  const [bombUsed, setBombUsed] = useState({ X: false, O: false });
  const [bombArmed, setBombArmed] = useState(false);
  const [exploding, setExploding] = useState(null);
  const [soundOn, setSoundOn] = useState(true);
  const [roundNum, setRoundNum] = useState(1);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [confettiColors, setConfettiColors] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "", sub: "" });
  const toastTimerRef = useRef(null);

  // Load scores
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage?.get(STORAGE_KEY);
        if (r?.value) setScores(JSON.parse(r.value));
      } catch {}
      setScoresLoaded(true);
    })();
  }, []);

  // Save scores
  useEffect(() => {
    if (!scoresLoaded) return;
    (async () => {
      try { await window.storage?.set(STORAGE_KEY, JSON.stringify(scores)); } catch {}
    })();
  }, [scores, scoresLoaded]);

  useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);

  const showToast = useCallback((message, sub) => {
    setToast({ show: true, message, sub: sub || "" });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2800);
  }, []);

  const fireConfetti = useCallback((player) => {
    const colors = player === "X"
      ? ["#ff3b6b", "#ff7a45", "#ffd166"]
      : ["#22c1f0", "#16d1b7", "#7afcff"];
    setConfettiColors(colors);
    setConfettiTrigger((n) => n + 1);
  }, []);

  const handleCellClick = useCallback((i) => {
    if (winner) return;
    Tone.start();

    if (bombArmed) {
      if (cells[i] == null) return;
      sfx.bomb();
      setExploding(i);
      setTimeout(() => {
        setCells((prev) => { const n = [...prev]; n[i] = null; return n; });
        setExploding(null);
        setBombUsed((u) => ({ ...u, [current]: true }));
        setBombArmed(false);
        setCurrent((p) => (p === "X" ? "O" : "X"));
      }, 550);
      return;
    }

    if (cells[i] != null) return;

    const next = [...cells];
    next[i] = current;
    setCells(next);
    current === "X" ? sfx.placeX() : sfx.placeO();

    const result = checkWinner(next);
    if (result) {
      setWinningLine(result.line);
      setWinner(result.winner);
      sfx.win();
      fireConfetti(result.winner);
      setScores((s) => {
        const streakCount = s.streakPlayer === result.winner ? s.streakCount + 1 : 1;
        return {
          ...s,
          [result.winner]: s[result.winner] + 1,
          streakPlayer: result.winner,
          streakCount,
        };
      });
      showToast(`Player ${result.winner} wins!`, "Tap Next Round to keep going.");
      return;
    }

    if (next.every((c) => c != null)) {
      setWinner("DRAW");
      sfx.draw();
      setScores((s) => ({ ...s, draws: s.draws + 1, streakPlayer: null, streakCount: 0 }));
      showToast("It's a draw!", "Nobody blew up the board this time.");
      return;
    }

    setCurrent(current === "X" ? "O" : "X");
  }, [bombArmed, cells, current, fireConfetti, winner, showToast]);

  const nextRound = useCallback(() => {
    sfx.reset();
    setCells(Array(9).fill(null));
    setWinningLine(null);
    setWinner(null);
    setBombUsed({ X: false, O: false });
    setBombArmed(false);
    setExploding(null);
    setCurrent((prev) => {
      if (winner === "DRAW" || !winner) return prev === "X" ? "O" : "X";
      return winner === "X" ? "O" : "X";
    });
    setRoundNum((r) => r + 1);
  }, [winner]);

  const newGame = useCallback(() => {
    sfx.reset();
    setCells(Array(9).fill(null));
    setWinningLine(null);
    setWinner(null);
    setBombUsed({ X: false, O: false });
    setBombArmed(false);
    setExploding(null);
    setCurrent("X");
    setRoundNum(1);
    setScores({ X: 0, O: 0, draws: 0, streakPlayer: null, streakCount: 0 });
    showToast("Brand new match!", "Scores reset. Let the chaos begin.");
  }, [showToast]);

  const armBomb = useCallback(() => {
    Tone.start();
    if (winner || bombUsed[current]) return;
    const hasOccupied = cells.some((c) => c != null);
    if (!hasOccupied) {
      showToast("Nothing to blow up yet!", "Place a mark first.");
      return;
    }
    sfx.fuse();
    setBombArmed((a) => !a);
  }, [bombUsed, cells, current, winner, showToast]);

  const streakX = scores.streakPlayer === "X" ? scores.streakCount : 0;
  const streakO = scores.streakPlayer === "O" ? scores.streakCount : 0;

  const statusText = useMemo(() => {
    if (winner === "DRAW") return "DRAW!";
    if (winner) return `PLAYER ${winner} WINS!`;
    if (bombArmed) return `${current} — PICK A SQUARE TO BOOM!`;
    return `PLAYER ${current}'S TURN`;
  }, [bombArmed, current, winner]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #7dd3fc 0%, #93c5fd 50%, #a5b4fc 100%)",
      padding: "20px 12px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes toastIn { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @keyframes pop { 0% { transform: scale(0) rotate(-30deg); } 60% { transform: scale(1.3) rotate(10deg); } 100% { transform: scale(1) rotate(0); } }
        @keyframes explode { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(2.5); opacity: 0.8; } 100% { transform: scale(4); opacity: 0; } }
        @keyframes shake { 0%,100% { transform: translate(0,0) rotate(0); } 25% { transform: translate(-4px,2px) rotate(-1deg); } 50% { transform: translate(4px,-2px) rotate(1deg); } 75% { transform: translate(-2px,2px) rotate(-0.5deg); } }
        @keyframes pulse-bomb { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes fuse { 0%,100% { box-shadow: 0 6px 0 #1a1a2e, 0 0 20px #ff7a45; } 50% { box-shadow: 0 6px 0 #1a1a2e, 0 0 35px #ff3b6b, 0 0 50px #ffd166; } }
        @keyframes float-cloud { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes win-glow { 0%,100% { box-shadow: 0 0 0 4px #ffd166, 0 8px 0 #1a1a2e, 0 0 40px #ffd166; } 50% { box-shadow: 0 0 0 4px #ffd166, 0 8px 0 #1a1a2e, 0 0 60px #ffd166, 0 0 80px #ff7a45; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .chunky-press:active { transform: translateY(4px); box-shadow: 0 2px 0 #1a1a2e !important; }
      `}</style>

      {/* Floating clouds */}
      <div style={{ position: "absolute", top: 40, left: "10%", fontSize: 60, opacity: 0.4, animation: "float-cloud 4s ease-in-out infinite" }}>☁️</div>
      <div style={{ position: "absolute", top: 120, right: "8%", fontSize: 45, opacity: 0.5, animation: "float-cloud 5s ease-in-out infinite 1s" }}>☁️</div>
      <div style={{ position: "absolute", bottom: 80, left: "5%", fontSize: 50, opacity: 0.3, animation: "float-cloud 6s ease-in-out infinite 2s" }}>☁️</div>

      <ConfettiBurst trigger={confettiTrigger} colors={confettiColors} />
      <Toast message={toast.message} sub={toast.sub} show={toast.show} />

      {/* Header */}
      <header style={{ textAlign: "center", marginBottom: 20, zIndex: 10, animation: "fade-in 0.5s ease" }}>
        <h1 style={{
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
          fontWeight: 900,
          color: "#ffd166",
          margin: 0,
          lineHeight: 0.9,
          letterSpacing: "-0.02em",
          textShadow: "-3px -3px 0 #1a1a2e, 3px -3px 0 #1a1a2e, -3px 3px 0 #1a1a2e, 3px 3px 0 #1a1a2e, 0 8px 0 #1a1a2e",
          transform: "rotate(-2deg)",
        }}>
          EXPLOSIVE
        </h1>
        <h1 style={{
          fontSize: "clamp(1.8rem, 6vw, 3rem)",
          fontWeight: 900,
          color: "white",
          margin: 0,
          marginTop: -4,
          letterSpacing: "-0.01em",
          textShadow: "-2px -2px 0 #1a1a2e, 2px -2px 0 #1a1a2e, -2px 2px 0 #1a1a2e, 2px 2px 0 #1a1a2e, 0 6px 0 #1a1a2e",
          transform: "rotate(1deg)",
        }}>
          TIC TAC TOE
        </h1>
        <div style={{
          marginTop: 12,
          fontSize: "0.95rem",
          fontWeight: 800,
          color: "white",
          textShadow: "0 2px 0 rgba(0,0,0,0.2)",
        }}>
          ROUND <span style={{ color: "#ffd166", background: "#1a1a2e", padding: "2px 10px", borderRadius: 12 }}>{roundNum}</span> · 2-PLAYER BATTLE
        </div>
      </header>

      {/* Player panels */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        width: "100%",
        maxWidth: 520,
        marginBottom: 16,
        zIndex: 10,
      }}>
        <PlayerPanel
          player="X"
          score={scores.X}
          streak={streakX}
          active={!winner && current === "X"}
          bombUsed={bombUsed.X}
          bombArmed={bombArmed && current === "X"}
          onBomb={armBomb}
          canBomb={current === "X" && !winner}
        />
        <PlayerPanel
          player="O"
          score={scores.O}
          streak={streakO}
          active={!winner && current === "O"}
          bombUsed={bombUsed.O}
          bombArmed={bombArmed && current === "O"}
          onBomb={armBomb}
          canBomb={current === "O" && !winner}
        />
      </div>

      {/* Status pill */}
      <div style={{
        background: winner === "X" ? "#ff3b6b" : winner === "O" ? "#22c1f0" : winner === "DRAW" ? "#94a3b8" : "white",
        color: winner ? "white" : "#1a1a2e",
        padding: "10px 22px",
        borderRadius: 999,
        border: "4px solid #1a1a2e",
        boxShadow: "0 5px 0 #1a1a2e",
        fontWeight: 900,
        fontSize: "0.95rem",
        marginBottom: 14,
        letterSpacing: "0.05em",
        zIndex: 10,
        textAlign: "center",
      }}>
        {statusText}
      </div>

      {/* Board */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: 10,
        padding: 14,
        background: "white",
        border: "5px solid #1a1a2e",
        borderRadius: 24,
        boxShadow: "0 8px 0 #1a1a2e",
        width: "min(92vw, 380px)",
        height: "min(92vw, 380px)",
        zIndex: 10,
        animation: bombArmed ? "shake 0.4s ease infinite" : "none",
      }}>
        {cells.map((cell, i) => (
          <Cell
            key={i}
            value={cell}
            isWinning={winningLine?.includes(i)}
            isExploding={exploding === i}
            bombArmed={bombArmed}
            currentPlayer={current}
            disabled={!!winner}
            onClick={() => handleCellClick(i)}
          />
        ))}
      </div>

      {/* Win banner */}
      {winner && (
        <div style={{
          marginTop: 16,
          padding: "12px 30px",
          background: winner === "DRAW"
            ? "#cbd5e1"
            : winner === "X"
            ? "linear-gradient(135deg, #ff3b6b, #ff7a45)"
            : "linear-gradient(135deg, #22c1f0, #16d1b7)",
          color: "white",
          fontSize: "clamp(1.6rem, 5vw, 2.2rem)",
          fontWeight: 900,
          borderRadius: 18,
          border: "5px solid #1a1a2e",
          boxShadow: "0 7px 0 #1a1a2e",
          textShadow: "0 3px 0 rgba(0,0,0,0.3)",
          letterSpacing: "0.05em",
          zIndex: 10,
          animation: "fade-in 0.5s ease, win-glow 1.5s ease infinite",
        }}>
          {winner === "DRAW" ? "DRAW!" : `${winner} WINS!`}
        </div>
      )}

      {/* Buttons */}
      <div style={{
        marginTop: 22,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
        zIndex: 10,
      }}>
        <ChunkyButton onClick={nextRound} bg="#ffd166" color="#1a1a2e">
          <Sparkles size={18} strokeWidth={3} /> NEXT ROUND
        </ChunkyButton>
        <ChunkyButton onClick={newGame} bg="white" color="#1a1a2e">
          <RotateCcw size={18} strokeWidth={3} /> NEW GAME
        </ChunkyButton>
        <ChunkyButton onClick={() => { sfx.click(); setSoundOn((s) => !s); }} bg="white" color="#1a1a2e" iconOnly>
          {soundOn ? <Volume2 size={22} strokeWidth={3} /> : <VolumeX size={22} strokeWidth={3} />}
        </ChunkyButton>
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: 20,
        background: "rgba(26,26,46,0.85)",
        color: "white",
        padding: "10px 18px",
        borderRadius: 999,
        fontSize: "0.78rem",
        fontWeight: 700,
        textAlign: "center",
        maxWidth: "92vw",
        zIndex: 10,
      }}>
        Draws: <strong style={{ color: "#ffd166" }}>{scores.draws}</strong> · Tap your <strong style={{ color: "#ff7a45" }}>BOMB</strong> to clear an enemy square (once per round)
      </footer>
    </div>
  );
}

// ---------- Player Panel ----------
function PlayerPanel({ player, score, streak, active, bombUsed, bombArmed, onBomb, canBomb }) {
  const isX = player === "X";
  const gradient = isX
    ? "linear-gradient(135deg, #ff3b6b, #ff7a45)"
    : "linear-gradient(135deg, #22c1f0, #16d1b7)";

  return (
    <div style={{
      background: gradient,
      border: "4px solid #1a1a2e",
      borderRadius: 18,
      padding: 12,
      boxShadow: active ? "0 8px 0 #1a1a2e, 0 0 0 4px #ffd166" : "0 6px 0 #1a1a2e",
      transform: active ? "translateY(-2px)" : "translateY(0)",
      transition: "transform 0.2s, box-shadow 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{
            fontSize: "2rem",
            fontWeight: 900,
            color: "white",
            lineHeight: 1,
            textShadow: "-2px -2px 0 #1a1a2e, 2px -2px 0 #1a1a2e, -2px 2px 0 #1a1a2e, 2px 2px 0 #1a1a2e",
          }}>
            {player}
          </div>
          <div style={{ color: "white", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "0.1em", marginTop: 4, opacity: 0.95 }}>
            PLAYER {player}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            color: "white",
            fontSize: "1.8rem",
            fontWeight: 900,
            lineHeight: 1,
            textShadow: "0 2px 0 rgba(0,0,0,0.3)",
          }}>
            {score}
          </div>
          {streak > 1 && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              background: "#1a1a2e",
              color: "#ffd166",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: "0.7rem",
              fontWeight: 900,
              marginTop: 4,
            }}>
              <Flame size={12} strokeWidth={3} /> {streak}
            </div>
          )}
        </div>
      </div>

      {/* Bomb button */}
      <button
        onClick={onBomb}
        disabled={!canBomb || bombUsed}
        className="chunky-press"
        style={{
          marginTop: 10,
          width: "100%",
          background: bombUsed ? "#475569" : bombArmed ? "#ff3b6b" : "#1a1a2e",
          color: bombUsed ? "#94a3b8" : "white",
          border: "3px solid #1a1a2e",
          borderRadius: 12,
          padding: "8px 12px",
          fontWeight: 900,
          fontSize: "0.85rem",
          letterSpacing: "0.1em",
          cursor: !canBomb || bombUsed ? "not-allowed" : "pointer",
          boxShadow: "0 4px 0 #1a1a2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: !canBomb && !bombArmed ? 0.6 : 1,
          animation: bombArmed ? "fuse 0.6s ease infinite, pulse-bomb 0.6s ease infinite" : "none",
          fontFamily: "inherit",
        }}
      >
        <Bomb size={16} strokeWidth={3} />
        {bombUsed ? "USED" : bombArmed ? "ARMED!" : "BOMB!"}
      </button>
    </div>
  );
}

// ---------- Cell ----------
function Cell({ value, isWinning, isExploding, bombArmed, currentPlayer, disabled, onClick }) {
  const isBombTarget = bombArmed && value && value !== currentPlayer;
  const canTap = !disabled && (bombArmed ? value != null : value == null);

  return (
    <button
      onClick={onClick}
      disabled={!canTap}
      style={{
        background: isWinning
          ? "#ffd166"
          : isBombTarget
          ? "rgba(255,59,107,0.2)"
          : "#fef3c7",
        border: "4px solid #1a1a2e",
        borderRadius: 14,
        cursor: canTap ? "pointer" : "default",
        boxShadow: isWinning ? "0 4px 0 #1a1a2e, 0 0 30px #ffd166" : "0 4px 0 #1a1a2e",
        transition: "background 0.2s, transform 0.1s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: 0,
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseDown={(e) => { if (canTap) e.currentTarget.style.transform = "translateY(2px)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {value && !isExploding && (
        <Mark value={value} animate />
      )}
      {isExploding && (
        <>
          <div style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "radial-gradient(circle, #ffd166, #ff7a45, #ff3b6b)",
            borderRadius: "50%",
            animation: "explode 0.55s ease-out forwards",
          }} />
          <div style={{ position: "absolute", fontSize: "2.5rem" }}>💥</div>
        </>
      )}
    </button>
  );
}

function Mark({ value, animate }) {
  const isX = value === "X";
  return (
    <div style={{
      fontSize: "clamp(2.5rem, 11vw, 4rem)",
      fontWeight: 900,
      lineHeight: 1,
      color: isX ? "#ff3b6b" : "#22c1f0",
      textShadow: isX
        ? "-3px -3px 0 #1a1a2e, 3px -3px 0 #1a1a2e, -3px 3px 0 #1a1a2e, 3px 3px 0 #1a1a2e, 0 5px 0 #1a1a2e"
        : "-3px -3px 0 #1a1a2e, 3px -3px 0 #1a1a2e, -3px 3px 0 #1a1a2e, 3px 3px 0 #1a1a2e, 0 5px 0 #1a1a2e",
      animation: animate ? "pop 0.4s ease" : "none",
      userSelect: "none",
    }}>
      {value}
    </div>
  );
}

// ---------- Chunky Button ----------
function ChunkyButton({ children, onClick, bg, color, iconOnly }) {
  return (
    <button
      onClick={onClick}
      className="chunky-press"
      style={{
        background: bg,
        color: color,
        border: "4px solid #1a1a2e",
        borderRadius: 16,
        boxShadow: "0 6px 0 #1a1a2e",
        padding: iconOnly ? "12px" : "12px 20px",
        fontWeight: 900,
        fontSize: "0.95rem",
        letterSpacing: "0.08em",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "inherit",
        minWidth: iconOnly ? "auto" : "auto",
      }}
    >
      {children}
    </button>
  );
}
