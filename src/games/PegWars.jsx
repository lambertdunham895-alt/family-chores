// Peg Wars — 2-player triangle peg battle with bombs, rockets, multipliers,
// freeze tiles, and power-ups. Self-contained: game logic, sound effects,
// and UI all in one file. No external libraries beyond React.

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* ============================================================
   GAME RULES & CONSTANTS
   ============================================================ */
const TOTAL_HOLES = 15; // 5-row triangle: 1+2+3+4+5
const SUDDEN_DEATH_THRESHOLD = 5;
const METER_MAX = 10;
const STORAGE_KEY = "peg_wars_totals_v1";

const PLAYER_COLORS = ["#ff5252", "#1abc9c"]; // P1 bright red, P2 teal — matching cartoon style
const PLAYER_GLOWS = ["#ffcdd2", "#a8e6cf"];   // soft glow versions
const PLAYER_NAMES = ["Player 1", "Player 2"];

const SPECIAL_EMOJI = { bomb: "💣", rocket: "🚀", multiplier: "✨", freeze: "❄️" };
const SPECIAL_LABEL = { bomb: "Bomb", rocket: "Rocket", multiplier: "x2 Score", freeze: "Freeze" };
const POWERUP_EMOJI = { remove: "⚡", blocker: "🛡️", steal: "💰", extra: "🔁" };
const POWERUP_LABEL = { remove: "Zap Peg", blocker: "Blocker", steal: "Steal 3", extra: "Extra Turn" };

// Triangle coordinate helpers
function rcToIdx(r, c) { return (r * (r + 1)) / 2 + c; }
function idxToRc(i) {
  let r = 0;
  while ((r + 1) * (r + 2) / 2 <= i) r++;
  return [r, i - (r * (r + 1)) / 2];
}
const DIRS = [[0,-1],[0,1],[-1,-1],[-1,0],[1,0],[1,1]];
const inBounds = (r, c) => r >= 0 && r < 5 && c >= 0 && c <= r;

function legalJumpsFrom(pegs, blockers, from) {
  if (!pegs[from]) return [];
  const blockerSet = new Set(blockers.map((b) => b.idx));
  const [r, c] = idxToRc(from);
  const moves = [];
  for (const [dr, dc] of DIRS) {
    const mr = r + dr, mc = c + dc;
    const tr = r + 2*dr, tc = c + 2*dc;
    if (!inBounds(mr, mc) || !inBounds(tr, tc)) continue;
    const over = rcToIdx(mr, mc);
    const to = rcToIdx(tr, tc);
    if (pegs[over] && !pegs[to] && !blockerSet.has(to)) {
      moves.push({ from, over, to });
    }
  }
  return moves;
}

function allLegalMoves(pegs, blockers) {
  const moves = [];
  for (let i = 0; i < TOTAL_HOLES; i++) if (pegs[i]) moves.push(...legalJumpsFrom(pegs, blockers, i));
  return moves;
}

function countPegs(pegs) { return pegs.reduce((a, b) => a + (b ? 1 : 0), 0); }

function makeInitialPegs() {
  const pegs = new Array(TOTAL_HOLES).fill(true);
  pegs[Math.floor(Math.random() * TOTAL_HOLES)] = false;
  return pegs;
}

function makeSpecials() {
  const kinds = ["bomb", "rocket", "multiplier", "freeze"];
  const out = {};
  const count = 3 + Math.floor(Math.random() * 2);
  while (Object.keys(out).length < count) {
    const idx = Math.floor(Math.random() * TOTAL_HOLES);
    if (out[idx] !== undefined) continue;
    out[idx] = kinds[Math.floor(Math.random() * kinds.length)];
  }
  return out;
}

function adjacentHoles(idx) {
  const [r, c] = idxToRc(idx);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) out.push(rcToIdx(nr, nc));
  }
  return out;
}

function holePosition(idx) {
  const [r, c] = idxToRc(idx);
  const y = 14 + (r / 4) * 72;
  const spacing = 15;
  const startX = 50 - (r * spacing) / 2;
  return { x: startX + c * spacing, y };
}

