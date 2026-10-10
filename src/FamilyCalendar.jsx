import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchMonth, monthKey, inPeriod, dayOf, daysInMonth as dimOf, paydaysBetween, landedNear } from "./moneyMath.js";

/* ============================================================
   FAMILY CALENDAR
   - month grid that shows everything at a glance: events in each person's
     colour, bills due, and paydays — no tapping needed just to read it
   - tap a day to add or edit
   - one dinner per day (meal planning) alongside events
   - color-coded by who it belongs to
   ============================================================ */

const WHO = [
  { id: "family",  name: "Family", color: "#b39ddb" },
  { id: "adult_a", name: "Dad",    color: "#7ea6c9" },
  { id: "adult_b", name: "Mom",    color: "#ff7eb6" },
  { id: "kid",     name: "Nolan",  color: "#4dd4e8" },
];
const whoOf = (id) => WHO.find((w) => w.id === id) || WHO[0];

const CATS = ["School", "Sports", "Work", "Appointment", "Birthday", "Trip", "Other"];


const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

/* ---- date helpers (local-time safe: no UTC drift) ---- */
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const sameDay = (a, b) => ymd(a) === ymd(b);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

function prettyTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

/* ---- stroke icon (Lucide style) for the scan button ---- */
/* "Tue, Sep 8" — short and unambiguous inside a notification */
function prettyDay(ymdStr) {
  try {
    const d = fromYmd(ymdStr);
    return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  } catch (e) { return ymdStr; }
}

