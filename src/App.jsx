import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   STEP 1 — PASTE YOUR SUPABASE CREDENTIALS HERE
   Get these from your new Supabase project:
   Project Settings > Data API (URL) and API Keys (anon/public key)
   ============================================================ */
const SUPABASE_URL = "https://ehhzfrltrpqpgyohoqlg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoaHpmcmx0cnBxcGd5b2hvcWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODc1NTksImV4cCI6MjA5NTI2MzU1OX0.xqwBefqLBOGNb3DU3NTQ8UHvWUM4Czreq5nkq72o9SA";

/* ============================================================
   FAMILY PIN — change this 4-digit code to something only your
   household knows. Required to unlock the app on each device.
   ============================================================ */
const FAMILY_PIN = "0344";
const PIN_REMEMBER_DAYS = 30;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   PROFILES — rename these to your real names anytime.
   "kid" flag drives the gamified view + filtered chores.
   ============================================================ */
const PROFILES = [
  { id: "adult_a", name: "Dad", emoji: "👨", color: "#2c5f7c" },
  { id: "adult_b", name: "Mom", emoji: "👩", color: "#3d7a4e" },
  { id: "kid", name: "Nolan", emoji: "🧒", color: "#9c5a2c", isKid: true },
];

/* ============================================================
   CHORE DEFINITIONS
   freq: "daily" | "weekly" | "monthly"
   owner: profile id responsible (kid chores get XP)
   day: only used for weekly chores (for the themed schedule)
   ============================================================ */
