import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   STEP 1 — PASTE YOUR SUPABASE CREDENTIALS HERE
   Get these from your new Supabase project:
   Project Settings > Data API (URL) and API Keys (anon/public key)
   ============================================================ */
const SUPABASE_URL = "YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY_HERE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   PROFILES — rename these to your real names anytime.
   "kid" flag drives the gamified view + filtered chores.
   ============================================================ */
const PROFILES = [
  { id: "adult_a", name: "Adult A", emoji: "🧑", color: "#2c5f7c" },
  { id: "adult_b", name: "Adult B", emoji: "👩", color: "#3d7a4e" },
  { id: "kid", name: "Kid", emoji: "🧒", color: "#9c5a2c", isKid: true },
];

/* ============================================================
   CHORE DEFINITIONS
   freq: "daily" | "weekly" | "monthly"
   owner: profile id responsible (kid chores get XP)
   day: only used for weekly chores (for the themed schedule)
   ============================================================ */
const CHORES = [
  // ---- DAILY ----
  // Kitchen
  { id: "d1", freq: "daily", room: "Kitchen", text: "Wipe counters & stovetop after cooking", owner: "adult_a", weight: 5 },
  { id: "d2", freq: "daily", room: "Kitchen", text: "Load / run the dishwasher", owner: "adult_a", weight: 5 },
  { id: "d3", freq: "daily", room: "Kitchen", text: "Hand-wash pots & pans", owner: "adult_a", weight: 10 },
  { id: "d4", freq: "daily", room: "Kitchen", text: "Wipe sink & faucet, wring out sponge", owner: "adult_a", weight: 3 },
  { id: "d5", freq: "daily", room: "Kitchen", text: "Wipe down kitchen table", owner: "kid", weight: 3 },
  { id: "d6", freq: "daily", room: "Kitchen", text: "Sweep under table & in front of sink", owner: "shared", weight: 5 },
  // Bathrooms
  { id: "d7", freq: "daily", room: "Bathrooms", text: "Wipe sinks & faucets", owner: "adult_b", weight: 3 },
  { id: "d8", freq: "daily", room: "Bathrooms", text: "Hang towels to dry, straighten", owner: "kid", weight: 2 },
  { id: "d9", freq: "daily", room: "Bathrooms", text: "Quick swish toilet bowl if needed", owner: "adult_b", weight: 3 },
  { id: "d10", freq: "daily", room: "Bathrooms", text: "Squeegee shower glass / wipe walls", owner: "adult_b", weight: 3 },
  { id: "d11", freq: "daily", room: "Bathrooms", text: "Wipe counter & put away toiletries", owner: "shared", weight: 3 },
  // Bedrooms
  { id: "d12", freq: "daily", room: "Bedrooms", text: "Make the beds", owner: "kid", weight: 3 },
  { id: "d13", freq: "daily", room: "Bedrooms", text: "Put clothes away / into hamper", owner: "kid", weight: 3 },
  { id: "d14", freq: "daily", room: "Bedrooms", text: "Clear nightstands & surfaces", owner: "shared", weight: 3 },
  // Whole house / dogs
  { id: "d15", freq: "daily", room: "Floors", text: "Dust-mop / robot-vac main traffic areas", owner: "shared", weight: 10 },
  { id: "d16", freq: "daily", room: "Living", text: "5-min clutter sweep (toys, shoes, cups)", owner: "shared", weight: 5 },
  { id: "d17", freq: "daily", room: "Dogs", text: "Rinse & refill dog water bowls", owner: "kid", weight: 2 },
  { id: "d18", freq: "daily", room: "Dogs", text: "Wipe paws / scan for accidents", owner: "shared", weight: 3 },
  { id: "d19", freq: "daily", room: "General", text: "Take out trash if full", owner: "kid", weight: 3 },

  // ---- WEEKLY (themed by day) ----
  // MON — Bathrooms
  { id: "w1", freq: "weekly", day: "Mon", room: "Bathrooms", text: "Scrub both toilets (bowl, seat, base, behind)", owner: "adult_a", weight: 15 },
  { id: "w2", freq: "weekly", day: "Mon", room: "Bathrooms", text: "Scrub tubs & showers, wipe door tracks", owner: "adult_b", weight: 20 },
  { id: "w3", freq: "weekly", day: "Mon", room: "Bathrooms", text: "Disinfect sinks & counters, polish faucets", owner: "adult_a", weight: 10 },
  { id: "w4", freq: "weekly", day: "Mon", room: "Bathrooms", text: "Clean mirrors", owner: "kid", weight: 5 },
  { id: "w5", freq: "weekly", day: "Mon", room: "Bathrooms", text: "Empty trash, shake out / swap mats", owner: "kid", weight: 5 },
  // TUE — Floors
  { id: "w6", freq: "weekly", day: "Tue", room: "Floors", text: "Vacuum corners, baseboards, under furniture", owner: "shared", weight: 25 },
  { id: "w7", freq: "weekly", day: "Tue", room: "Floors", text: "Mop all hard floors", owner: "adult_a", weight: 25 },
  { id: "w8", freq: "weekly", day: "Tue", room: "Bedrooms", text: "Vacuum bedroom & closet floors", owner: "shared", weight: 15 },
  // WED — Dusting
  { id: "w9", freq: "weekly", day: "Wed", room: "Living", text: "Dust shelves, frames, electronics, lamps", owner: "shared", weight: 15 },
  { id: "w10", freq: "weekly", day: "Wed", room: "Living", text: "Dust ceiling fan blades", owner: "adult_b", weight: 10 },
  { id: "w11", freq: "weekly", day: "Wed", room: "Bedrooms", text: "Dust dressers & nightstands", owner: "kid", weight: 8 },
  { id: "w12", freq: "weekly", day: "Wed", room: "General", text: "Wipe switches, handles, remotes", owner: "shared", weight: 8 },
  // THU — Kitchen
  { id: "w13", freq: "weekly", day: "Thu", room: "Kitchen", text: "Clean microwave inside", owner: "kid", weight: 8 },
  { id: "w14", freq: "weekly", day: "Thu", room: "Kitchen", text: "Wipe appliance fronts (fridge, oven, hood)", owner: "adult_a", weight: 10 },
  { id: "w15", freq: "weekly", day: "Thu", room: "Kitchen", text: "Disinfect counters & backsplash", owner: "adult_a", weight: 8 },
  { id: "w16", freq: "weekly", day: "Thu", room: "Kitchen", text: "Scrub sink, run disposal freshener", owner: "adult_a", weight: 8 },
  { id: "w17", freq: "weekly", day: "Thu", room: "Kitchen", text: "Wipe cabinet fronts around handles", owner: "shared", weight: 10 },
  // FRI — Laundry
  { id: "w18", freq: "weekly", day: "Fri", room: "Bedrooms", text: "Strip & wash bed sheets + pillowcases", owner: "adult_a", weight: 15 },
  { id: "w19", freq: "weekly", day: "Fri", room: "Bathrooms", text: "Wash bath & hand towels", owner: "adult_a", weight: 10 },
  { id: "w20", freq: "weekly", day: "Fri", room: "General", text: "Wash, fold & put away regular loads", owner: "adult_b", weight: 30 },
  { id: "w21", freq: "weekly", day: "Fri", room: "General", text: "Wipe washer gasket, leave door cracked", owner: "adult_b", weight: 3 },
  // WEEKEND — Lawn, outdoor & dogs
  { id: "w22", freq: "weekly", day: "Wknd", room: "Outdoor", text: "Mow the acre (riding mower, in season)", owner: "adult_b", weight: 60 },
  { id: "w23", freq: "weekly", day: "Wknd", room: "Dogs", text: "Vacuum dog beds & couch spots", owner: "kid", weight: 10 },
  { id: "w24", freq: "weekly", day: "Wknd", room: "Dogs", text: "Wash dog bowls in hot soapy water", owner: "kid", weight: 5 },
  { id: "w25", freq: "weekly", day: "Wknd", room: "General", text: "Empty all trash & recycling bins", owner: "kid", weight: 8 },

  // ---- MONTHLY ----
  // Kitchen
  { id: "m1", freq: "monthly", room: "Kitchen", text: "Clean inside fridge, toss expired food", owner: "adult_a", weight: 20 },
  { id: "m2", freq: "monthly", room: "Kitchen", text: "Wipe oven interior, clean stovetop grates", owner: "adult_a", weight: 25 },
  { id: "m3", freq: "monthly", room: "Kitchen", text: "Run cleaning cycle on dishwasher", owner: "adult_a", weight: 5 },
  { id: "m4", freq: "monthly", room: "Kitchen", text: "Descale the coffee maker", owner: "adult_a", weight: 10 },
  { id: "m5", freq: "monthly", room: "Kitchen", text: "Wipe inside trash can, degrease hood filter", owner: "shared", weight: 15 },
  { id: "m6", freq: "monthly", room: "Kitchen", text: "Wipe out pantry shelves, check expirations", owner: "shared", weight: 20 },
  // Bathrooms
  { id: "m7", freq: "monthly", room: "Bathrooms", text: "Scrub grout & tile, treat mildew on caulk", owner: "adult_a", weight: 30 },
  { id: "m8", freq: "monthly", room: "Bathrooms", text: "Wash bath mats & shower curtain/liner", owner: "adult_b", weight: 10 },
  { id: "m9", freq: "monthly", room: "Bathrooms", text: "Clean exhaust fan covers", owner: "adult_b", weight: 10 },
  { id: "m10", freq: "monthly", room: "Bathrooms", text: "Wipe cabinet interiors, toss expired products", owner: "shared", weight: 15 },
  { id: "m11", freq: "monthly", room: "Bathrooms", text: "Disinfect trash cans", owner: "kid", weight: 5 },
  // Bedrooms
  { id: "m12", freq: "monthly", room: "Bedrooms", text: "Vacuum under beds & furniture", owner: "shared", weight: 15 },
  { id: "m13", freq: "monthly", room: "Bedrooms", text: "Wash mattress protectors & comforters", owner: "adult_b", weight: 15 },
  { id: "m14", freq: "monthly", room: "Bedrooms", text: "Declutter closet / dresser, donate pile", owner: "shared", weight: 30 },
  { id: "m15", freq: "monthly", room: "Bedrooms", text: "Wipe down headboards & baseboards", owner: "kid", weight: 10 },
  // Whole house
  { id: "m16", freq: "monthly", room: "Whole house", text: "Dust baseboards, vents, light fixtures, molding", owner: "shared", weight: 30 },
  { id: "m17", freq: "monthly", room: "Whole house", text: "Dust & wipe blinds, vacuum curtains", owner: "shared", weight: 20 },
  { id: "m18", freq: "monthly", room: "Whole house", text: "Clean interior windows, sills & tracks", owner: "adult_b", weight: 25 },
  { id: "m19", freq: "monthly", room: "Whole house", text: "Replace HVAC filter (shedding dogs!)", owner: "adult_a", weight: 5 },
  { id: "m20", freq: "monthly", room: "Living", text: "Vacuum under/inside couch cushions", owner: "shared", weight: 10 },
  { id: "m21", freq: "monthly", room: "Living", text: "Spot-clean upholstery", owner: "shared", weight: 15 },
  // Dogs
  { id: "m22", freq: "monthly", room: "Dogs", text: "Wash all dog bedding & deodorize areas", owner: "kid", weight: 15 },
  { id: "m23", freq: "monthly", room: "Dogs", text: "Wash collars/leashes, refresh toy bin", owner: "kid", weight: 10 },
];