/* ============================================================
   SOUND EFFECTS (Web Audio, no external library)
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
  jump: () => tone(520, 0.12, "triangle", 0.18, 880),
  pop: () => tone(680, 0.1, "square", 0.15, 320),
  bomb: () => { noise(0.4, 0.35); tone(120, 0.4, "sawtooth", 0.2, 40); },
  rocket: () => tone(300, 0.35, "sawtooth", 0.18, 1600),
  multiplier: () => { tone(660, 0.1, "sine", 0.15, 880); setTimeout(() => tone(990, 0.15, "sine", 0.15, 1320), 80); },
  freeze: () => tone(1200, 0.3, "sine", 0.12, 220),
  power: () => { tone(440, 0.08, "square", 0.15, 660); setTimeout(() => tone(880, 0.12, "square", 0.15, 1320), 70); },
  click: () => tone(420, 0.05, "square", 0.1),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.2), i * 120)); },
  combo: (n) => tone(440 + n * 120, 0.12, "triangle", 0.18, 800 + n * 100),
};

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function PegWars() {
  // Core game state
  const [pegs, setPegs] = useState(() => makeInitialPegs());
  const [blockers, setBlockers] = useState([]); // [{ idx, expires }]
  const [specials, setSpecials] = useState(() => makeSpecials());
  const [scores, setScores] = useState([0, 0]);
  const [meters, setMeters] = useState([0, 0]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [pendingMultiplier, setPendingMultiplier] = useState([false, false]);
  const [freezeOpponent, setFreezeOpponent] = useState([false, false]);
  const [extraTurn, setExtraTurn] = useState([false, false]);
  const [mode, setMode] = useState("normal"); // normal | remove | blocker | rocket
  const [rocketPeg, setRocketPeg] = useState(null); // peg ready to launch
  const [floaters, setFloaters] = useState([]);
  const [comboStreak, setComboStreak] = useState(0);
  const [turn, setTurn] = useState(0);
  const [winner, setWinner] = useState(null); // null | "p1" | "p2" | "tie"
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [powerPickerOpen, setPowerPickerOpen] = useState(false);
  const [totals, setTotals] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const fId = useRef(1);

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

  const pegsLeft = useMemo(() => countPegs(pegs), [pegs]);
  const suddenDeath = pegsLeft <= SUDDEN_DEATH_THRESHOLD;

  // Floater helper for "+3" etc. floating text
  const addFloater = (idx, text, color) => {
    const { x, y } = holePosition(idx);
    const id = fId.current++;
    setFloaters((f) => [...f, { id, x, y, text, color }]);
    setTimeout(() => setFloaters((f) => f.filter((fl) => fl.id !== id)), 1100);
  };

  // Game end check
  useEffect(() => {
    if (winner) return;
    const legal = allLegalMoves(pegs, blockers);
    if (legal.length === 0 || pegsLeft <= 1) {
      let w;
      if (scores[0] > scores[1]) w = "p1";
      else if (scores[1] > scores[0]) w = "p2";
      else w = "tie";
      setWinner(w);
      sfx.win();
      // Update lifetime totals
      if (w === "p1" || w === "p2") {
        const newTotals = [...totals];
        newTotals[w === "p1" ? 0 : 1] += 1;
        setTotals(newTotals);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newTotals)); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pegs, blockers, pegsLeft, winner]);

  // Decay blockers each turn
  useEffect(() => {
    setBlockers((bs) => bs.filter((b) => b.expires > turn));
  }, [turn]);

  // ---------- ACTIONS ----------

  const handleHoleClick = (idx) => {
    if (winner) return;
    sfx.click();
    const blockerSet = new Set(blockers.map((b) => b.idx));

    // POWER-UP: Remove a peg
    if (mode === "remove") {
      if (!pegs[idx]) return;
      const np = [...pegs]; np[idx] = false;
      setPegs(np);
      sfx.pop();
      addFloater(idx, "Zap!", "#facc15");
      setMode("normal");
      endTurn();
      return;
    }

    // POWER-UP: Place blocker
    if (mode === "blocker") {
      if (pegs[idx] || blockerSet.has(idx)) return;
      setBlockers((bs) => [...bs, { idx, expires: turn + 4 }]);
      sfx.power();
      addFloater(idx, "Blocked", "#a78bfa");
      setMode("normal");
      endTurn();
      return;
    }

    // ROCKET MODE: launch the rocket-marked peg to any empty hole
    if (mode === "rocket" && rocketPeg !== null) {
      if (pegs[idx] || blockerSet.has(idx)) return;
      if (idx === rocketPeg) {
        setMode("normal");
        setRocketPeg(null);
        setSelected(null);
        endTurn();
        return;
      }
      sfx.rocket();
      const np = [...pegs];
      np[rocketPeg] = false;
      np[idx] = true;
      const landSpecial = specials[idx];
      let bonus = 2;
      const newSpecials = { ...specials };
      if (landSpecial === "bomb") {
        sfx.bomb();
        const adj = adjacentHoles(idx);
        let kills = 0;
        for (const a of adj) if (np[a]) { np[a] = false; kills++; }
        bonus += kills * 2;
        addFloater(idx, `🚀 BOMB! +${bonus}`, "#f97316");
        delete newSpecials[idx];
      } else if (landSpecial === "multiplier") {
        sfx.multiplier();
        const npm = [...pendingMultiplier]; npm[current] = true; setPendingMultiplier(npm);
        addFloater(idx, `🚀 +${bonus}, x2 next!`, "#a78bfa");
        delete newSpecials[idx];
      } else if (landSpecial === "freeze") {
        sfx.freeze();
        const nf = [...freezeOpponent]; nf[1 - current] = true; setFreezeOpponent(nf);
        addFloater(idx, `🚀 Freeze!`, "#60a5fa");
        delete newSpecials[idx];
      } else {
        addFloater(idx, `🚀 +${bonus}`, "#f43f5e");
      }
      if (suddenDeath) bonus *= 2;
      const ns = [...scores]; ns[current] += bonus; setScores(ns);
      setPegs(np);
      setSpecials(newSpecials);
      setRocketPeg(null);
      setMode("normal");
      setSelected(null);
      setTimeout(() => endTurn(), 200);
      return;
    }

    // NORMAL MOVE
    if (selected === null) {
      if (pegs[idx]) {
        const moves = legalJumpsFrom(pegs, blockers, idx);
        if (moves.length > 0) setSelected(idx);
      }
      return;
    }

    if (idx === selected) { setSelected(null); return; }

    const moves = legalJumpsFrom(pegs, blockers, selected);
    const move = moves.find((m) => m.to === idx);
    if (!move) {
      // tap another peg to switch selection
      if (pegs[idx]) {
        const newMoves = legalJumpsFrom(pegs, blockers, idx);
        if (newMoves.length > 0) setSelected(idx);
      }
      return;
    }
    executeMove(move);
  };

  const executeMove = (move) => {
    sfx.jump();
    const np = [...pegs];
    np[move.from] = false;
    np[move.over] = false;
    np[move.to] = true;

    const player = current;
    let basePoints = 1;
    let triggeredRocket = false;
    const newSpecials = { ...specials };

    // Check landing special
    const landSpecial = specials[move.to];
    if (landSpecial) {
      if (landSpecial === "bomb") {
        sfx.bomb();
        const adj = adjacentHoles(move.to);
        let bombKills = 0;
        for (const a of adj) {
          if (np[a]) { np[a] = false; bombKills++; }
        }
        basePoints += bombKills * 2;
        addFloater(move.to, `BOMB! +${bombKills * 2}`, "#f97316");
        delete newSpecials[move.to];
      } else if (landSpecial === "multiplier") {
        sfx.multiplier();
        addFloater(move.to, "x2 next!", "#a78bfa");
        const np2 = [...pendingMultiplier]; np2[player] = true; setPendingMultiplier(np2);
        delete newSpecials[move.to];
      } else if (landSpecial === "freeze") {
        sfx.freeze();
        addFloater(move.to, "Freeze!", "#60a5fa");
        const nf = [...freezeOpponent]; nf[1 - player] = true; setFreezeOpponent(nf);
        delete newSpecials[move.to];
      } else if (landSpecial === "rocket") {
        sfx.rocket();
        addFloater(move.to, "🚀 Launch!", "#f43f5e");
        delete newSpecials[move.to];
        triggeredRocket = true;
        setTimeout(() => {
          setRocketPeg(move.to);
          setMode("rocket");
          setSelected(move.to);
        }, 250);
      }
    }

    // Special on the jumped-over peg
    const overSpecial = specials[move.over];
    if (overSpecial === "bomb") {
      sfx.bomb();
      const adj = adjacentHoles(move.over);
      let bombKills = 0;
      for (const a of adj) {
        if (np[a]) { np[a] = false; bombKills++; }
      }
      basePoints += bombKills * 2;
      addFloater(move.over, `BOMB! +${bombKills * 2}`, "#f97316");
      delete newSpecials[move.over];
    }

    // Apply multiplier if pending
    let finalPoints = basePoints;
    if (pendingMultiplier[player]) {
      finalPoints *= 2;
      const np2 = [...pendingMultiplier]; np2[player] = false; setPendingMultiplier(np2);
    }

    // Combo bonus (chain of consecutive moves)
    let newStreak = comboStreak + 1;
    if (newStreak >= 2) {
      finalPoints += newStreak - 1;
      sfx.combo(newStreak);
      addFloater(move.to, `Combo x${newStreak}!`, "#fbbf24");
    } else {
      addFloater(move.to, `+${finalPoints}`, PLAYER_COLORS[player]);
    }
    setComboStreak(newStreak);

    // Sudden death doubles all scoring
    if (suddenDeath) finalPoints *= 2;

    // Award score
    const ns = [...scores]; ns[player] += finalPoints; setScores(ns);

    // Fill meter
    const nm = [...meters]; nm[player] = Math.min(METER_MAX, nm[player] + 1); setMeters(nm);

    // Apply state
    setPegs(np);
    setSpecials(newSpecials);
    setSelected(null);
    setTurn((t) => t + 1);

    // Rocket triggered? Don't end turn — let player pick destination
    if (triggeredRocket) return;

    // Handle extra turn / freeze / normal turn change
    setTimeout(() => {
      if (extraTurn[player]) {
        const ne = [...extraTurn]; ne[player] = false; setExtraTurn(ne);
        addFloater(move.to, "Extra turn!", "#34d399");
        // stay on same player
      } else {
        endTurn();
      }
    }, 200);
  };

  const endTurn = () => {
    setComboStreak(0);
    setCurrent((cur) => {
      const next = (1 - cur);
      // If opponent is frozen, skip them
      if (freezeOpponent[next]) {
        const nf = [...freezeOpponent]; nf[next] = false; setFreezeOpponent(nf);
        addFloater(0, `${PLAYER_NAMES[next]} frozen!`, "#60a5fa");
        return cur; // stay
      }
      return next;
    });
  };

  const usePower = (power) => {
    if (meters[current] < METER_MAX) return;
    sfx.power();
    const nm = [...meters]; nm[current] = 0; setMeters(nm);
    setPowerPickerOpen(false);
    if (power === "remove") setMode("remove");
    else if (power === "blocker") setMode("blocker");
    else if (power === "steal") {
      const ns = [...scores];
      const grab = Math.min(3, ns[1 - current]);
      ns[1 - current] -= grab;
      ns[current] += grab;
      setScores(ns);
      addFloater(0, `Stole ${grab}!`, "#fbbf24");
      endTurn();
    } else if (power === "extra") {
      const ne = [...extraTurn]; ne[current] = true; setExtraTurn(ne);
      addFloater(0, "Extra turn ready!", "#34d399");
      endTurn();
    }
  };

  const nextRound = () => {
    setPegs(makeInitialPegs());
    setBlockers([]);
    setSpecials(makeSpecials());
    setScores([0, 0]);
    setMeters([0, 0]);
    setCurrent(0);
    setSelected(null);
    setPendingMultiplier([false, false]);
    setFreezeOpponent([false, false]);
    setExtraTurn([false, false]);
    setMode("normal");
    setRocketPeg(null);
    setFloaters([]);
    setComboStreak(0);
    setTurn(0);
    setWinner(null);
    setRound((r) => r + 1);
  };

  const resetTotals = () => {
    if (!confirm("Reset all-time scores?")) return;
    setTotals([0, 0]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  /* ============================================================
     RENDER
     ============================================================ */
  const blockerSet = new Set(blockers.map((b) => b.idx));
  let validTargets;
  if (mode === "rocket" && rocketPeg !== null) {
    validTargets = new Set();
    for (let i = 0; i < TOTAL_HOLES; i++) {
      if (!pegs[i] && !blockerSet.has(i)) validTargets.add(i);
    }
  } else if (selected !== null) {
    validTargets = new Set(legalJumpsFrom(pegs, blockers, selected).map((m) => m.to));
  } else {
    validTargets = new Set();
  }

  return (
    <div style={S.app}>
      {/* Floating clouds in background */}
      <div style={S.cloudsLayer} aria-hidden>
        <div style={{ ...S.cloud, top: "8%", left: "10%", animationDelay: "0s" }}>☁️</div>
        <div style={{ ...S.cloud, top: "22%", right: "12%", animationDelay: "-8s", fontSize: 28 }}>☁️</div>
        <div style={{ ...S.cloud, top: "55%", left: "6%", animationDelay: "-3s", fontSize: 24 }}>☁️</div>
        <div style={{ ...S.cloud, top: "72%", right: "8%", animationDelay: "-12s" }}>☁️</div>
      </div>

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.titleBig}>
          <span style={{ ...S.titleWord, color: "#fbbf24" }}>PEG</span>{" "}
          <span style={{ ...S.titleWord, color: "#fff" }}>WARS</span>
        </h1>
        <div style={S.subheader}>
          ROUND <span style={S.roundBadge}>{round}</span> · 2-PLAYER BATTLE
        </div>
        <div style={S.headerBtns}>
          <button style={S.iconBtn} onClick={() => setSoundOn((s) => !s)} title="Sound">
            {soundOn ? "🔊" : "🔇"}
          </button>
          <button style={S.iconBtn} onClick={() => setTutorialOpen(true)} title="How to play">❓</button>
          <button style={S.iconBtn} onClick={nextRound} title="New round">↻</button>
        </div>
        {suddenDeath && !winner && (
          <div style={S.suddenDeath}>⚠️ SUDDEN DEATH — ALL SCORING DOUBLED!</div>
        )}
      </div>

      {/* Scoreboards (gradient cards) */}
      <div style={S.scoreRow}>
        {[0, 1].map((p) => {
          const isP1 = p === 0;
          const gradient = isP1
            ? "linear-gradient(135deg,#ff6b6b 0%,#feca57 100%)"  // red→orange for Player 1
            : "linear-gradient(135deg,#26d0ce 0%,#1abc9c 100%)"; // teal for Player 2
          const isActive = current === p && !winner;
          const meterPct = (meters[p] / METER_MAX) * 100;
          const powerReady = meters[p] >= METER_MAX;
          return (
            <div key={p} style={{
              ...S.scoreCard,
              background: gradient,
              ...(isActive ? S.scoreCardActive : { opacity: 0.85 }),
            }}>
              <div style={S.scoreCardTop}>
                <div style={S.scoreBigLetter}>{isP1 ? "1" : "2"}</div>
                <div style={S.scoreBigNum}>{scores[p]}</div>
              </div>
              <div style={S.scoreCardName}>{PLAYER_NAMES[p]}</div>
              <button
                style={{
                  ...S.scoreCardBtn,
                  ...(powerReady && isActive ? S.scoreCardBtnReady : {}),
                  cursor: powerReady && isActive ? "pointer" : "default",
                }}
                onClick={() => powerReady && isActive && setPowerPickerOpen(true)}
                disabled={!powerReady || !isActive}
              >
                {powerReady ? "⚡ POWER!" : `⚡ ${meters[p]}/${METER_MAX}`}
              </button>
              <div style={S.miniMeter}>
                <div style={{ ...S.miniMeterFill, width: `${meterPct}%` }} />
              </div>
              <div style={S.statusRow}>
                {pendingMultiplier[p] && <span style={S.statusChip}>✨ x2</span>}
                {freezeOpponent[1 - p] && <span style={S.statusChip}>❄️</span>}
                {extraTurn[p] && <span style={S.statusChip}>🔁</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Turn indicator pill */}
      {!winner && (
        <div style={S.turnPillWrap}>
          <div style={S.turnPill}>
            {mode === "rocket" ? "🚀 ROCKET MODE — PICK A HOLE!" :
             mode === "remove" ? "⚡ ZAP A PEG" :
             mode === "blocker" ? "🛡️ PLACE A BLOCKER" :
             `${PLAYER_NAMES[current].toUpperCase()}'S TURN`}
          </div>
          {(mode === "remove" || mode === "blocker") && (
            <button style={S.cancelModeBtn} onClick={() => setMode("normal")}>Cancel</button>
          )}
        </div>
      )}

      {/* Board */}
      <div style={S.boardWrap}>
        <div style={S.board}>
          {/* Pegs and holes */}
          {Array.from({ length: TOTAL_HOLES }, (_, idx) => {
            const { x, y } = holePosition(idx);
            const hasPeg = pegs[idx];
            const isBlocker = blockerSet.has(idx);
            const isSel = selected === idx;
            const isTarget = validTargets.has(idx);
            const special = specials[idx];
            // Specials are HIDDEN under pegs — only visible when the hole is empty
            const showSpecial = special && !hasPeg && !isBlocker;
            return (
              <div
                key={idx}
                style={{
                  ...S.holeWrap,
                  left: `${x}%`,
                  top: `${y}%`,
                }}
                onClick={() => handleHoleClick(idx)}
              >
                {/* Hole base */}
                <div style={{
                  ...S.hole,
                  ...(isTarget ? S.holeTarget : {}),
                }}>
                  {showSpecial && <span style={S.specialIcon}>{SPECIAL_EMOJI[special]}</span>}
                  {isBlocker && <span style={S.blocker}>🛡️</span>}
                </div>
                {/* Peg on top (specials underneath stay hidden) */}
                {hasPeg && (
                  <div style={{
                    ...S.peg,
                    ...(isSel ? S.pegSelected : {}),
                    background: PLAYER_COLORS[current],
                  }} />
                )}
              </div>
            );
          })}

          {/* Floating score text */}
          {floaters.map((f) => (
            <div key={f.id} style={{
              ...S.floater,
              left: `${f.x}%`,
              top: `${f.y}%`,
              color: f.color,
            }}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div style={S.footer}>
        <span>Pegs left: <strong>{pegsLeft}</strong></span>
        <span>Round: <strong>{round}</strong></span>
        <span>All-time: <strong style={{ color: PLAYER_COLORS[0] }}>{totals[0]}</strong> – <strong style={{ color: PLAYER_COLORS[1] }}>{totals[1]}</strong></span>
        <button style={S.resetBtn} onClick={resetTotals}>Reset</button>
      </div>

      {/* Power picker modal */}
      {powerPickerOpen && (
        <div style={S.modalOverlay} onClick={() => setPowerPickerOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalTitle}>Pick a Power-Up</h2>
            <div style={S.powerGrid}>
              {Object.keys(POWERUP_LABEL).map((p) => (
                <button key={p} style={S.powerBtn} onClick={() => usePower(p)}>
                  <span style={{ fontSize: 36 }}>{POWERUP_EMOJI[p]}</span>
                  <span style={S.powerName}>{POWERUP_LABEL[p]}</span>
                </button>
              ))}
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
              <li><strong>Jump over a peg</strong> into an empty hole to capture it. +1 point per jump.</li>
              <li><strong>💣 Bomb:</strong> Land on or jump over to explode adjacent pegs (+2 each)</li>
              <li><strong>🚀 Rocket:</strong> Land here, then launch your peg to ANY empty hole (+2 bonus)</li>
              <li><strong>✨ Multiplier:</strong> Land here, then your next move scores x2</li>
              <li><strong>❄️ Freeze:</strong> Land here to skip your opponent's next turn</li>
              <li><strong>Specials are hidden</strong> — you'll discover them when a peg moves off a hole!</li>
              <li><strong>Combos:</strong> Multiple moves in a row chain bonus points</li>
              <li><strong>Power meter:</strong> Fills with each move. At full, tap to choose a power-up.</li>
              <li><strong>Sudden Death:</strong> When 5 pegs or fewer remain, all scoring doubles!</li>
              <li><strong>Game ends</strong> when no more jumps are possible. Most points wins!</li>
            </ul>
            <button style={S.modalCloseBtn} onClick={() => setTutorialOpen(false)}>Got it!</button>
          </div>
        </div>
      )}

      {/* Winner modal */}
      {winner && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <h2 style={{ ...S.modalTitle, fontSize: 28 }}>
              {winner === "tie" ? "🤝 It's a tie!" : `🏆 ${PLAYER_NAMES[winner === "p1" ? 0 : 1]} wins!`}
            </h2>
            <div style={S.winScores}>
              <div style={{ color: PLAYER_COLORS[0], fontWeight: 700, fontSize: 24 }}>{PLAYER_NAMES[0]}: {scores[0]}</div>
              <div style={{ color: PLAYER_COLORS[1], fontWeight: 700, fontSize: 24 }}>{PLAYER_NAMES[1]}: {scores[1]}</div>
            </div>
            <button style={{ ...S.modalCloseBtn, background: "#3d7a4e", color: "#fff" }} onClick={nextRound}>
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
  // Floating clouds
  cloudsLayer: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" },
  cloud: { position: "absolute", fontSize: 32, opacity: 0.85, animation: "cloudfloat 24s linear infinite" },

  // Header
  header: { position: "relative", zIndex: 2, textAlign: "center", marginBottom: 14 },
  titleBig: {
    margin: 0, fontSize: 44, fontWeight: 900, letterSpacing: 1,
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
  suddenDeath: {
    background: "#fff3cd", border: "3px solid #1a2b3c", borderRadius: 12,
    padding: "8px 12px", fontSize: 13, fontWeight: 900, color: "#1a2b3c",
    textAlign: "center", marginTop: 12,
    boxShadow: "0 3px 0 #1a2b3c",
  },

  // Scoreboards (gradient cards)
  scoreRow: { position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  scoreCard: {
    border: "3px solid #1a2b3c", borderRadius: 16, padding: 12,
    boxShadow: "0 4px 0 #1a2b3c", transition: "transform 0.15s",
    position: "relative",
  },
  scoreCardActive: { transform: "translateY(-3px)", boxShadow: "0 7px 0 #1a2b3c" },
  scoreCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  scoreBigLetter: {
    fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1,
    textShadow: "2px 2px 0 #1a2b3c",
  },
  scoreBigNum: {
    fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1,
    textShadow: "2px 2px 0 #1a2b3c",
  },
  scoreCardName: {
    fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.95)",
    textTransform: "uppercase", letterSpacing: 1, marginTop: 4, marginBottom: 8,
    textShadow: "1px 1px 0 rgba(0,0,0,0.3)",
  },
  scoreCardBtn: {
    width: "100%", background: "#1a2b3c", color: "#fff",
    border: "none", borderRadius: 8, padding: "8px 0",
    fontSize: 13, fontWeight: 900, letterSpacing: 0.5,
  },
  scoreCardBtnReady: {
    background: "#fbbf24", color: "#1a2b3c",
    animation: "pulseready 1.2s ease-in-out infinite",
  },
  miniMeter: { background: "rgba(0,0,0,0.2)", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 6 },
  miniMeterFill: { height: "100%", background: "#fff", borderRadius: 2, transition: "width 0.3s" },
  statusRow: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, minHeight: 18 },
  statusChip: {
    fontSize: 11, background: "rgba(0,0,0,0.25)", color: "#fff",
    padding: "2px 6px", borderRadius: 8, fontWeight: 700,
  },

  // Turn pill
  turnPillWrap: { position: "relative", zIndex: 2, textAlign: "center", marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  turnPill: {
    display: "inline-block",
    background: "#fff", border: "3px solid #1a2b3c", borderRadius: 30,
    padding: "8px 22px", fontWeight: 900, fontSize: 14, color: "#1a2b3c",
    letterSpacing: 1, boxShadow: "0 3px 0 #1a2b3c",
  },
  cancelModeBtn: {
    background: "#fff", border: "2px solid #1a2b3c", borderRadius: 8,
    padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 2px 0 #1a2b3c",
  },

  // Board
  boardWrap: { position: "relative", zIndex: 2, width: "100%", maxWidth: 480, margin: "0 auto", marginBottom: 14 },
  board: {
    position: "relative", width: "100%", paddingBottom: "100%",
    background: "linear-gradient(135deg, #fef5e7 0%, #fde9c1 100%)",
    borderRadius: 18, overflow: "hidden",
    border: "4px solid #1a2b3c",
    boxShadow: "0 5px 0 #1a2b3c, inset 0 2px 8px rgba(0,0,0,0.08)",
  },
  holeWrap: { position: "absolute", width: "13%", height: "13%", transform: "translate(-50%,-50%)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  hole: {
    width: "100%", height: "100%", borderRadius: "50%",
    background: "rgba(255,255,255,0.7)",
    border: "3px solid #1a2b3c",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
  },
  holeTarget: {
    background: "rgba(255,213,107,0.85)",
    border: "3px solid #1a2b3c",
    boxShadow: "0 0 0 3px #fbbf24, inset 0 2px 4px rgba(0,0,0,0.15)",
    animation: "targetpulse 1s ease-in-out infinite",
  },
  specialIcon: { fontSize: 18 },
  blocker: { fontSize: 20 },
  peg: {
    position: "absolute", inset: "10%", borderRadius: "50%",
    border: "2.5px solid #1a2b3c",
    boxShadow: "0 4px 0 #1a2b3c, inset 0 -3px 5px rgba(0,0,0,0.25), inset 0 3px 4px rgba(255,255,255,0.4)",
    transition: "transform 0.15s",
  },
  pegSelected: {
    transform: "scale(1.18)",
    boxShadow: "0 0 0 4px #fbbf24, 0 5px 0 #1a2b3c",
  },
  floater: {
    position: "absolute", transform: "translate(-50%,-50%)",
    fontSize: 18, fontWeight: 900, pointerEvents: "none",
    animation: "pegfloat 1.1s ease-out forwards",
    textShadow: "2px 2px 0 #1a2b3c",
    WebkitTextStroke: "0.5px #1a2b3c",
  },

  // Footer
  footer: {
    position: "relative", zIndex: 2,
    display: "flex", justifyContent: "space-around", alignItems: "center",
    fontSize: 12, color: "#1a2b3c", padding: "10px 6px",
    background: "#fff", borderRadius: 14, border: "3px solid #1a2b3c",
    boxShadow: "0 3px 0 #1a2b3c", fontWeight: 700,
  },
  resetBtn: {
    background: "#fff", border: "2px solid #1a2b3c", borderRadius: 6,
    padding: "3px 10px", fontSize: 11, color: "#1a2b3c", cursor: "pointer",
    fontWeight: 700,
  },

  // Modals
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(26,43,60,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: {
    background: "#fff", borderRadius: 20, padding: 24,
    maxWidth: 440, width: "100%",
    border: "4px solid #1a2b3c",
    boxShadow: "0 8px 0 #1a2b3c",
  },
  modalTitle: { color: "#1a2b3c", margin: "0 0 16px", fontSize: 24, textAlign: "center", fontWeight: 900 },
  powerGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  powerBtn: {
    background: "#fff", border: "3px solid #1a2b3c", borderRadius: 14,
    padding: "16px 10px", display: "flex", flexDirection: "column",
    alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 800,
    boxShadow: "0 4px 0 #1a2b3c",
  },
  powerName: { fontSize: 13, color: "#1a2b3c" },
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
  const styleId = "pegwars-keyframes";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `
      @keyframes pegfloat {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        15% { opacity: 1; transform: translate(-50%, -90%) scale(1.15); }
        100% { opacity: 0; transform: translate(-50%, -200%) scale(1); }
      }
      @keyframes cloudfloat {
        0% { transform: translateX(0); }
        50% { transform: translateX(20px); }
        100% { transform: translateX(0); }
      }
      @keyframes pulseready {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes targetpulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
    `;
    document.head.appendChild(s);
  }
}