const DEFAULT_CHORES = [
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

/* ============================================================
   COIN ECONOMY & RANKS (Nolan's Quest style)
   - Coins earned per chore = chore.weight (heavier work = more pay)
   - Coins spent on rewards in the catalog
   - Ranks are pure progression milestones based on lifetime coins earned
   ============================================================ */
const COINS_PER_WEIGHT = 1; // 1 coin per minute of effort

const RANKS = [
  { level: 1, name: "Squire",        icon: "🛡️", minCoins: 0 },
  { level: 2, name: "Page",          icon: "⚔️", minCoins: 100 },
  { level: 3, name: "Knight",        icon: "🗡️", minCoins: 300 },
  { level: 4, name: "Champion",      icon: "🏆", minCoins: 600 },
  { level: 5, name: "Hero",          icon: "⭐", minCoins: 1000 },
  { level: 6, name: "Legend",        icon: "👑", minCoins: 1500 },
  { level: 7, name: "Dragon Master", icon: "🐉", minCoins: 2500 },
];

function getCurrentRank(lifetime) {
  let rank = RANKS[0];
  for (const r of RANKS) if (lifetime >= r.minCoins) rank = r;
  return rank;
}
function getNextRank(lifetime) {
  return RANKS.find((r) => r.minCoins > lifetime) || null;
}

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
  const [unlocked, setUnlocked] = useState(() => {
    try {
      const saved = localStorage.getItem("family_pin_unlock");
      if (!saved) return false;
      const expires = parseInt(saved, 10);
      return Date.now() < expires;
    } catch { return false; }
  });
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("today");
  const [todayFilter, setTodayFilter] = useState("mine"); // "mine" or "all"
  const [chores, setChores] = useState(DEFAULT_CHORES); // loaded from Supabase, defaults until then
  const [completions, setCompletions] = useState({}); // { "choreId|periodKey": {by, at} }
  const [log, setLog] = useState([]); // permanent completion history: [{by, day, weight}]
  const [balance, setBalance] = useState(0);   // coins available to spend
  const [lifetime, setLifetime] = useState(0); // total coins ever earned (for rank)
  const [rewards, setRewards] = useState([]);  // catalog of redeemable rewards
  const [redemptions, setRedemptions] = useState([]); // pending/approved/denied
  const [bonuses, setBonuses] = useState([]); // bonus coins given off-list
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
      // Load chores from Supabase. If empty, seed with defaults (one-time).
      const { data: choreRows } = await supabase
        .from("chores")
        .select("*")
        .order("sort_order", { ascending: true });

      if (!choreRows || choreRows.length === 0) {
        // First run: seed the table with the 67 default chores
        const seed = DEFAULT_CHORES.map((c, i) => ({
          id: c.id,
          freq: c.freq,
          day: c.day || null,
          room: c.room || null,
          text: c.text,
          owner: c.owner,
          weight: c.weight || 1,
          active: true,
          sort_order: i,
        }));
        await supabase.from("chores").insert(seed);
        setChores(DEFAULT_CHORES);
      } else {
        setChores(choreRows.filter((c) => c.active));
      }

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
        .select("balance, lifetime")
        .eq("id", "kid")
        .maybeSingle();
      setBalance(kid?.balance || 0);
      setLifetime(kid?.lifetime || 0);

      // reward catalog
      const { data: rewardRows } = await supabase
        .from("rewards")
        .select("*")
        .eq("active", true)
        .order("cost", { ascending: true });
      setRewards(rewardRows || []);

      // redemption requests (pending + recent)
      const { data: redRows } = await supabase
        .from("redemptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setRedemptions(redRows || []);

      // bonus coins (off-list rewards)
      const { data: bonusRows } = await supabase
        .from("bonuses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setBonuses(bonusRows || []);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "rewards" }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "redemptions" }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "chores" }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "bonuses" }, loadState)
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
      // Coins for kid-owned chores (earn = chore weight)
      if (chore.owner === "kid") {
        const coins = (chore.weight || 1) * COINS_PER_WEIGHT;
        const delta = isDone ? -coins : coins;
        const newBalance = Math.max(0, balance + delta);
        // lifetime only grows, never goes below previous (un-checking shouldn't strip rank)
        const newLifetime = isDone ? lifetime : lifetime + coins;
        setBalance(newBalance);
        setLifetime(newLifetime);
        await supabase.from("kid_progress").upsert({ id: "kid", balance: newBalance, lifetime: newLifetime });
        if (!isDone) {
          const beforeRank = getCurrentRank(lifetime);
          const afterRank = getCurrentRank(newLifetime);
          if (afterRank.level > beforeRank.level) {
            showToast(`🎉 Rank up! ${afterRank.icon} ${afterRank.name}!`);
          } else {
            showToast(`+${coins} 🪙`);
          }
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Couldn't sync — check connection");
    }
  };

  const isDone = (chore) => !!completions[`${chore.id}|${periodKey(chore.freq)}`];
  const doneBy = (chore) => completions[`${chore.id}|${periodKey(chore.freq)}`]?.by;

  /* ============================ RENDER ============================ */

  // ---- PIN lock gate (before anything else) ----
  if (!unlocked) {
    return (
      <PinLock
        onUnlock={() => {
          const expires = Date.now() + PIN_REMEMBER_DAYS * 24 * 60 * 60 * 1000;
          try { localStorage.setItem("family_pin_unlock", String(expires)); } catch {}
          setUnlocked(true);
        }}
      />
    );
  }

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
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button
              style={{ ...S.switchBtn, fontSize: 12 }}
              onClick={() => {
                if (!confirm("Lock this device? You'll need to enter the PIN to unlock.")) return;
                try { localStorage.removeItem("family_pin_unlock"); } catch {}
                window.location.reload();
              }}
            >
              🔒 Lock this device
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- redemption handlers (used by kid + adult views) ----
  const redeemReward = async (reward) => {
    if (balance < reward.cost) {
      showToast(`Need ${reward.cost - balance} more 🪙`);
      return;
    }
    const newBalance = balance - reward.cost;
    setBalance(newBalance);
    try {
      await supabase.from("kid_progress").upsert({ id: "kid", balance: newBalance, lifetime });
      await supabase.from("redemptions").insert({
        reward_id: reward.id,
        reward_name: reward.name,
        reward_icon: reward.icon,
        cost: reward.cost,
        status: "pending",
        requested_by: "kid",
      });
      showToast(`🎁 Redeemed! Waiting for approval`);
    } catch (e) { console.error(e); showToast("Couldn't redeem"); }
  };

  const decideRedemption = async (red, status) => {
    try {
      await supabase.from("redemptions").update({
        status,
        decided_by: profile.id,
        decided_at: new Date().toISOString(),
      }).eq("id", red.id);
      // if denied, refund the coins
      if (status === "denied") {
        const newBalance = balance + red.cost;
        setBalance(newBalance);
        await supabase.from("kid_progress").upsert({ id: "kid", balance: newBalance, lifetime });
      }
      showToast(status === "approved" ? "Approved! 🎉" : "Denied — coins refunded");
    } catch (e) { console.error(e); showToast("Couldn't update"); }
  };

  // ---- give bonus coins (off-list reward) ----
  const giveBonus = async (amount, reason) => {
    const amt = parseInt(amount, 10);
    if (!amt || amt < 1) { showToast("Pick an amount"); return; }
    const newBalance = balance + amt;
    const newLifetime = lifetime + amt;
    setBalance(newBalance);
    setLifetime(newLifetime);
    try {
      await supabase.from("kid_progress").upsert({ id: "kid", balance: newBalance, lifetime: newLifetime });
      await supabase.from("bonuses").insert({
        amount: amt,
        reason: (reason || "").trim() || null,
        given_by: profile.id,
      });
      const beforeRank = getCurrentRank(lifetime);
      const afterRank = getCurrentRank(newLifetime);
      if (afterRank.level > beforeRank.level) {
        showToast(`🎉 Bonus +${amt} 🪙 — Rank up! ${afterRank.icon} ${afterRank.name}!`);
      } else {
        showToast(`🎁 Bonus +${amt} 🪙 given!`);
      }
    } catch (e) { console.error(e); showToast("Couldn't save bonus"); }
  };

  // ---- KID VIEW (gamified) ----
  if (profile.isKid) {
    return (
      <KidApp
        profile={profile}
        chores={chores.filter((c) => c.owner === "kid")}
        isDone={isDone}
        onToggleChore={toggleChore}
        balance={balance}
        lifetime={lifetime}
        rewards={rewards}
        redemptions={redemptions.filter((r) => r.requested_by === "kid")}
        bonuses={bonuses}
        onRedeem={redeemReward}
        onSwitch={() => setProfile(null)}
        credsMissing={credsMissing}
        toast={toast}
      />
    );
  }

  // ---- ADULT VIEWS ----
  const pendingCount = redemptions.filter((r) => r.status === "pending").length;
  const tabs = [
    { id: "today", label: "Today" },
    { id: "chart", label: "Chart" },
    { id: "stats", label: "Stats" },
    { id: "inbox", label: `Inbox${pendingCount ? ` (${pendingCount})` : ""}` },
    { id: "rewards", label: "Rewards" },
    { id: "manage", label: "Chores" },
    { id: "bonus", label: "Bonus 🎁" },
  ];

  const todayChores = chores.filter((c) => {
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
          <div style={S.todayFilterRow}>
            <button
              style={{ ...S.todayFilterBtn, ...(todayFilter === "mine" ? S.todayFilterBtnActive : {}) }}
              onClick={() => setTodayFilter("mine")}
            >
              Mine
            </button>
            <button
              style={{ ...S.todayFilterBtn, ...(todayFilter === "all" ? S.todayFilterBtnActive : {}) }}
              onClick={() => setTodayFilter("all")}
            >
              All
            </button>
          </div>
          <p style={S.todayHint}>
            {todayFilter === "mine"
              ? "Your chores for today, plus anything shared."
              : "Everything due today across the household."}
          </p>
          {todayChores
            .filter((c) => todayFilter === "all" || c.owner === profile.id || c.owner === "shared")
            .map((c) => (
              <ChoreRow key={c.id} chore={c} done={isDone(c)} doneBy={doneBy(c)} onToggle={() => toggleChore(c)} />
            ))}
        </div>
      )}

      {view === "chart" &&
        ["daily", "weekly", "monthly"].map((freq) => {
          const items = chores.filter((c) => c.freq === freq);
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

      {view === "inbox" && <InboxView redemptions={redemptions} onDecide={decideRedemption} />}

      {view === "rewards" && <RewardsAdminView rewards={rewards} showToast={showToast} />}

      {view === "manage" && <ChoresAdminView chores={chores} showToast={showToast} />}

      {view === "bonus" && <BonusView balance={balance} bonuses={bonuses} onGive={giveBonus} />}

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

/* ---------------- Kid app (Quest mode with tabs) ---------------- */
function KidApp({ profile, chores, isDone, onToggleChore, balance, lifetime, rewards, redemptions, bonuses, onRedeem, onSwitch, credsMissing, toast }) {
  const [tab, setTab] = useState("quests");
  const rank = getCurrentRank(lifetime);
  const nextRank = getNextRank(lifetime);
  const intoRank = lifetime - rank.minCoins;
  const ofRank = nextRank ? nextRank.minCoins - rank.minCoins : 1;
  const pct = nextRank ? Math.min(100, Math.round((intoRank / ofRank) * 100)) : 100;

  return (
    <div style={S.app}>
      <TopBar profile={profile} onSwitch={onSwitch} />
      {credsMissing && <SetupBanner />}

      {/* Quest hero card */}
      <div style={S.questHero}>
        <div style={S.rankBig}>{rank.icon}</div>
        <div style={S.rankName}>{rank.name}</div>
        <div style={S.coinsBig}>🪙 {balance}</div>
        <div style={S.xpBarOuter}>
          <div style={{ ...S.xpBarInner, width: `${pct}%` }} />
        </div>
        <div style={S.xpText}>
          {nextRank
            ? `${nextRank.minCoins - lifetime} coins to ${nextRank.icon} ${nextRank.name}`
            : `Max rank reached! ${lifetime} lifetime coins`}
        </div>
        <div style={S.rankRow}>
          {RANKS.map((r) => (
            <span key={r.level} style={{ ...S.rankPip, opacity: lifetime >= r.minCoins ? 1 : 0.3 }} title={`${r.name} (${r.minCoins})`}>
              {r.icon}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        <button style={{ ...S.tab, ...(tab === "quests" ? S.tabActive : {}) }} onClick={() => setTab("quests")}>⚔️ Quests</button>
        <button style={{ ...S.tab, ...(tab === "rewards" ? S.tabActive : {}) }} onClick={() => setTab("rewards")}>🎁 Rewards</button>
      </div>

      {tab === "quests" && (
        <>
          {bonuses && bonuses.length > 0 && (
            <div style={S.kidBonusBox}>
              <div style={S.kidBonusTitle}>🎁 Recent bonuses</div>
              {bonuses.slice(0, 3).map((b) => (
                <div key={b.id} style={S.kidBonusItem}>
                  <span style={{ fontWeight: 700, color: "#9c5a2c" }}>+{b.amount} 🪙</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{b.reason || "Bonus!"}</span>
                </div>
              ))}
            </div>
          )}
          <h3 style={S.kidSection}>My Quests</h3>
          <div style={S.list}>
            {chores.map((c) => (
              <KidChoreRow key={c.id} chore={c} done={isDone(c)} onToggle={() => onToggleChore(c)} />
            ))}
          </div>
        </>
      )}

      {tab === "rewards" && (
        <KidRewardsTab rewards={rewards} balance={balance} redemptions={redemptions} onRedeem={onRedeem} />
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function KidRewardsTab({ rewards, balance, redemptions, onRedeem }) {
  const pending = redemptions.filter((r) => r.status === "pending");
  const approved = redemptions.filter((r) => r.status === "approved").slice(0, 3);

  return (
    <div style={S.section}>
      <div style={S.balanceCard}>You have <strong>🪙 {balance}</strong> coins to spend</div>

      {pending.length > 0 && (
        <div style={S.pendingBox}>
          <div style={S.pendingTitle}>⏳ Waiting for approval</div>
          {pending.map((r) => (
            <div key={r.id} style={S.pendingItem}>
              <span style={{ fontSize: 20 }}>{r.reward_icon || "🎁"}</span>
              <span style={{ flex: 1 }}>{r.reward_name}</span>
              <span style={S.pendingCost}>🪙 {r.cost}</span>
            </div>
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <div style={S.approvedBox}>
          <div style={S.approvedTitle}>✅ Recently approved</div>
          {approved.map((r) => (
            <div key={r.id} style={S.pendingItem}>
              <span style={{ fontSize: 18 }}>{r.reward_icon || "🎁"}</span>
              <span style={{ flex: 1 }}>{r.reward_name}</span>
            </div>
          ))}
        </div>
      )}

      <h3 style={S.kidSection}>🎁 Reward Shop</h3>
      {rewards.length === 0 ? (
        <div style={S.emptyStats}>
          <div style={{ fontSize: 36 }}>🎁</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>
            No rewards yet! Ask a grown-up to add some in the Rewards tab.
          </p>
        </div>
      ) : (
        <div style={S.rewardGrid}>
          {rewards.map((r) => {
            const canAfford = balance >= r.cost;
            return (
              <button key={r.id} style={{ ...S.rewardCard, opacity: canAfford ? 1 : 0.5 }} onClick={() => canAfford && onRedeem(r)} disabled={!canAfford}>
                <span style={{ fontSize: 32 }}>{r.icon || "🎁"}</span>
                <span style={S.rewardName}>{r.name}</span>
                <span style={S.rewardCost}>🪙 {r.cost}</span>
                {!canAfford && <span style={S.rewardNeed}>{r.cost - balance} more</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Adult: Inbox (pending redemptions) ---------------- */
function InboxView({ redemptions, onDecide }) {
  const pending = redemptions.filter((r) => r.status === "pending");
  const recent = redemptions.filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <div style={S.section}>
      <h3 style={S.adminSection}>⏳ Pending requests</h3>
      {pending.length === 0 ? (
        <div style={S.emptyStats}>
          <div style={{ fontSize: 36 }}>📭</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>No pending requests right now.</p>
        </div>
      ) : (
        pending.map((r) => (
          <div key={r.id} style={S.redemptionCard}>
            <span style={{ fontSize: 32 }}>{r.reward_icon || "🎁"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{r.reward_name}</div>
              <div style={{ fontSize: 12, color: "#6b7c8c" }}>Cost: 🪙 {r.cost} • requested {timeAgo(r.created_at)}</div>
            </div>
            <button style={S.approveBtn} onClick={() => onDecide(r, "approved")}>✓ Approve</button>
            <button style={S.denyBtn} onClick={() => onDecide(r, "denied")}>✗ Deny</button>
          </div>
        ))
      )}

      {recent.length > 0 && (
        <>
          <h3 style={{ ...S.adminSection, marginTop: 22 }}>Recent decisions</h3>
          {recent.map((r) => (
            <div key={r.id} style={{ ...S.redemptionCard, opacity: 0.7 }}>
              <span style={{ fontSize: 22 }}>{r.reward_icon || "🎁"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.reward_name}</div>
                <div style={{ fontSize: 11, color: "#6b7c8c" }}>
                  {r.status === "approved" ? "✅ Approved" : "❌ Denied"} • {timeAgo(r.decided_at)}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ---------------- Adult: Rewards management (catalog) ---------------- */
function RewardsAdminView({ rewards, showToast }) {
  const [editing, setEditing] = useState(null); // reward being edited, or {} for new
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [icon, setIcon] = useState("🎁");

  const startNew = () => { setEditing({}); setName(""); setCost(""); setIcon("🎁"); };
  const startEdit = (r) => { setEditing(r); setName(r.name); setCost(String(r.cost)); setIcon(r.icon || "🎁"); };
  const cancel = () => setEditing(null);

  const save = async () => {
    const c = parseInt(cost, 10);
    if (!name.trim() || !c || c < 1) { showToast("Need a name and a cost"); return; }
    try {
      if (editing.id) {
        await supabase.from("rewards").update({ name: name.trim(), cost: c, icon }).eq("id", editing.id);
        showToast("Reward updated");
      } else {
        await supabase.from("rewards").insert({ name: name.trim(), cost: c, icon, active: true });
        showToast("Reward added");
      }
      setEditing(null);
    } catch (e) { console.error(e); showToast("Couldn't save"); }
  };

  const deactivate = async (r) => {
    if (!confirm(`Remove "${r.name}" from the shop?`)) return;
    try {
      await supabase.from("rewards").update({ active: false }).eq("id", r.id);
      showToast("Removed");
    } catch (e) { console.error(e); }
  };

  const ICONS = ["🎁", "🍦", "🎮", "📺", "🍕", "🧸", "💰", "🎬", "🏀", "🎨", "📱", "🚗", "🍪", "⚾", "🎯", "🏊"];

  return (
    <div style={S.section}>
      <div style={S.adminHeaderRow}>
        <h3 style={S.adminSection}>🎁 Reward catalog</h3>
        {!editing && <button style={S.addBtn} onClick={startNew}>+ Add</button>}
      </div>

      {editing && (
        <div style={S.editCard}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{editing.id ? "Edit reward" : "New reward"}</div>
          <label style={S.label}>Name</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Ice cream trip" />
          <label style={S.label}>Cost (coins)</label>
          <input style={S.input} type="number" min="1" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="50" />
          <label style={S.label}>Icon</label>
          <div style={S.iconGrid}>
            {ICONS.map((i) => (
              <button key={i} style={{ ...S.iconBtn, ...(icon === i ? S.iconBtnActive : {}) }} onClick={() => setIcon(i)}>{i}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} onClick={save}>Save</button>
            <button style={S.cancelBtn} onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {rewards.length === 0 && !editing ? (
        <div style={S.emptyStats}>
          <div style={{ fontSize: 36 }}>🎁</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>
            No rewards yet. Tap "+ Add" to create the first one.
          </p>
        </div>
      ) : (
        rewards.map((r) => (
          <div key={r.id} style={S.rewardAdminRow}>
            <span style={{ fontSize: 26 }}>{r.icon || "🎁"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "#6b7c8c" }}>🪙 {r.cost}</div>
            </div>
            <button style={S.smallBtn} onClick={() => startEdit(r)}>Edit</button>
            <button style={{ ...S.smallBtn, color: "#c0392b" }} onClick={() => deactivate(r)}>Remove</button>
          </div>
        ))
      )}
    </div>
  );
}


/* ---------------- Adult: Chores management ---------------- */
function ChoresAdminView({ chores, showToast }) {
  const [editing, setEditing] = useState(null);
  const [filterFreq, setFilterFreq] = useState("all");
  const [text, setText] = useState("");
  const [weight, setWeight] = useState("");
  const [owner, setOwner] = useState("shared");
  const [freq, setFreq] = useState("daily");
  const [day, setDay] = useState("Mon");
  const [room, setRoom] = useState("");

  const startNew = () => {
    setEditing({});
    setText(""); setWeight("5"); setOwner("shared"); setFreq("daily"); setDay("Mon"); setRoom("");
  };
  const startEdit = (c) => {
    setEditing(c);
    setText(c.text); setWeight(String(c.weight || 1)); setOwner(c.owner);
    setFreq(c.freq); setDay(c.day || "Mon"); setRoom(c.room || "");
  };
  const cancel = () => setEditing(null);

  const save = async () => {
    const w = parseInt(weight, 10);
    if (!text.trim() || !w || w < 1) { showToast("Need text and a weight"); return; }
    const payload = {
      text: text.trim(),
      weight: w,
      owner,
      freq,
      day: freq === "weekly" ? day : null,
      room: room.trim() || null,
      active: true,
    };
    try {
      if (editing.id) {
        await supabase.from("chores").update(payload).eq("id", editing.id);
        showToast("Chore updated");
      } else {
        // generate a unique id for new chores
        payload.id = `c${Date.now()}`;
        payload.sort_order = chores.length + 1;
        await supabase.from("chores").insert(payload);
        showToast("Chore added");
      }
      setEditing(null);
    } catch (e) { console.error(e); showToast("Couldn't save"); }
  };

  const remove = async (c) => {
    if (!confirm(`Delete "${c.text}"?`)) return;
    try {
      await supabase.from("chores").update({ active: false }).eq("id", c.id);
      showToast("Removed");
    } catch (e) { console.error(e); }
  };

  const filtered = filterFreq === "all" ? chores : chores.filter((c) => c.freq === filterFreq);
  const FREQS = [
    { id: "all", label: "All" },
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
  ];

  return (
    <div style={S.section}>
      <div style={S.adminHeaderRow}>
        <h3 style={S.adminSection}>📋 Manage chores ({chores.length})</h3>
        {!editing && <button style={S.addBtn} onClick={startNew}>+ Add</button>}
      </div>

      {editing && (
        <div style={S.editCard}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{editing.id ? "Edit chore" : "New chore"}</div>
          <label style={S.label}>What to do</label>
          <input style={S.input} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g., Sweep the porch" />
          <label style={S.label}>Effort (minutes / coins)</label>
          <input style={S.input} type="number" min="1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <label style={S.label}>Who does it</label>
          <div style={S.segRow}>
            {[{id:"adult_a",l:"Dad"},{id:"adult_b",l:"Mom"},{id:"kid",l:"Nolan"},{id:"shared",l:"Shared"}].map((o) => (
              <button key={o.id} style={{ ...S.segBtn, ...(owner === o.id ? S.segBtnActive : {}) }} onClick={() => setOwner(o.id)}>{o.l}</button>
            ))}
          </div>
          <label style={S.label}>How often</label>
          <div style={S.segRow}>
            {["daily","weekly","monthly"].map((f) => (
              <button key={f} style={{ ...S.segBtn, ...(freq === f ? S.segBtnActive : {}) }} onClick={() => setFreq(f)}>{f}</button>
            ))}
          </div>
          {freq === "weekly" && (
            <>
              <label style={S.label}>Which day</label>
              <div style={S.segRow}>
                {["Mon","Tue","Wed","Thu","Fri","Wknd"].map((d) => (
                  <button key={d} style={{ ...S.segBtn, ...(day === d ? S.segBtnActive : {}) }} onClick={() => setDay(d)}>{d}</button>
                ))}
              </div>
            </>
          )}
          <label style={S.label}>Room (optional)</label>
          <input style={S.input} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Kitchen, Bathrooms, etc." />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} onClick={save}>Save</button>
            <button style={S.cancelBtn} onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      <div style={S.segRow}>
        {FREQS.map((f) => (
          <button key={f.id} style={{ ...S.segBtn, ...(filterFreq === f.id ? S.segBtnActive : {}) }} onClick={() => setFilterFreq(f.id)}>{f.label}</button>
        ))}
      </div>

      {filtered.map((c) => (
        <div key={c.id} style={S.choreAdminRow}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.text}</div>
            <div style={{ fontSize: 11, color: "#6b7c8c", marginTop: 2 }}>
              {c.freq}{c.day ? ` · ${c.day}` : ""}{c.room ? ` · ${c.room}` : ""} · 🪙{c.weight} · {ownerShortName(c.owner)}
            </div>
          </div>
          <button style={S.smallBtn} onClick={() => startEdit(c)}>Edit</button>
          <button style={{ ...S.smallBtn, color: "#c0392b" }} onClick={() => remove(c)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

function ownerShortName(id) {
  if (id === "adult_a") return "Dad";
  if (id === "adult_b") return "Mom";
  if (id === "kid") return "Nolan";
  return "Shared";
}

/* ---------------- Adult: Give bonus coins ---------------- */
function BonusView({ balance, bonuses, onGive }) {
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [reason, setReason] = useState("");
  const PRESETS = [5, 10, 25, 50];

  const submit = () => {
    const amt = custom ? parseInt(custom, 10) : amount;
    if (!amt) return;
    onGive(amt, reason);
    setReason("");
    setCustom("");
    setAmount(10);
  };

  return (
    <div style={S.section}>
      <h3 style={S.adminSection}>🎁 Give bonus coins</h3>
      <div style={S.balanceCard}>Kid currently has <strong>🪙 {balance}</strong></div>

      <label style={S.label}>Quick amount</label>
      <div style={S.segRow}>
        {PRESETS.map((p) => (
          <button
            key={p}
            style={{ ...S.segBtn, ...(amount === p && !custom ? S.segBtnActive : {}) }}
            onClick={() => { setAmount(p); setCustom(""); }}
          >
            +{p} 🪙
          </button>
        ))}
      </div>

      <label style={S.label}>Or custom amount</label>
      <input
        style={S.input}
        type="number"
        min="1"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        placeholder="Type any amount"
      />

      <label style={S.label}>Reason (optional, shown to kid)</label>
      <input
        style={S.input}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g., Helped without being asked"
        maxLength={80}
      />

      <button style={{ ...S.saveBtn, marginTop: 14, width: "100%" }} onClick={submit}>
        Give +{custom || amount} 🪙
      </button>

      {bonuses.length > 0 && (
        <>
          <h3 style={{ ...S.adminSection, marginTop: 22 }}>Recent bonuses</h3>
          {bonuses.slice(0, 10).map((b) => (
            <div key={b.id} style={S.bonusRow}>
              <span style={S.bonusAmount}>+{b.amount} 🪙</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.reason || "Bonus"}</div>
                <div style={{ fontSize: 11, color: "#6b7c8c" }}>
                  Given by {ownerShortName(b.given_by)} · {timeAgo(b.created_at)}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}


/* ---------------- PIN lock screen ---------------- */
function PinLock({ onUnlock }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const inputsRef = React.useRef([]);

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    setError(false);
    if (val && i < 3) {
      inputsRef.current[i + 1]?.focus();
    }
    if (next.every((d) => d) && next.join("") === FAMILY_PIN) {
      // small delay so the last digit visually fills in before unlocking
      setTimeout(onUnlock, 150);
    } else if (next.every((d) => d) && next.join("") !== FAMILY_PIN) {
      setError(true);
      setTimeout(() => {
        setDigits(["", "", "", ""]);
        inputsRef.current[0]?.focus();
      }, 600);
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  return (
    <div style={S.pinScreen}>
      <div style={S.pinCard}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={S.pinTitle}>Family Chores</h2>
        <p style={S.pinSub}>Enter the family PIN to continue</p>
        <div style={S.pinRow}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              style={{ ...S.pinBox, ...(error ? S.pinBoxError : {}) }}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              autoFocus={i === 0}
            />
          ))}
        </div>
        {error && <div style={S.pinError}>Wrong PIN — try again</div>}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={S.header}>
      <h1 style={S.h1}>Our Household Chart</h1>
      <p style={S.sub}>3 people • 2 dogs • 1,300 sq ft • 1 acre</p>
    </div>
  );
}

function TopBar({ profile, onSwitch }) {
  const handleLock = () => {
    if (!confirm("Lock this device? You'll need to enter the PIN to unlock.")) return;
    try { localStorage.removeItem("family_pin_unlock"); } catch {}
    window.location.reload();
  };
  return (
    <div style={S.topbar}>
      <div style={S.topbarLeft}>
        <span style={{ fontSize: 22 }}>{profile.emoji}</span>
        <span style={{ fontWeight: 700, color: profile.color }}>{profile.name}</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={S.switchBtn} onClick={onSwitch}>Switch</button>
        <button style={{ ...S.switchBtn, padding: "6px 10px" }} onClick={handleLock} title="Lock this device">🔒</button>
      </div>
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
      <span style={S.kidXp}>{done ? "✅" : `+${chore.weight || 1}🪙`}</span>
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
  questHero: { background: "linear-gradient(135deg,#3a2c5e,#7c4adb)", color: "#fff", borderRadius: 18, padding: "20px 18px", textAlign: "center", marginBottom: 14, boxShadow: "0 4px 14px rgba(60,30,120,0.25)" },
  rankBig: { fontSize: 56, lineHeight: 1 },
  rankName: { fontSize: 20, fontWeight: 800, marginTop: 4, letterSpacing: 0.5 },
  coinsBig: { fontSize: 22, fontWeight: 700, color: "#ffd56b", marginTop: 6 },
  rankRow: { display: "flex", justifyContent: "center", gap: 10, marginTop: 14, fontSize: 24 },
  rankPip: { transition: "opacity 0.3s" },
  balanceCard: { background: "#fff7e0", border: "2px solid #f0c97a", borderRadius: 12, padding: "10px 14px", textAlign: "center", marginBottom: 14, color: "#8a5a1a" },
  pendingBox: { background: "#fff4e0", border: "1.5px solid #f0c97a", borderRadius: 10, padding: 10, marginBottom: 12 },
  pendingTitle: { fontWeight: 700, color: "#8a5a1a", marginBottom: 6, fontSize: 13 },
  pendingItem: { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 14 },
  pendingCost: { color: "#8a5a1a", fontWeight: 600 },
  approvedBox: { background: "#e8f5ec", border: "1.5px solid #a5d4b3", borderRadius: 10, padding: 10, marginBottom: 12 },
  approvedTitle: { fontWeight: 700, color: "#2d6b3f", marginBottom: 6, fontSize: 13 },
  rewardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  rewardCard: { background: "#fff", border: "2px solid #d4c5e8", borderRadius: 14, padding: "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  rewardName: { fontSize: 14, fontWeight: 600, textAlign: "center", color: "#3a2c5e" },
  rewardCost: { fontSize: 13, fontWeight: 700, color: "#9c5a2c" },
  rewardNeed: { fontSize: 11, color: "#c0392b" },
  adminSection: { color: "#2c5f7c", fontSize: 17, margin: "0 0 10px" },
  adminHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  addBtn: { background: "#3d7a4e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14 },
  editCard: { background: "#f8fbfd", border: "1.5px solid #c5d4de", borderRadius: 12, padding: 14, marginBottom: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7c8c", marginTop: 8, marginBottom: 4 },
  input: { width: "100%", padding: "8px 10px", border: "1.5px solid #c5d4de", borderRadius: 8, fontSize: 14, boxSizing: "border-box" },
  iconGrid: { display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 },
  iconBtn: { background: "#fff", border: "1.5px solid #dce5ec", borderRadius: 8, padding: "6px 0", fontSize: 18, cursor: "pointer" },
  iconBtnActive: { background: "#eef3f6", borderColor: "#2c5f7c" },
  saveBtn: { flex: 1, background: "#2c5f7c", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, cursor: "pointer" },
  cancelBtn: { flex: 1, background: "#fff", color: "#6b7c8c", border: "1.5px solid #c5d4de", borderRadius: 8, padding: "10px 0", fontWeight: 600, cursor: "pointer" },
  rewardAdminRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderBottom: "1px solid #eef3f6" },
  smallBtn: { background: "#fff", border: "1.5px solid #c5d4de", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  redemptionCard: { display: "flex", alignItems: "center", gap: 10, padding: "12px 10px", background: "#fff", border: "1.5px solid #e3ebf0", borderRadius: 10, marginBottom: 8 },
  approveBtn: { background: "#3d7a4e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  denyBtn: { background: "#fff", color: "#c0392b", border: "1.5px solid #e8b8b0", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  segRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  segBtn: { flex: "1 1 auto", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #c5d4de", background: "#fff", color: "#6b7c8c", fontWeight: 600, cursor: "pointer", fontSize: 12, minWidth: 60, textTransform: "capitalize" },
  segBtnActive: { background: "#2c5f7c", color: "#fff", borderColor: "#2c5f7c" },
  choreAdminRow: { display: "flex", alignItems: "center", gap: 8, padding: "10px 8px", borderBottom: "1px solid #eef3f6" },
  bonusRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: "1px solid #eef3f6" },
  bonusAmount: { fontSize: 16, fontWeight: 800, color: "#9c5a2c", minWidth: 60 },
  kidBonusBox: { background: "linear-gradient(135deg,#fff4e0,#ffe5c0)", border: "2px solid #f0c97a", borderRadius: 14, padding: "12px 14px", marginBottom: 16 },
  kidBonusTitle: { fontWeight: 800, color: "#8a5a1a", marginBottom: 6, fontSize: 14 },
  kidBonusItem: { display: "flex", alignItems: "center", gap: 10, padding: "4px 0", color: "#5a3a0a" },
  pinScreen: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#2c5f7c,#3d7a9e)", padding: 20 },
  pinCard: { background: "#fff", borderRadius: 20, padding: "32px 28px", textAlign: "center", maxWidth: 360, width: "100%", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
  pinTitle: { color: "#2c5f7c", margin: "12px 0 4px", fontSize: 22 },
  pinSub: { color: "#6b7c8c", fontSize: 14, marginBottom: 24 },
  pinRow: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 },
  pinBox: { width: 50, height: 60, border: "2px solid #c5d4de", borderRadius: 12, fontSize: 28, fontWeight: 700, textAlign: "center", color: "#2c5f7c", background: "#f8fbfd", outline: "none" },
  pinBoxError: { borderColor: "#c0392b", color: "#c0392b", background: "#fdf0ee" },
  pinError: { color: "#c0392b", fontSize: 13, fontWeight: 600, marginTop: 8 },
  todayFilterRow: { display: "flex", gap: 6, marginBottom: 10 },
  todayFilterBtn: { flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid #c5d4de", background: "#fff", color: "#6b7c8c", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  todayFilterBtnActive: { background: "#2c5f7c", color: "#fff", borderColor: "#2c5f7c" },
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