const FREQ_META = {
  daily: { label: "Daily", color: "#2c5f7c", reset: "Resets each morning" },
  weekly: { label: "Weekly", color: "#3d7a4e", reset: "Resets every Monday" },
  monthly: { label: "Monthly", color: "#9c5a2c", reset: "Resets on the 1st" },
};

const XP_PER_CHORE = 10;
const BADGES = [
  { id: "first", name: "First Chore", emoji: "⭐", xp: 10 },
  { id: "helper", name: "Helper", emoji: "🧹", xp: 50 },
  { id: "star", name: "Star Cleaner", emoji: "🌟", xp: 150 },
  { id: "hero", name: "Chore Hero", emoji: "🦸", xp: 300 },
  { id: "legend", name: "House Legend", emoji: "👑", xp: 600 },
];

/* ---------- date-key helpers for auto-reset ---------- */
function dailyKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function weeklyKey(d = new Date()) {
  // ISO week start (Monday)
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}
function monthlyKey(d = new Date()) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}
function periodKey(freq) {
  if (freq === "daily") return dailyKey();
  if (freq === "weekly") return weeklyKey();
  return monthlyKey();
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("today");
  const [completions, setCompletions] = useState({}); // { "choreId|periodKey": {by, at} }
  const [log, setLog] = useState([]); // permanent completion history: [{by, day, weight}]
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const credsMissing =
    SUPABASE_URL.includes("YOUR_") || SUPABASE_ANON_KEY.includes("YOUR_");

  /* ---------- load shared state ---------- */
  const loadState = useCallback(async () => {
    if (credsMissing) {
      setLoading(false);
      return;
    }
    try {
      const { data: comps } = await supabase
        .from("completions")
        .select("*");
      const map = {};
      (comps || []).forEach((c) => {
        map[`${c.chore_id}|${c.period_key}`] = { by: c.completed_by, at: c.completed_at };
      });
      setCompletions(map);

      const { data: kid } = await supabase
        .from("kid_progress")
        .select("xp")
        .eq("id", "kid")
        .maybeSingle();
      setXp(kid?.xp || 0);

      // permanent completion history (for stats + streaks)
      const { data: logRows } = await supabase
        .from("chore_log")
        .select("completed_by, day, weight")
        .order("day", { ascending: false })
        .limit(2000);
      setLog((logRows || []).map((r) => ({ by: r.completed_by, day: r.day, weight: r.weight || 1 })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [credsMissing]);

  useEffect(() => {
    loadState();
    if (credsMissing) return;
    // live sync
    const channel = supabase
      .channel("chore-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "completions" }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "kid_progress" }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "chore_log" }, loadState)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadState, credsMissing]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  /* ---------- toggle a chore ---------- */
  const toggleChore = async (chore) => {
    const pk = periodKey(chore.freq);
    const key = `${chore.id}|${pk}`;
    const isDone = !!completions[key];

    // optimistic update
    setCompletions((prev) => {
      const next = { ...prev };
      if (isDone) delete next[key];
      else next[key] = { by: profile.id, at: new Date().toISOString() };
      return next;
    });

    if (credsMissing) return;

    try {
      if (isDone) {
        await supabase.from("completions").delete().match({ chore_id: chore.id, period_key: pk });
        // remove the matching log entry for this chore+period (best-effort un-check)
        await supabase.from("chore_log").delete().match({ chore_id: chore.id, period_key: pk });
        setLog((prev) => {
          const idx = prev.findIndex((r) => r.choreId === chore.id && r.pk === pk);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      } else {
        await supabase.from("completions").upsert(
          { chore_id: chore.id, period_key: pk, completed_by: profile.id, completed_at: new Date().toISOString() },
          { onConflict: "chore_id,period_key" }
        );
        // append a permanent log entry
        const today = dailyKey();
        await supabase.from("chore_log").upsert(
          { chore_id: chore.id, period_key: pk, completed_by: profile.id, day: today, weight: chore.weight || 1 },
          { onConflict: "chore_id,period_key" }
        );
        setLog((prev) => [{ by: profile.id, day: today, weight: chore.weight || 1, choreId: chore.id, pk }, ...prev]);
      }
      // XP for kid-owned chores
      if (chore.owner === "kid") {
        const delta = isDone ? -XP_PER_CHORE : XP_PER_CHORE;
        const newXp = Math.max(0, xp + delta);
        setXp(newXp);
        await supabase.from("kid_progress").upsert({ id: "kid", xp: newXp });
        if (!isDone) showToast(`+${XP_PER_CHORE} XP! 🎉`);
      }
    } catch (e) {
      console.error(e);
      showToast("Couldn't sync — check connection");
    }
  };

  const isDone = (chore) => !!completions[`${chore.id}|${periodKey(chore.freq)}`];
  const doneBy = (chore) => completions[`${chore.id}|${periodKey(chore.freq)}`]?.by;

  /* ============================ RENDER ============================ */

  if (loading) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40 }}>🧽</div>
        <div style={{ color: "#6b7c8c", marginTop: 12 }}>Loading the chart…</div>
      </div>
    );
  }

  // ---- profile picker ----
  if (!profile) {
    return (
      <div style={S.app}>
        <Header />
        {credsMissing && <SetupBanner />}
        <div style={S.pickerWrap}>
          <h2 style={S.pickTitle}>Who's cleaning?</h2>
          <div style={S.pickGrid}>
            {PROFILES.map((p) => (
              <button key={p.id} style={{ ...S.pickCard, borderColor: p.color }} onClick={() => setProfile(p)}>
                <span style={{ fontSize: 48 }}>{p.emoji}</span>
                <span style={{ ...S.pickName, color: p.color }}>{p.name}</span>
                {p.isKid && <span style={S.kidTag}>🎮 Game mode</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- KID VIEW (gamified) ----
  if (profile.isKid) {
    const myChores = CHORES.filter((c) => c.owner === "kid");
    const level = Math.floor(xp / 100) + 1;
    const xpInLevel = xp % 100;
    const earned = BADGES.filter((b) => xp >= b.xp);
    const nextBadge = BADGES.find((b) => xp < b.xp);

    return (
      <div style={S.app}>
        <TopBar profile={profile} onSwitch={() => setProfile(null)} />
        {credsMissing && <SetupBanner />}
        <div style={S.kidHero}>
          <div style={{ fontSize: 30 }}>{profile.emoji} Level {level}</div>
          <div style={S.xpBarOuter}>
            <div style={{ ...S.xpBarInner, width: `${xpInLevel}%` }} />
          </div>
          <div style={S.xpText}>{xp} XP total • {100 - xpInLevel} XP to level {level + 1}</div>
          <div style={S.badgeRow}>
            {BADGES.map((b) => (
              <span key={b.id} style={{ ...S.badge, opacity: earned.includes(b) ? 1 : 0.25 }} title={b.name}>
                {b.emoji}
              </span>
            ))}
          </div>
          {nextBadge && <div style={S.nextBadge}>Next: {nextBadge.emoji} {nextBadge.name} at {nextBadge.xp} XP</div>}
        </div>
        <h3 style={S.kidSection}>My Jobs</h3>
        <div style={S.list}>
          {myChores.map((c) => (
            <KidChoreRow key={c.id} chore={c} done={isDone(c)} onToggle={() => toggleChore(c)} />
          ))}
        </div>
        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    );
  }

  // ---- ADULT VIEWS ----
  const tabs = [
    { id: "today", label: "Today" },
    { id: "chart", label: "Full Chart" },
    { id: "stats", label: "Stats" },
  ];

  const todayChores = CHORES.filter((c) => {
    if (c.freq === "daily") return true;
    const todayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
    if (c.freq === "weekly") {
      if (c.day === "Wknd") return ["Sat", "Sun"].includes(todayName);
      return c.day === todayName;
    }
    return false; // monthly shown only in full chart
  });

  return (
    <div style={S.app}>
      <TopBar profile={profile} onSwitch={() => setProfile(null)} />
      {credsMissing && <SetupBanner />}
      <div style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            style={{ ...S.tab, ...(view === t.id ? S.tabActive : {}) }}
            onClick={() => setView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "today" && (
        <div style={S.section}>
          <p style={S.todayHint}>Everything due today — daily tasks plus this day's weekly theme.</p>
          {todayChores.map((c) => (
            <ChoreRow key={c.id} chore={c} done={isDone(c)} doneBy={doneBy(c)} onToggle={() => toggleChore(c)} />
          ))}
        </div>
      )}

      {view === "chart" &&
        ["daily", "weekly", "monthly"].map((freq) => {
          const items = CHORES.filter((c) => c.freq === freq);
          return (
            <div key={freq} style={S.section}>
              <div style={{ ...S.freqHeader, background: FREQ_META[freq].color }}>
                {FREQ_META[freq].label}
                <span style={S.freqReset}>{FREQ_META[freq].reset}</span>
              </div>
              {freq === "weekly"
                ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Wknd"].map((day) => {
                    const dayItems = items.filter((c) => c.day === day);
                    if (!dayItems.length) return null;
                    return (
                      <div key={day}>
                        <div style={S.dayLabel}>{day === "Wknd" ? "Weekend" : day}</div>
                        {dayItems.map((c) => (
                          <ChoreRow key={c.id} chore={c} done={isDone(c)} doneBy={doneBy(c)} onToggle={() => toggleChore(c)} />
                        ))}
                      </div>
                    );
                  })
                : items.map((c) => (
                    <ChoreRow key={c.id} chore={c} done={isDone(c)} doneBy={doneBy(c)} onToggle={() => toggleChore(c)} />
                  ))}
            </div>
          );
        })}

      {view === "stats" && <StatsView log={log} />}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

/* ---------------- Stats view ---------------- */
function StatsView({ log }) {
  const [range, setRange] = useState("week");
  const [metric, setMetric] = useState("effort"); // "effort" (weighted minutes) or "count"

  const todayK = dailyKey();
  const weekK = weeklyKey();
  const monthK = monthlyKey();

  const inRange = (day) => {
    if (range === "today") return day === todayK;
    if (range === "week") return weeklyKey(new Date(day)) === weekK;
    return monthlyKey(new Date(day)) === monthK;
  };

  // Tally by person — both effort (weight) and count
  const tally = {
    adult_a: { effort: 0, count: 0 },
    adult_b: { effort: 0, count: 0 },
    kid: { effort: 0, count: 0 },
  };
  log.forEach((r) => {
    if (!inRange(r.day) || !tally[r.by]) return;
    tally[r.by].effort += r.weight || 1;
    tally[r.by].count += 1;
  });

  const val = (id) => tally[id]?.[metric] || 0;
  const total = val("adult_a") + val("adult_b") + val("kid");

  const ranges = [
    { id: "today", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
  ];

  const board = PROFILES.map((p) => ({
    ...p,
    amount: val(p.id),
    pct: total ? Math.round((val(p.id) / total) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount);

  // ---- Streaks: consecutive days (ending today or yesterday) with >=1 chore ----
  const streakFor = (id) => {
    const days = new Set(log.filter((r) => r.by === id).map((r) => r.day));
    if (days.size === 0) return 0;
    let streak = 0;
    const d = new Date();
    // allow streak to count if they did something today OR yesterday (grace for "not yet today")
    if (!days.has(dailyKey(d))) {
      d.setDate(d.getDate() - 1);
      if (!days.has(dailyKey(d))) return 0;
    }
    while (days.has(dailyKey(d))) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  };

  const fmt = (n) => (metric === "effort" ? `${n}m` : `${n}`);

  return (
    <div style={S.section}>
      <div style={S.rangeBar}>
        {ranges.map((r) => (
          <button key={r.id} style={{ ...S.rangeBtn, ...(range === r.id ? S.rangeBtnActive : {}) }} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div style={S.metricToggle}>
        <button style={{ ...S.metricBtn, ...(metric === "effort" ? S.metricBtnActive : {}) }} onClick={() => setMetric("effort")}>
          ⏱️ By effort (min)
        </button>
        <button style={{ ...S.metricBtn, ...(metric === "count" ? S.metricBtnActive : {}) }} onClick={() => setMetric("count")}>
          # By count
        </button>
      </div>

      {total === 0 ? (
        <div style={S.emptyStats}>
          <div style={{ fontSize: 36 }}>📊</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>
            No chores logged for this range yet. Get cleaning and watch the scoreboard fill up!
          </p>
        </div>
      ) : (
        <>
          <div style={S.statTotal}>
            {metric === "effort" ? `${total} minutes of effort` : `${total} chores completed`}
          </div>

          {/* Fairness split bar */}
          <div style={S.splitBar}>
            {board.filter((p) => p.amount > 0).map((p) => (
              <div key={p.id} style={{ width: `${p.pct}%`, background: p.color, height: "100%" }} title={`${p.name}: ${p.pct}%`} />
            ))}
          </div>
          <div style={S.splitLegend}>
            {board.filter((p) => p.amount > 0).map((p) => (
              <span key={p.id} style={S.legendItem}>
                <span style={{ ...S.legendDot, background: p.color }} /> {p.name} {p.pct}%
              </span>
            ))}
          </div>

          {/* Per-person cards */}
          <div style={{ marginTop: 18 }}>
            {board.map((p, i) => {
              const streak = streakFor(p.id);
              return (
                <div key={p.id} style={S.statCard}>
                  <span style={S.statRank}>{i === 0 && p.amount > 0 ? "🏆" : `#${i + 1}`}</span>
                  <span style={{ fontSize: 24 }}>{p.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: p.color, display: "flex", alignItems: "center", gap: 8 }}>
                      {p.name}
                      {streak > 0 && <span style={S.streakChip}>🔥 {streak}d</span>}
                    </div>
                    <div style={S.statBarOuter}>
                      <div style={{ ...S.statBarInner, width: `${p.pct}%`, background: p.color }} />
                    </div>
                  </div>
                  <div style={S.statCount}>{fmt(p.amount)}</div>
                </div>
              );
            })}
          </div>

          <p style={S.statsNote}>
            {metric === "effort"
              ? "Effort is the estimated minutes each chore takes — heavier jobs count for more."
              : "Each chore counts as one, big or small."}
            {" "}🔥 = days in a row with at least one chore done.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------------- components ---------------- */
function Header() {
  return (
    <div style={S.header}>
      <h1 style={S.h1}>Our Household Chart</h1>
      <p style={S.sub}>3 people • 2 dogs • 1,300 sq ft • 1 acre</p>
    </div>
  );
}

function TopBar({ profile, onSwitch }) {
  return (
    <div style={S.topbar}>
      <div style={S.topbarLeft}>
        <span style={{ fontSize: 22 }}>{profile.emoji}</span>
        <span style={{ fontWeight: 700, color: profile.color }}>{profile.name}</span>
      </div>
      <button style={S.switchBtn} onClick={onSwitch}>Switch</button>
    </div>
  );
}

function ownerLabel(owner) {
  const p = PROFILES.find((x) => x.id === owner);
  if (owner === "shared") return { text: "Anyone", color: "#6b7c8c" };
  return { text: p?.name || owner, color: p?.color || "#6b7c8c" };
}

function ChoreRow({ chore, done, doneBy, onToggle }) {
  const owner = ownerLabel(chore.owner);
  const byProfile = doneBy ? PROFILES.find((p) => p.id === doneBy) : null;
  return (
    <div style={{ ...S.row, opacity: done ? 0.55 : 1 }} onClick={onToggle}>
      <div style={{ ...S.checkbox, ...(done ? S.checkboxOn : {}) }}>{done ? "✓" : ""}</div>
      <div style={{ flex: 1 }}>
        <div style={{ ...S.rowText, textDecoration: done ? "line-through" : "none" }}>{chore.text}</div>
        <div style={S.rowMeta}>
          {chore.room && <span style={S.roomTag}>{chore.room}</span>}
          <span style={{ color: owner.color, fontWeight: 600 }}>{owner.text}</span>
          {done && byProfile && <span style={S.doneBy}> • done by {byProfile.emoji} {byProfile.name}</span>}
        </div>
      </div>
    </div>
  );
}

function KidChoreRow({ chore, done, onToggle }) {
  return (
    <div style={{ ...S.kidRow, ...(done ? S.kidRowDone : {}) }} onClick={onToggle}>
      <div style={{ ...S.kidCheck, ...(done ? S.kidCheckOn : {}) }}>{done ? "✓" : ""}</div>
      <span style={{ ...S.kidRowText, textDecoration: done ? "line-through" : "none" }}>{chore.text}</span>
      <span style={S.kidXp}>{done ? "✅" : `+${XP_PER_CHORE}`}</span>
    </div>
  );
}

function SetupBanner() {
  return (
    <div style={S.setupBanner}>
      ⚠️ Add your Supabase URL and anon key at the top of the file to enable syncing.
      Until then, checkboxes work but won't save or sync.
    </div>
  );
}

/* ---------------- styles ---------------- */
const S = {
  app: { maxWidth: 560, margin: "0 auto", padding: "0 14px 60px", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#1a2b3c" },
  center: { height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" },
  header: { textAlign: "center", padding: "22px 0 14px" },
  h1: { fontSize: 26, color: "#2c5f7c", margin: 0, letterSpacing: 0.5 },
  sub: { color: "#6b7c8c", fontSize: 13, marginTop: 4 },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 4px", borderBottom: "2px solid #e3ebf0", marginBottom: 12 },
  topbarLeft: { display: "flex", alignItems: "center", gap: 8 },
  switchBtn: { background: "none", border: "1.5px solid #c5d4de", borderRadius: 8, padding: "6px 14px", color: "#2c5f7c", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  pickerWrap: { paddingTop: 20 },
  pickTitle: { textAlign: "center", color: "#2c5f7c", fontSize: 20, marginBottom: 20 },
  pickGrid: { display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" },
  pickCard: { flex: "1 1 130px", maxWidth: 170, background: "#fff", border: "2.5px solid", borderRadius: 16, padding: "24px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" },
  pickName: { fontSize: 17, fontWeight: 700 },
  kidTag: { fontSize: 11, color: "#9c5a2c", background: "#fbeede", padding: "3px 8px", borderRadius: 10 },
  tabBar: { display: "flex", gap: 8, marginBottom: 14 },
  tab: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #c5d4de", background: "#fff", color: "#6b7c8c", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  tabActive: { background: "#2c5f7c", color: "#fff", borderColor: "#2c5f7c" },
  section: { marginBottom: 18 },
  todayHint: { fontSize: 13, color: "#6b7c8c", marginBottom: 10 },
  freqHeader: { color: "#fff", fontWeight: 700, padding: "8px 12px", borderRadius: 8, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 },
  freqReset: { fontSize: 11, fontWeight: 400, opacity: 0.9 },
  dayLabel: { fontWeight: 700, color: "#3d7a4e", fontSize: 13, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: 0.5 },
  row: { display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 10px", borderBottom: "1px solid #eef3f6", cursor: "pointer", borderRadius: 8 },
  checkbox: { flexShrink: 0, width: 24, height: 24, border: "2px solid #2c5f7c", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 },
  checkboxOn: { background: "#3d7a4e", borderColor: "#3d7a4e" },
  rowText: { fontSize: 14.5, lineHeight: 1.35 },
  rowMeta: { fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  roomTag: { fontSize: 10.5, fontWeight: 600, color: "#5a6b7a", background: "#eef3f6", padding: "1px 7px", borderRadius: 8, textTransform: "uppercase", letterSpacing: 0.3 },
  doneBy: { color: "#9aa8b5" },
  kidHero: { background: "linear-gradient(135deg,#9c5a2c,#c97c3f)", color: "#fff", borderRadius: 18, padding: "20px 18px", textAlign: "center", marginBottom: 18 },
  xpBarOuter: { background: "rgba(255,255,255,0.3)", borderRadius: 20, height: 16, margin: "12px 0 6px", overflow: "hidden" },
  xpBarInner: { background: "#ffd56b", height: "100%", borderRadius: 20, transition: "width 0.4s" },
  xpText: { fontSize: 12, opacity: 0.95 },
  badgeRow: { display: "flex", justifyContent: "center", gap: 10, marginTop: 14, fontSize: 26 },
  badge: { transition: "opacity 0.3s" },
  nextBadge: { fontSize: 12, marginTop: 8, opacity: 0.9 },
  kidSection: { color: "#9c5a2c", fontSize: 18, margin: "0 0 10px" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  kidRow: { display: "flex", alignItems: "center", gap: 12, padding: "16px 14px", background: "#fff", border: "2px solid #f0d9c2", borderRadius: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  kidRowDone: { background: "#f3faf4", borderColor: "#bfe3c6" },
  kidCheck: { flexShrink: 0, width: 30, height: 30, border: "3px solid #9c5a2c", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 },
  kidCheckOn: { background: "#3d7a4e", borderColor: "#3d7a4e" },
  kidRowText: { flex: 1, fontSize: 16, fontWeight: 600 },
  kidXp: { fontSize: 14, fontWeight: 700, color: "#9c5a2c" },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a2b3c", color: "#fff", padding: "12px 22px", borderRadius: 30, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100 },
  setupBanner: { background: "#fff4e0", border: "1.5px solid #f0c97a", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#8a5a1a", marginBottom: 12 },
  rangeBar: { display: "flex", gap: 8, marginBottom: 16 },
  rangeBtn: { flex: 1, padding: "8px 0", borderRadius: 9, border: "1.5px solid #c5d4de", background: "#fff", color: "#6b7c8c", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  rangeBtnActive: { background: "#2c5f7c", color: "#fff", borderColor: "#2c5f7c" },
  metricToggle: { display: "flex", gap: 6, marginBottom: 16 },
  metricBtn: { flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #dce5ec", background: "#fff", color: "#6b7c8c", fontWeight: 600, cursor: "pointer", fontSize: 12 },
  metricBtnActive: { background: "#eef3f6", color: "#2c5f7c", borderColor: "#2c5f7c" },
  streakChip: { fontSize: 11, fontWeight: 700, color: "#c0531a", background: "#fbe6d8", padding: "1px 7px", borderRadius: 10 },
  emptyStats: { textAlign: "center", padding: "40px 20px" },
  statTotal: { textAlign: "center", fontSize: 15, fontWeight: 700, color: "#2c5f7c", marginBottom: 12 },
  splitBar: { display: "flex", height: 22, borderRadius: 11, overflow: "hidden", background: "#eef3f6", border: "1px solid #dce5ec" },
  splitLegend: { display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12.5, color: "#5a6b7a" },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  statCard: { display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderBottom: "1px solid #eef3f6" },
  statRank: { fontSize: 14, fontWeight: 700, color: "#9aa8b5", minWidth: 26, textAlign: "center" },
  statBarOuter: { background: "#eef3f6", borderRadius: 8, height: 8, marginTop: 5, overflow: "hidden" },
  statBarInner: { height: "100%", borderRadius: 8, transition: "width 0.4s" },
  statCount: { fontSize: 22, fontWeight: 800, color: "#1a2b3c", minWidth: 32, textAlign: "right" },
  statsNote: { fontSize: 11.5, color: "#9aa8b5", textAlign: "center", marginTop: 16, lineHeight: 1.4 },
};