function BellIcon({ size = 16, color = "currentColor", off }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function ScanIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

/* ---- shrink a photo before upload; text needs more detail than product photos ---- */
function compressForOCR(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image"));
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) {
          const s = maxDim / Math.max(w, h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const url = c.toDataURL("image/jpeg", quality);
        resolve(url.split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* supabase-js reports any non-2xx as "Edge Function returned a non-2xx status code"
   and hides the body. Dig the real message out so errors are actually readable. */
async function realError(error, data) {
  if (data && data.error) return data.error;
  try {
    if (error && error.context && typeof error.context.json === "function") {
      const body = await error.context.json();
      if (body && body.error) return body.error;
    }
  } catch (e) { /* fall through to the generic message */ }
  return (error && error.message) || "Scan failed.";
}

const uid = () => `d${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const isYmd = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHm = (s) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

/* ---------- web push client helpers ---------- */
const VAPID_PUBLIC = "BPvI57yOmOGU3HDKgIzSoJwDE5H1l9ngqufokZraxCqK0wYHGVlt3Jnr4Vb7VfTyxUrBZfTQa-4M-B18l77mRY4";

function urlB64ToUint8(base64String) {
  const pad = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentPushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return "off";
    const sub = await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch (e) { return "off"; }
}

async function enablePush(supabase, profile) {
  if (!pushSupported()) throw new Error("This browser can't do notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error(perm === "denied"
      ? "Notifications are blocked. Turn them back on in your browser's site settings."
      : "Notifications weren't allowed.");
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
    });
  }
  const j = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    profile_id: profile?.id || null,
    label: profile?.name || null,
  }, { onConflict: "endpoint" });
  if (error) throw new Error("Couldn't save this device.");
  return true;
}

async function disablePush(supabase) {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const ep = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", ep);
  }
}

/* Fire and forget — a notification failing must never block saving an event. */
function notifyFamily(supabase, profile, message, title) {
  try {
    supabase.functions.invoke("send-push", {
      body: {
        title: title || "Family Calendar",
        message,
        url: "/",
        tag: "calendar",
        exclude: profile?.id || null,
      },
    }).catch(() => {});
  } catch (e) { /* never surface push problems to the user mid-save */ }
}

export default function FamilyCalendar({ supabase, profile, onBack, credsMissing }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(ymd(today));
  const [events, setEvents] = useState([]);
  const [meals, setMeals] = useState([]);
  const [money, setMoney] = useState({ bills: [], payments: [], income: [], paySchedules: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // event editor
  const [editing, setEditing] = useState(null);   // {} = new, event = edit
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("family");
  const [cat, setCat] = useState("Other");
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("");
  const [loc, setLoc] = useState("");

  // meal editor
  const [mealText, setMealText] = useState("");

  // AI scan
  const fileRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [drafts, setDrafts] = useState(null);   // null = no review open
  const [saving, setSaving] = useState(false);

  // notifications
  const [pushState, setPushState] = useState("off");   // on | off | blocked | unsupported
  const [pushBusy, setPushBusy] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  const load = useCallback(async () => {
    if (credsMissing) { setLoading(false); return; }
    try {
      const first = ymd(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
      const last  = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0));
      const { data: ev } = await supabase.from("events").select("*")
        .gte("day", first).lte("day", last).order("start_time", { ascending: true });
      setEvents(ev || []);
      const { data: ml } = await supabase.from("meals").select("*")
        .gte("day", first).lte("day", last);
      setMeals(ml || []);
      // bills, paydays and logged paychecks for the month on screen — same source as the Money screen
      const m = await fetchMonth(supabase, monthKey(cursor));
      setMoney({ bills: m.bills, payments: m.payments, income: m.income, paySchedules: m.paySchedules });
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [supabase, credsMissing, cursor]);

  useEffect(() => {
    load();
    if (credsMissing) return;
    const ch = supabase.channel("cal-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bills" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bill_payments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "income" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pay_schedules" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, supabase, credsMissing]);

  useEffect(() => {
    const m = meals.find((x) => x.day === selected);
    setMealText(m ? m.dinner : "");
  }, [selected, meals]);

  /* ---------- month grid ---------- */
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const firstDow = new Date(y, mo, 1).getDay();
  const monthDays = new Date(y, mo + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= monthDays; d++) cells.push(new Date(y, mo, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const period = monthKey(cursor);
  const paidMap = {}; money.payments.forEach((p) => { paidMap[p.bill_id] = p; });
  const monthStart = `${period}-01`, monthEnd = `${period}-${String(monthDays).padStart(2, "0")}`;
  const expected = paydaysBetween(money.paySchedules, monthStart, monthEnd);
  const todayKey = ymd(today);

  const short$ = (n) => { const v = Number(n || 0);
    return "$" + v.toLocaleString(undefined, { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); };

  function moneyOn(key) {
    const out = [];
    // paydays: scheduled ones, showing the real amount once it's been logged
    const used = new Set();
    for (const p of expected.filter((x) => x.date === key)) {
      const landed = landedNear(money.income, p.who, key);
      if (landed) used.add(landed.id);
      out.push({ kind: "pay", who: p.who, landed });
    }
    // a paycheck logged on a day with no scheduled payday (a bonus, an odd week) still shows
    for (const r of money.income.filter((r) => r.received_on === key)) {
      const near = expected.some((p) => p.who === r.who && landedNear([r], p.who, p.date));
      if (!near && !used.has(r.id)) out.push({ kind: "pay", who: r.who, landed: r });
    }
    // bills due that day; a 31st bill falls on the last day of a short month
    for (const b of money.bills.filter((b) => inPeriod(b, period))) {
      if (Math.min(dayOf(b), monthDays) !== Number(key.slice(8, 10))) continue;
      const paid = !!paidMap[b.id];
      const amt = paid && paidMap[b.id].amount_paid != null ? paidMap[b.id].amount_paid : b.amount;
      out.push({ kind: "bill", bill: b, paid, amt, late: !paid && key < todayKey });
    }
    return out;
  }

  const evOn = (key) => events.filter((e) => e.day === key);
  const mealOn = (key) => meals.find((m) => m.day === key);

  const dayEvents = evOn(selected).sort((a, b) => {
    if (!a.start_time && b.start_time) return -1;
    if (a.start_time && !b.start_time) return 1;
    return (a.start_time || "").localeCompare(b.start_time || "");
  });

  /* ---------- actions ---------- */
  const startNew = () => {
    setEditing({}); setTitle(""); setWho("family"); setCat("Other");
    setAllDay(true); setStart("17:00"); setEnd(""); setLoc("");
  };
  const startEdit = (e) => {
    setEditing(e); setTitle(e.title); setWho(e.who || "family"); setCat(e.category);
    setAllDay(!e.start_time); setStart(e.start_time || "17:00");
    setEnd(e.end_time || ""); setLoc(e.location || "");
  };

  const saveEvent = async () => {
    if (!title.trim()) { flash("Give it a title"); return; }
    const payload = {
      title: title.trim(), day: selected, who, category: cat,
      start_time: allDay ? null : start,
      end_time: allDay ? null : (end || null),
      location: loc.trim() || null,
      created_by: profile?.id || null,
    };
    try {
      if (editing.id) {
        setEvents((p) => p.map((x) => (x.id === editing.id ? { ...x, ...payload } : x)));
        await supabase.from("events").update(payload).eq("id", editing.id);
        flash("Event updated");
        notifyFamily(supabase, profile,
          `${payload.title} changed — ${prettyDay(payload.day)}${payload.start_time ? " at " + prettyTime(payload.start_time) : ""}`,
          "Calendar updated");
      } else {
        const { data, error } = await supabase.from("events").insert(payload).select().single();
        if (error) throw error;
        setEvents((p) => [...p, data]);
        flash("Event added");
        notifyFamily(supabase, profile,
          `${payload.title} — ${prettyDay(payload.day)}${payload.start_time ? " at " + prettyTime(payload.start_time) : ""}`,
          "New on the calendar");
      }
      setEditing(null);
    } catch (e) { console.error(e); flash("Couldn't save"); load(); }
  };

  const removeEvent = async (e) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    setEvents((p) => p.filter((x) => x.id !== e.id));
    try {
      await supabase.from("events").delete().eq("id", e.id);
      notifyFamily(supabase, profile, `${e.title} on ${prettyDay(e.day)} was removed`, "Calendar updated");
    } catch (err) { console.error(err); load(); }
  };

  const saveMeal = async () => {
    const t = mealText.trim();
    try {
      if (!t) {
        setMeals((p) => p.filter((m) => m.day !== selected));
        await supabase.from("meals").delete().eq("day", selected);
        return;
      }
      const row = { day: selected, dinner: t, created_by: profile?.id || null };
      setMeals((p) => [...p.filter((m) => m.day !== selected), { ...row, id: `tmp${Date.now()}` }]);
      const { data, error } = await supabase.from("meals")
        .upsert(row, { onConflict: "day" }).select().single();
      if (error) throw error;
      setMeals((p) => [...p.filter((m) => m.day !== selected), data]);
      flash("Dinner saved");
    } catch (e) { console.error(e); flash("Couldn't save dinner"); load(); }
  };

  /* ---------- AI scan ---------- */
  const onPickPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";           // let the same file be picked again later
    if (!file) return;
    if (credsMissing) { flash("Supabase isn't configured"); return; }

    setScanError(null);
    setDrafts(null);
    setScanning(true);
    try {
      const b64 = await compressForOCR(file);
      const { data, error } = await supabase.functions.invoke("scan-doc", {
        body: {
          image_base64: b64,
          media_type: "image/jpeg",
          mode: "calendar",
          today: ymd(new Date()),
        },
      });
      if (error || (data && data.error)) throw new Error(await realError(error, data));

      const rows = Array.isArray(data && data.results) ? data.results : [];
      const clean = rows
        .filter((r) => r && typeof r.title === "string" && r.title.trim() && isYmd(r.day))
        .map((r) => ({
          _id: uid(),
          include: true,
          title: String(r.title).trim().slice(0, 120),
          day: r.day,
          allDay: !isHm(r.start_time),
          start_time: isHm(r.start_time) ? r.start_time : "17:00",
          end_time: isHm(r.end_time) ? r.end_time : "",
          location: r.location ? String(r.location).slice(0, 120) : "",
          who: WHO.some((w) => w.id === r.who) ? r.who : "family",
          category: CATS.includes(r.category) ? r.category : "Other",
          confidence: typeof r.confidence === "number" ? r.confidence : 1,
        }))
        .sort((a, b) => a.day.localeCompare(b.day));

      if (clean.length === 0) {
        setScanError("Nothing dated turned up in that photo. Try a straighter, brighter shot.");
      } else {
        setEditing(null);
        setDrafts(clean);
        if (data && data.truncated) {
          setScanError(
            `That schedule was long — I got the first ${clean.length} events. ` +
            `Scan the rest of the page separately to catch the remainder.`
          );
        }
      }
    } catch (err) {
      console.error(err);
      setScanError(err.message || "Couldn't scan that photo.");
    }
    setScanning(false);
  };

  const patchDraft = (id, patch) =>
    setDrafts((p) => p.map((d) => (d._id === id ? { ...d, ...patch } : d)));

  const saveDrafts = async () => {
    const picked = (drafts || []).filter((d) => d.include && d.title.trim() && isYmd(d.day));
    if (picked.length === 0) { flash("Nothing selected"); return; }
    setSaving(true);
    try {
      const rows = picked.map((d) => ({
        title: d.title.trim(),
        day: d.day,
        who: d.who,
        category: d.category,
        start_time: d.allDay ? null : d.start_time,
        end_time: d.allDay ? null : (d.end_time || null),
        location: d.location.trim() || null,
        created_by: profile?.id || null,
      }));
      const { data, error } = await supabase.from("events").insert(rows).select();
      if (error) throw error;
      setEvents((p) => [...p, ...(data || [])]);
      setDrafts(null);
      flash(`Added ${rows.length} event${rows.length === 1 ? "" : "s"}`);
      notifyFamily(supabase, profile,
        rows.length === 1
          ? `${rows[0].title} — ${prettyDay(rows[0].day)}`
          : `${rows.length} events added, starting ${prettyDay(rows[0].day)}`,
        "New on the calendar");
      // jump to the first one so it's visible
      const firstDay = rows[0].day;
      const fd = fromYmd(firstDay);
      setCursor(new Date(fd.getFullYear(), fd.getMonth(), 1));
      setSelected(firstDay);
    } catch (err) {
      console.error(err);
      flash("Couldn't save those events");
      load();
    }
    setSaving(false);
  };

  useEffect(() => { currentPushState().then(setPushState); }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushState === "on") { await disablePush(supabase); setPushState("off"); flash("Notifications off"); }
      else { await enablePush(supabase, profile); setPushState("on"); flash("Notifications on for this device"); }
    } catch (err) {
      console.error(err);
      flash(err.message || "Couldn't change notifications");
      setPushState(await currentPushState());
    }
    setPushBusy(false);
  };

  const selDate = fromYmd(selected);
  const isToday = sameDay(selDate, today);
  const selMoney = moneyOn(selected);
  const MAXTAGS = 4;

  if (loading) {
    return <div style={S.screen}><div style={S.center}><div style={{ color: P.dim }}>Loading the calendar…</div></div></div>;
  }

  /* one line of text inside a day: wraps to two lines, then cuts off — like a phone's own calendar */
  // padding lives on the outer box and the two-line cutoff on the inner text,
  // so no sliver of a third line can show through the bottom padding
  const Tag = ({ text, color, bg, bar, strike, title }) => (
    <span title={title || text} style={{ ...S.tag, color, background: bg, borderLeft: bar ? `3px solid ${bar}` : "none" }}>
      <span style={{ ...S.tagText, textDecoration: strike ? "line-through" : "none" }}>{text}</span>
    </span>
  );
  const tagsFor = (key) => {
    const t = [];
    for (const m of moneyOn(key)) {
      if (m.kind === "pay") t.push({ k: "p" + m.who, text: m.landed ? `${whoOf(m.who).name} +${short$(m.landed.amount)}` : `${whoOf(m.who).name} payday`,
        color: P.green, bg: "rgba(127,214,160,0.13)" });
      else t.push({ k: "b" + m.bill.id, text: `${m.bill.name} ${short$(m.amt)}`,
        color: m.paid ? P.faint : m.late ? P.red : P.amber,
        bg: m.paid ? "rgba(255,255,255,0.04)" : m.late ? "rgba(242,139,130,0.13)" : "rgba(242,196,109,0.12)", strike: m.paid });
    }
    for (const e of evOn(key).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")))
      t.push({ k: "e" + e.id, text: e.title, color: P.text, bg: "rgba(255,255,255,0.05)", bar: whoOf(e.who).color });
    return t;
  };

  return (
    <div style={S.screen}>
      <div style={S.wrap}>
        <div style={S.topbar}>
          <button style={S.backBtn} onClick={onBack}><Glyph name="back" size={16} /><span>Home</span></button>
          <h2 style={S.title}>Calendar</h2>
          <div style={{ width: 78 }} />
        </div>

        {credsMissing && <div style={S.banner}>Supabase isn't configured — changes won't sync.</div>}

        <div style={S.monthBar}>
          <button style={S.navBtn} aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}><Glyph name="left" size={18} /></button>
          <div style={{ textAlign: "center" }}>
            <div style={S.monthName}>{MONTHS[mo]} {y}</div>
            {(mo !== today.getMonth() || y !== today.getFullYear() || selected !== todayKey) && (
              <button style={S.todayBtn} onClick={() => {
                const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelected(ymd(t));
              }}>jump to today</button>
            )}
          </div>
          <button style={S.navBtn} aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}><Glyph name="right" size={18} /></button>
        </div>
      </div>

      {/* ---- the month, everything written in ---- */}
      <div style={S.gridWrap}>
        <div style={S.dowRow}>{DOW.map((d) => <div key={d} style={S.dowCell}>{d[0]}</div>)}</div>
        <div style={S.grid}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} style={S.emptyCell} />;
            const key = ymd(d), tags = tagsFor(key), ml = mealOn(key);
            const isSel = key === selected, isTod = key === todayKey, past = key < todayKey;
            return (
              <button key={i} style={{ ...S.cell, ...(isSel ? S.cellSel : {}), ...(past && !isSel ? { opacity: 0.62 } : {}) }}
                onClick={() => { setSelected(key); setEditing(null); }}>
                <div style={S.cellTop}>
                  <span style={{ ...S.cellNum, ...(isTod ? S.cellNumToday : {}) }}>{d.getDate()}</span>
                  {ml && <span style={S.mealMark} title={`Dinner: ${ml.dinner}`}><Glyph name="dinner" size={11} color={P.dim} /></span>}
                </div>
                {tags.slice(0, MAXTAGS).map((t) => <Tag key={t.k} {...t} />)}
                {tags.length > MAXTAGS && <span style={S.moreTag}>+{tags.length - MAXTAGS} more</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={S.wrap}>
        <div style={S.legend}>
          {WHO.map((w) => <span key={w.id} style={S.legendItem}><span style={{ ...S.dot, background: w.color }} />{w.name}</span>)}
          <span style={S.legendItem}><span style={{ ...S.dot, background: P.green }} />Payday</span>
          <span style={S.legendItem}><span style={{ ...S.dot, background: P.amber }} />Bill</span>
        </div>

        {/* ---- the chosen day ---- */}
        <div style={S.dayCard}>
          <div style={S.dayHead}>
            <div>
              <div style={S.dayTitle}>{DOW[selDate.getDay()]}, {MONTHS[selDate.getMonth()]} {selDate.getDate()}</div>
              {isToday && <span style={S.todayTag}>Today</span>}
            </div>
            {!editing && !drafts && (
              <div style={{ display: "flex", gap: 8 }}>
                {pushState !== "unsupported" && (
                  <button style={{ ...S.iconSq, ...(pushState === "on" ? S.iconSqOn : {}), ...(pushBusy ? { opacity: 0.5 } : {}) }}
                    disabled={pushBusy} onClick={togglePush}
                    aria-label={pushState === "on" ? "Notifications on" : "Turn on notifications"}
                    title={pushState === "on" ? "Notifications on for this device" : pushState === "blocked" ? "Notifications blocked in browser settings" : "Turn on notifications for this device"}>
                    <BellIcon size={17} color={pushState === "on" ? "#0b0b0d" : P.dim} off={pushState !== "on"} />
                  </button>
                )}
                <button style={{ ...S.iconSq, ...(scanning ? { opacity: 0.6 } : {}) }} disabled={scanning} aria-label="Scan a schedule"
                  onClick={() => fileRef.current && fileRef.current.click()}><ScanIcon size={17} color={P.gold} /></button>
                <button style={S.addBtn} onClick={startNew}><Glyph name="plus" size={16} color="#1a140a" /><span>Add</span></button>
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} style={{ display: "none" }} />
          {scanning && <div style={S.noteInfo}>Reading the photo… this takes a few seconds.</div>}
          {scanError && !scanning && (
            <div style={S.noteErr}><span style={{ flex: 1 }}>{scanError}</span>
              <button style={S.xBtn} aria-label="Dismiss" onClick={() => setScanError(null)}><Glyph name="close" size={15} /></button></div>
          )}

          {/* money on this day */}
          {selMoney.length > 0 && !drafts && (
            <div style={{ marginTop: 6 }}>
              {selMoney.map((m) => m.kind === "pay" ? (
                <div key={"p" + m.who + (m.landed ? m.landed.id : "")} style={S.moneyRow}>
                  <Glyph name="wallet" size={16} color={P.green} />
                  <span style={{ flex: 1 }}>{whoOf(m.who).name} {m.landed ? "paid" : "payday"}</span>
                  {m.landed ? <b style={{ color: P.green }}>+{short$(m.landed.amount)}</b> : <span style={{ color: P.faint, fontSize: 12.5 }}>log it in Money</span>}
                </div>
              ) : (
                <div key={"b" + m.bill.id} style={S.moneyRow}>
                  <Glyph name="bill" size={16} color={m.paid ? P.faint : m.late ? P.red : P.amber} />
                  <span style={{ flex: 1, textDecoration: m.paid ? "line-through" : "none", color: m.paid ? P.faint : P.text }}>{m.bill.name}</span>
                  <span style={{ color: m.paid ? P.green : m.late ? P.red : P.amber, fontSize: 12.5, fontWeight: 700, marginRight: 8 }}>
                    {m.paid ? "Paid" : m.late ? "Overdue" : "Due"}</span>
                  <b>{short$(m.amt)}</b>
                </div>
              ))}
            </div>
          )}

          {/* scan review */}
          {drafts && (
            <div style={S.review}>
              <div style={{ fontWeight: 800, color: P.goldHi }}>Found {drafts.length} event{drafts.length === 1 ? "" : "s"}</div>
              <div style={{ fontSize: 12.5, color: P.dim, margin: "2px 0 12px" }}>Check the dates and times before saving. Untick anything you don't want.</div>
              {drafts.map((d) => {
                const w = whoOf(d.who), low = d.confidence < 0.6;
                return (
                  <div key={d._id} style={{ ...S.draft, borderLeft: `4px solid ${d.include ? w.color : "rgba(255,255,255,0.12)"}`, opacity: d.include ? 1 : 0.5 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input type="checkbox" checked={d.include} onChange={(e) => patchDraft(d._id, { include: e.target.checked })}
                        style={{ marginTop: 12, width: 20, height: 20, flexShrink: 0, accentColor: P.gold }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input style={{ ...S.input, fontWeight: 700 }} value={d.title} onChange={(e) => patchDraft(d._id, { title: e.target.value })} />
                        {low && <div style={S.lowConf}>Not fully sure about this one — double-check it</div>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ flex: 1.3 }}><label style={S.miniLabel}>Date</label>
                            <input style={S.input} type="date" value={d.day} onChange={(e) => patchDraft(d._id, { day: e.target.value })} /></div>
                          <div style={{ flex: 1 }}><label style={S.miniLabel}>Time</label>
                            {d.allDay ? (
                              <button style={{ ...S.input, textAlign: "left", cursor: "pointer", color: P.dim }} onClick={() => patchDraft(d._id, { allDay: false })}>All day</button>
                            ) : (
                              <input style={S.input} type="time" value={d.start_time} onChange={(e) => patchDraft(d._id, { start_time: e.target.value })} />
                            )}</div>
                        </div>
                        <div style={{ ...S.chips, marginTop: 8 }}>
                          {WHO.map((ww) => (
                            <button key={ww.id} style={{ ...S.chip, ...(d.who === ww.id ? { background: ww.color, color: "#0b0b0d", borderColor: ww.color } : {}) }}
                              onClick={() => patchDraft(d._id, { who: ww.id })}>{ww.name}</button>
                          ))}
                        </div>
                        {d.location && <div style={{ fontSize: 12, color: P.dim, marginTop: 6 }}>{d.location}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={S.btnRow}>
                <button style={S.primary} disabled={saving} onClick={saveDrafts}>{saving ? "Saving…" : `Add ${drafts.filter((d) => d.include).length} to calendar`}</button>
                <button style={S.secondary} onClick={() => setDrafts(null)}>Discard</button>
              </div>
            </div>
          )}

          {/* dinner */}
          {!drafts && (
            <div style={S.meal}>
              <Glyph name="dinner" size={17} color={P.gold} />
              <input style={S.mealInput} value={mealText} onChange={(e) => setMealText(e.target.value)} onBlur={saveMeal}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} placeholder="What's for dinner?" />
            </div>
          )}

          {/* event editor */}
          {editing && (
            <div style={S.editor}>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>{editing.id ? "Edit event" : "New event"}</div>
              <label style={S.label}>What is it?</label>
              <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Baseball practice" />
              <label style={S.label}>Who</label>
              <div style={S.chips}>
                {WHO.map((w) => (
                  <button key={w.id} style={{ ...S.chip, ...(who === w.id ? { background: w.color, color: "#0b0b0d", borderColor: w.color } : {}) }}
                    onClick={() => setWho(w.id)}>{w.name}</button>
                ))}
              </div>
              <label style={S.label}>Type</label>
              <div style={S.chips}>
                {CATS.map((c) => (
                  <button key={c} style={{ ...S.chip, ...(cat === c ? S.chipOn : {}) }} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
              <label style={S.toggle}><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ accentColor: P.gold }} /><span>All day</span></label>
              {!allDay && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}><label style={S.label}>Starts</label>
                    <input style={S.input} type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div style={{ flex: 1 }}><label style={S.label}>Ends (optional)</label>
                    <input style={S.input} type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </div>
              )}
              <label style={S.label}>Where (optional)</label>
              <input style={S.input} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Laurel Park field 3" />
              <div style={S.btnRow}>
                <button style={S.primary} onClick={saveEvent}>Save</button>
                <button style={S.secondary} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* events on this day */}
          {!drafts && !editing && (dayEvents.length === 0 ? (
            selMoney.length === 0 && <div style={S.empty}>Nothing scheduled. Tap Add to put something on the calendar.</div>
          ) : dayEvents.map((e) => {
            const w = whoOf(e.who);
            return (
              <div key={e.id} style={{ ...S.evRow, borderLeft: `4px solid ${w.color}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.evTitle}>{e.title}</div>
                  <div style={S.evMeta}>
                    <span style={{ color: w.color, fontWeight: 700 }}>{w.name}</span>
                    <span>· {e.start_time ? prettyTime(e.start_time) : "All day"}{e.end_time ? ` – ${prettyTime(e.end_time)}` : ""}</span>
                    {e.category && e.category !== "Other" && <span>· {e.category}</span>}
                    {e.location && <span>· {e.location}</span>}
                  </div>
                </div>
                <button style={S.xBtn} aria-label="Edit event" onClick={() => startEdit(e)}><Glyph name="edit" size={17} /></button>
                <button style={{ ...S.xBtn, color: P.red }} aria-label="Delete event" onClick={() => removeEvent(e)}><Glyph name="trash" size={17} /></button>
              </div>
            );
          }))}
        </div>
        <div style={{ height: 40 }} />
      </div>
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

/* ---- stroke icons, matching the home and Money screens ---- */
const GLYPHS = {
  back: <path d="M15 6l-6 6 6 6" />, left: <path d="M15 6l-6 6 6 6" />, right: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />, close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  dinner: <><path d="M4 3v8a2 2 0 0 0 2 2h1v8M7 3v6M10 3v8" /><path d="M18 21V3c-2 1.5-3 4-3 7v4h3" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 11h-4a2 2 0 0 0 0 4h4z" /></>,
  bill: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
};
function Glyph({ name, size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>{GLYPHS[name]}</svg>
  );
}

const P = { bg: "#0b0b0d", card: "#141418", card2: "#1b1b21", gold: "#d6a64e", goldHi: "#f0d49a", text: "#f0e6d2",
  dim: "#a5a5ae", faint: "#6e6e78", green: "#7fd6a0", amber: "#f2c46d", red: "#f28b82",
  line: "rgba(214,166,78,0.18)", lineSoft: "rgba(255,255,255,0.06)" };
const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const S = {
  screen: { minHeight: "100vh", width: "100%", background: `radial-gradient(120% 50% at 50% -10%, #17181c 0%, ${P.bg} 55%)`,
    color: P.text, fontFamily: font, WebkitTapHighlightColor: "transparent" },
  wrap: { maxWidth: 560, margin: "0 auto", padding: "0 14px" },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 6px" },
  backBtn: { display: "inline-flex", alignItems: "center", gap: 4, width: 78, background: "transparent", color: P.dim,
    border: `1px solid ${P.lineSoft}`, borderRadius: 999, padding: "8px 14px 8px 10px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  title: { margin: 0, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, fontWeight: 700, letterSpacing: 1,
    background: "linear-gradient(180deg,#f4dfae 0%,#d6a64e 55%,#a97c2e 100%)", WebkitBackgroundClip: "text",
    backgroundClip: "text", WebkitTextFillColor: "transparent", color: P.gold },
  banner: { background: "rgba(242,196,109,0.1)", border: "1px solid rgba(242,196,109,0.3)", color: P.amber,
    borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 10 },
  monthBar: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0 10px" },
  navBtn: { width: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: P.card,
    color: P.dim, border: `1px solid ${P.lineSoft}`, borderRadius: 12, cursor: "pointer" },
  monthName: { fontWeight: 800, fontSize: 18, color: P.text },
  todayBtn: { background: "none", border: "none", color: P.gold, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "3px 2px" },

  /* the grid runs edge to edge on a phone: every pixel of width goes to the words */
  gridWrap: { maxWidth: 760, margin: "0 auto", padding: "0 3px" },
  dowRow: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2, marginBottom: 3 },
  dowCell: { textAlign: "center", fontSize: 11, fontWeight: 800, color: P.faint, letterSpacing: 0.6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 },
  emptyCell: { minHeight: 92 },
  cell: { minHeight: 92, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 2, padding: "3px 2px 4px",
    background: P.card, border: `1px solid ${P.lineSoft}`, borderRadius: 7, cursor: "pointer", textAlign: "left",
    color: P.text, overflow: "hidden", minWidth: 0 },
  cellSel: { borderColor: P.gold, boxShadow: `inset 0 0 0 1px ${P.gold}`, background: "#1a1913" },
  cellTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 1px", minHeight: 20 },
  cellNum: { fontSize: 12.5, fontWeight: 800, color: P.dim, minWidth: 20, height: 20, lineHeight: "20px", textAlign: "center", borderRadius: 10 },
  cellNumToday: { background: P.gold, color: "#0b0b0d" },
  mealMark: { opacity: 0.85 },
  tag: { display: "block", borderRadius: 4, padding: "2px 3px", minWidth: 0 },
  tagText: { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word",
    fontSize: 10.5, lineHeight: "12.5px", maxHeight: 25, fontWeight: 600 },
  moreTag: { fontSize: 10, color: P.gold, fontWeight: 700, padding: "0 3px" },

  legend: { display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center", margin: "12px 0 14px" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: P.dim },
  dot: { width: 9, height: 9, borderRadius: "50%", display: "inline-block" },

  dayCard: { background: P.card, border: `1px solid ${P.lineSoft}`, borderRadius: 16, padding: 14 },
  dayHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 },
  dayTitle: { fontSize: 18, fontWeight: 800, color: P.text },
  todayTag: { display: "inline-block", marginTop: 4, fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
    color: "#0b0b0d", background: P.gold, borderRadius: 6, padding: "2px 7px" },
  iconSq: { width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", background: P.card2,
    border: `1px solid ${P.line}`, borderRadius: 12, cursor: "pointer" },
  iconSqOn: { background: P.gold, borderColor: P.gold },
  addBtn: { display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 14px", border: "none", borderRadius: 12,
    background: "linear-gradient(180deg,#e2b862,#c8953c)", color: "#1a140a", fontWeight: 800, fontSize: 14.5, cursor: "pointer" },

  moneyRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${P.lineSoft}`, fontSize: 14.5 },
  meal: { display: "flex", alignItems: "center", gap: 10, background: "#0f0f12", border: `1px solid ${P.line}`, borderRadius: 12,
    padding: "4px 12px", marginTop: 12 },
  mealInput: { flex: 1, background: "transparent", border: "none", color: P.text, fontSize: 15.5, padding: "10px 0", outline: "none" },
  evRow: { display: "flex", alignItems: "center", gap: 6, background: "#0f0f12", borderRadius: 12, padding: "10px 6px 10px 12px", marginTop: 10 },
  evTitle: { fontSize: 15.5, fontWeight: 700, color: P.text },
  evMeta: { display: "flex", flexWrap: "wrap", gap: 5, fontSize: 12.5, color: P.dim, marginTop: 3 },
  xBtn: { width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent",
    border: "none", color: P.dim, borderRadius: 10, cursor: "pointer", flexShrink: 0 },
  empty: { color: P.dim, fontSize: 13.5, textAlign: "center", padding: "22px 10px 8px" },

  editor: { background: "#0f0f12", border: `1px solid ${P.line}`, borderRadius: 14, padding: 14, marginTop: 12 },
  label: { display: "block", fontSize: 12.5, fontWeight: 700, color: P.dim, margin: "14px 0 5px" },
  miniLabel: { display: "block", fontSize: 11, fontWeight: 700, color: P.faint, margin: "8px 0 2px", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { width: "100%", boxSizing: "border-box", background: P.bg, color: P.text, border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 11, padding: "11px 12px", fontSize: 16, outline: "none", colorScheme: "dark", fontFamily: font },
  chips: { display: "flex", flexWrap: "wrap", gap: 7 },
  chip: { background: P.card2, color: P.dim, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999,
    padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  chipOn: { background: "rgba(214,166,78,0.2)", color: P.goldHi, borderColor: "rgba(214,166,78,0.55)" },
  toggle: { display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, color: P.text, marginTop: 14 },
  btnRow: { display: "flex", gap: 8, marginTop: 16 },
  primary: { flex: 1, background: "linear-gradient(180deg,#e2b862,#c8953c)", color: "#1a140a", border: "none", borderRadius: 12,
    padding: "13px 16px", fontSize: 15, fontWeight: 800, cursor: "pointer" },
  secondary: { flex: 1, background: P.card2, color: P.text, border: `1px solid ${P.line}`, borderRadius: 12,
    padding: "13px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" },

  noteInfo: { background: "rgba(214,166,78,0.08)", border: `1px solid ${P.line}`, color: P.goldHi, borderRadius: 10,
    padding: "9px 11px", fontSize: 13, marginTop: 8 },
  noteErr: { display: "flex", alignItems: "center", gap: 6, background: "rgba(242,139,130,0.1)", border: "1px solid rgba(242,139,130,0.3)",
    color: P.red, borderRadius: 10, padding: "4px 4px 4px 11px", fontSize: 13, marginTop: 8 },
  review: { background: "#0f0f12", border: `1px solid ${P.line}`, borderRadius: 14, padding: 14, marginTop: 10 },
  draft: { background: P.card, borderRadius: 12, padding: "8px 10px 12px", marginBottom: 10 },
  lowConf: { fontSize: 12, color: P.amber, background: "rgba(242,196,109,0.1)", border: "1px solid rgba(242,196,109,0.28)",
    borderRadius: 8, padding: "5px 8px", marginTop: 6 },

  toast: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(26px + env(safe-area-inset-bottom, 0px))",
    background: "#24242a", color: P.text, border: `1px solid ${P.line}`, borderRadius: 999, padding: "11px 18px",
    fontSize: 14, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", zIndex: 50, whiteSpace: "nowrap" },
};
