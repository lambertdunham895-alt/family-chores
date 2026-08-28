import React, { useState, useEffect, useCallback, useRef } from "react";

/* ============================================================
   FAMILY CALENDAR
   - month grid; tap a day to see / add events
   - one dinner per day (meal planning) alongside events
   - color-coded by who it belongs to
   ============================================================ */

const WHO = [
  { id: "family",  name: "Family", color: "#7c4adb" },
  { id: "adult_a", name: "Dad",    color: "#2c5f7c" },
  { id: "adult_b", name: "Mom",    color: "#3d7a4e" },
  { id: "kid",     name: "Nolan",  color: "#9c5a2c" },
];
const whoOf = (id) => WHO.find((w) => w.id === id) || WHO[0];

const CATS = ["School", "Sports", "Work", "Appointment", "Birthday", "Trip", "Other"];
const CAT_ICON = {
  School: "🎒", Sports: "⚾", Work: "💼", Appointment: "🏥",
  Birthday: "🎂", Trip: "✈️", Other: "📌",
};

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
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [supabase, credsMissing, cursor]);

  useEffect(() => {
    load();
    if (credsMissing) return;
    const ch = supabase.channel("cal-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, load)
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
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo, d));
  while (cells.length % 7 !== 0) cells.push(null);

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

  if (loading) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40 }}>📅</div>
        <div style={{ color: "#6b7c8c", marginTop: 12 }}>Loading the calendar…</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={onBack}>← Home</button>
        <h2 style={S.title}>📅 Calendar</h2>
        <div style={{ width: 70 }} />
      </div>

      {credsMissing && (
        <div style={S.banner}>⚠️ Supabase isn't configured — changes won't sync.</div>
      )}

      {/* ---- month switcher ---- */}
      <div style={S.monthBar}>
        <button style={S.navBtn} onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={S.monthName}>{MONTHS[mo]} {y}</div>
          <button style={S.todayBtn} onClick={() => {
            const t = new Date();
            setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
            setSelected(ymd(t));
          }}>jump to today</button>
        </div>
        <button style={S.navBtn} onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
      </div>

      {/* ---- grid ---- */}
      <div style={S.dowRow}>
        {DOW.map((d) => <div key={d} style={S.dowCell}>{d}</div>)}
      </div>
      <div style={S.grid}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} style={S.emptyCell} />;
          const key = ymd(d);
          const evs = evOn(key);
          const ml = mealOn(key);
          const isSel = key === selected;
          const isTod = sameDay(d, today);
          return (
            <button
              key={i}
              style={{
                ...S.cell,
                ...(isSel ? S.cellSel : {}),
                ...(isTod && !isSel ? S.cellToday : {}),
              }}
              onClick={() => { setSelected(key); setEditing(null); }}
            >
              <span style={{
                ...S.cellNum,
                ...(isSel ? { color: "#fff" } : {}),
                ...(isTod && !isSel ? { color: "#c0392b", fontWeight: 800 } : {}),
              }}>{d.getDate()}</span>
              <span style={S.dots}>
                {evs.slice(0, 3).map((e) => (
                  <span key={e.id} style={{ ...S.dot, background: whoOf(e.who).color }} />
                ))}
                {evs.length > 3 && <span style={{ ...S.dot, background: "#9aa8b5" }} />}
              </span>
              {ml && <span style={S.mealDot}>🍽</span>}
            </button>
          );
        })}
      </div>

      {/* ---- legend ---- */}
      <div style={S.legend}>
        {WHO.map((w) => (
          <span key={w.id} style={S.legendItem}>
            <span style={{ ...S.dot, background: w.color }} /> {w.name}
          </span>
        ))}
      </div>

      {/* ---- selected day ---- */}
      <div style={S.dayHead}>
        <div>
          <div style={S.dayTitle}>
            {DOW[selDate.getDay()]}, {MONTHS[selDate.getMonth()]} {selDate.getDate()}
          </div>
          {isToday && <span style={S.todayTag}>TODAY</span>}
        </div>
        {!editing && !drafts && (
          <div style={{ display: "flex", gap: 8 }}>
            {pushState !== "unsupported" && (
              <button
                style={{ ...S.bellBtn, ...(pushState === "on" ? S.bellOn : {}),
                         ...(pushBusy ? { opacity: 0.5 } : {}) }}
                disabled={pushBusy}
                title={pushState === "on" ? "Notifications on for this device"
                       : pushState === "blocked" ? "Notifications blocked in browser settings"
                       : "Turn on notifications for this device"}
                onClick={togglePush}
              >
                <BellIcon size={16} color={pushState === "on" ? "#fff" : "#6b7c8c"}
                          off={pushState !== "on"} />
              </button>
            )}
            <button
              style={{ ...S.scanBtn, ...(scanning ? { opacity: 0.6 } : {}) }}
              disabled={scanning}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              <ScanIcon size={15} color="#2c5f7c" />
              <span>{scanning ? "Reading…" : "Scan"}</span>
            </button>
            <button style={S.addBtn} onClick={startNew}>+ Add</button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onPickPhoto}
        style={{ display: "none" }}
      />

      {scanning && (
        <div style={S.scanNote}>
          Reading the photo… this takes a few seconds.
        </div>
      )}

      {scanError && !scanning && (
        <div style={S.errNote}>
          <span style={{ flex: 1 }}>{scanError}</span>
          <button style={S.iconBtn} onClick={() => setScanError(null)}>✕</button>
        </div>
      )}

      {/* ---- scan review ---- */}
      {drafts && (
        <div style={S.reviewCard}>
          <div style={{ fontWeight: 800, marginBottom: 4, color: "#2c5f7c" }}>
            Found {drafts.length} event{drafts.length === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 12, color: "#6b7c8c", marginBottom: 12 }}>
            Check the dates and times before saving. Uncheck anything you don't want.
          </div>

          {drafts.map((d) => {
            const w = whoOf(d.who);
            const low = d.confidence < 0.6;
            return (
              <div key={d._id} style={{
                ...S.draftRow,
                borderLeft: `5px solid ${d.include ? w.color : "#dce5ec"}`,
                opacity: d.include ? 1 : 0.5,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => patchDraft(d._id, { include: e.target.checked })}
                    style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      style={{ ...S.input, fontWeight: 600, padding: "8px 9px" }}
                      value={d.title}
                      onChange={(e) => patchDraft(d._id, { title: e.target.value })}
                    />

                    {low && (
                      <div style={S.lowConf}>Not fully sure about this one — double-check it</div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1.3 }}>
                        <label style={S.miniLabel}>Date</label>
                        <input
                          style={{ ...S.input, padding: "8px 9px", fontSize: 14 }}
                          type="date"
                          value={d.day}
                          onChange={(e) => patchDraft(d._id, { day: e.target.value })}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={S.miniLabel}>Time</label>
                        {d.allDay ? (
                          <button
                            style={{ ...S.input, padding: "8px 9px", fontSize: 13.5,
                              textAlign: "left", background: "#fff", cursor: "pointer", color: "#6b7c8c" }}
                            onClick={() => patchDraft(d._id, { allDay: false })}
                          >All day</button>
                        ) : (
                          <input
                            style={{ ...S.input, padding: "8px 9px", fontSize: 14 }}
                            type="time"
                            value={d.start_time}
                            onChange={(e) => patchDraft(d._id, { start_time: e.target.value })}
                          />
                        )}
                      </div>
                    </div>

                    <div style={{ ...S.chipRow, marginTop: 8 }}>
                      {WHO.map((ww) => (
                        <button key={ww.id}
                          style={{ ...S.chipSm, ...(d.who === ww.id
                            ? { background: ww.color, color: "#fff", borderColor: ww.color } : {}) }}
                          onClick={() => patchDraft(d._id, { who: ww.id })}
                        >{ww.name}</button>
                      ))}
                    </div>

                    {d.location && (
                      <div style={{ fontSize: 11.5, color: "#6b7c8c", marginTop: 6 }}>
                        📍 {d.location}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} disabled={saving} onClick={saveDrafts}>
              {saving ? "Saving…" : `Add ${drafts.filter((d) => d.include).length} to calendar`}
            </button>
            <button style={S.cancelBtn} onClick={() => setDrafts(null)}>Discard</button>
          </div>
        </div>
      )}

      {/* ---- dinner ---- */}
      <div style={S.mealCard}>
        <span style={{ fontSize: 18 }}>🍽</span>
        <input
          style={S.mealInput}
          value={mealText}
          onChange={(e) => setMealText(e.target.value)}
          onBlur={saveMeal}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          placeholder="What's for dinner?"
        />
      </div>

      {/* ---- event editor ---- */}
      {editing && (
        <div style={S.editCard}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {editing.id ? "Edit event" : "New event"}
          </div>
          <label style={S.label}>What is it?</label>
          <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Baseball practice" />

          <label style={S.label}>Who</label>
          <div style={S.chipRow}>
            {WHO.map((w) => (
              <button key={w.id}
                style={{ ...S.chip, ...(who === w.id ? { background: w.color, color: "#fff", borderColor: w.color } : {}) }}
                onClick={() => setWho(w.id)}>{w.name}</button>
            ))}
          </div>

          <label style={S.label}>Type</label>
          <div style={S.chipRow}>
            {CATS.map((c) => (
              <button key={c}
                style={{ ...S.chip, ...(cat === c ? S.chipOn : {}) }}
                onClick={() => setCat(c)}>{CAT_ICON[c]} {c}</button>
            ))}
          </div>

          <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>All day</span>
          </label>

          {!allDay && (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Starts</label>
                <input style={S.input} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Ends (optional)</label>
                <input style={S.input} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          )}

          <label style={S.label}>Where (optional)</label>
          <input style={S.input} value={loc} onChange={(e) => setLoc(e.target.value)}
            placeholder="e.g., Laurel Park field 3" />

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} onClick={saveEvent}>Save</button>
            <button style={S.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- event list ---- */}
      {drafts ? null : dayEvents.length === 0 && !editing ? (
        <div style={S.empty}>
          <div style={{ fontSize: 34 }}>🗓</div>
          <p style={{ color: "#6b7c8c", marginTop: 6, fontSize: 13.5 }}>
            Nothing scheduled. Tap "+ Add" to put something on the calendar.
          </p>
        </div>
      ) : (
        dayEvents.map((e) => {
          const w = whoOf(e.who);
          return (
            <div key={e.id} style={{ ...S.evRow, borderLeft: `5px solid ${w.color}` }}>
              <div style={{ flex: 1 }}>
                <div style={S.evTitle}>{CAT_ICON[e.category] || "📌"} {e.title}</div>
                <div style={S.evMeta}>
                  <span style={{ color: w.color, fontWeight: 700 }}>{w.name}</span>
                  <span>· {e.start_time ? prettyTime(e.start_time) : "All day"}</span>
                  {e.end_time && <span>– {prettyTime(e.end_time)}</span>}
                  {e.location && <span>· {e.location}</span>}
                </div>
              </div>
              <button style={S.iconBtn} onClick={() => startEdit(e)}>✎</button>
              <button style={{ ...S.iconBtn, color: "#c0392b" }} onClick={() => removeEvent(e)}>✕</button>
            </div>
          );
        })
      )}

      {toast && <div style={S.toast}>{toast}</div>}
      <div style={{ height: 40 }} />
    </div>
  );
}

const S = {
  app: { maxWidth: 560, margin: "0 auto", padding: "0 14px 40px",
    fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#1a2b3c" },
  center: { height: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", fontFamily: "system-ui" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 0", borderBottom: "2px solid #e3ebf0", marginBottom: 12 },
  title: { color: "#7c4adb", fontSize: 19, margin: 0, fontWeight: 800 },
  backBtn: { background: "none", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "6px 12px", color: "#2c5f7c", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  banner: { background: "#fff4e0", border: "1.5px solid #f0c97a", borderRadius: 10,
    padding: "10px 12px", fontSize: 12.5, color: "#8a5a1a", marginBottom: 12 },
  monthBar: { display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 10 },
  navBtn: { background: "#fff", border: "1.5px solid #c5d4de", borderRadius: 8,
    width: 40, height: 36, fontSize: 20, color: "#2c5f7c", cursor: "pointer", lineHeight: 1 },
  monthName: { fontWeight: 800, color: "#2c5f7c", fontSize: 17 },
  todayBtn: { background: "none", border: "none", color: "#3a7bd5", fontSize: 11.5,
    cursor: "pointer", textDecoration: "underline", padding: 2 },
  dowRow: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 },
  dowCell: { textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9aa8b5",
    textTransform: "uppercase", letterSpacing: 0.4 },
  grid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 },
  emptyCell: { aspectRatio: "1 / 1" },
  cell: { aspectRatio: "1 / 1", background: "#fff", border: "1.5px solid #e3ebf0",
    borderRadius: 9, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "flex-start", padding: "4px 2px", cursor: "pointer",
    position: "relative", overflow: "hidden" },
  cellSel: { background: "#2c5f7c", borderColor: "#2c5f7c" },
  cellToday: { borderColor: "#c0392b", borderWidth: 2 },
  cellNum: { fontSize: 13, fontWeight: 600, color: "#1a2b3c", lineHeight: 1.2 },
  dots: { display: "flex", gap: 2, marginTop: 3, flexWrap: "wrap", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  mealDot: { position: "absolute", bottom: 2, fontSize: 8, opacity: 0.8 },
  legend: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap",
    margin: "10px 0 14px", fontSize: 11.5, color: "#5a6b7a" },
  legendItem: { display: "flex", alignItems: "center", gap: 4 },
  dayHead: { display: "flex", justifyContent: "space-between", alignItems: "center",
    borderTop: "2px solid #e3ebf0", paddingTop: 12, marginBottom: 10 },
  dayTitle: { fontWeight: 800, fontSize: 16, color: "#2c5f7c" },
  todayTag: { fontSize: 9.5, fontWeight: 800, color: "#c0392b", background: "#fdeceb",
    padding: "2px 7px", borderRadius: 6, letterSpacing: 0.5 },
  addBtn: { background: "#7c4adb", color: "#fff", border: "none", borderRadius: 8,
    padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13.5 },
  mealCard: { display: "flex", alignItems: "center", gap: 10, background: "#fffdf5",
    border: "1.5px solid #f0d9a0", borderRadius: 10, padding: "8px 12px", marginBottom: 12 },
  mealInput: { flex: 1, border: "none", background: "transparent", fontSize: 14.5,
    outline: "none", color: "#1a2b3c" },
  editCard: { background: "#f8fbfd", border: "1.5px solid #c5d4de", borderRadius: 12,
    padding: 14, marginBottom: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7c8c",
    marginTop: 10, marginBottom: 4 },
  input: { width: "100%", padding: "10px", border: "1.5px solid #c5d4de",
    borderRadius: 8, fontSize: 15, boxSizing: "border-box" },
  chipRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  chip: { padding: "6px 11px", borderRadius: 20, border: "1.5px solid #dce5ec",
    background: "#fff", color: "#5a6b7a", fontWeight: 600, fontSize: 12, cursor: "pointer" },
  chipOn: { background: "#2c5f7c", color: "#fff", borderColor: "#2c5f7c" },
  saveBtn: { flex: 1, background: "#2c5f7c", color: "#fff", border: "none",
    borderRadius: 8, padding: "11px 0", fontWeight: 700, cursor: "pointer" },
  cancelBtn: { flex: 1, background: "#fff", color: "#6b7c8c", border: "1.5px solid #c5d4de",
    borderRadius: 8, padding: "11px 0", fontWeight: 600, cursor: "pointer" },
  evRow: { display: "flex", alignItems: "center", gap: 8, background: "#fff",
    border: "1.5px solid #e3ebf0", borderRadius: 10, padding: "10px 10px", marginBottom: 8 },
  evTitle: { fontSize: 15, fontWeight: 600 },
  evMeta: { fontSize: 11.5, color: "#6b7c8c", marginTop: 3,
    display: "flex", gap: 4, flexWrap: "wrap" },
  iconBtn: { background: "none", border: "none", fontSize: 14, cursor: "pointer",
    padding: "4px 5px", opacity: 0.6 },
  empty: { textAlign: "center", padding: "30px 20px" },
  bellBtn: { display: "flex", alignItems: "center", justifyContent: "center",
    background: "#fff", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "8px 10px", cursor: "pointer" },
  bellOn: { background: "#2c5f7c", borderColor: "#2c5f7c" },
  scanBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff",
    color: "#2c5f7c", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13.5 },
  scanNote: { background: "#eef6fb", border: "1.5px solid #bcd9ea", borderRadius: 10,
    padding: "10px 12px", fontSize: 13, color: "#2c5f7c", marginBottom: 12, fontWeight: 600 },
  errNote: { display: "flex", alignItems: "center", gap: 8, background: "#fdeceb",
    border: "1.5px solid #f0b4ae", borderRadius: 10, padding: "10px 12px",
    fontSize: 12.5, color: "#a03027", marginBottom: 12 },
  reviewCard: { background: "#f8fbfd", border: "1.5px solid #c5d4de", borderRadius: 12,
    padding: 14, marginBottom: 14 },
  draftRow: { background: "#fff", border: "1.5px solid #e3ebf0", borderRadius: 10,
    padding: "10px 10px", marginBottom: 10 },
  miniLabel: { display: "block", fontSize: 10.5, fontWeight: 700, color: "#9aa8b5",
    textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  chipSm: { padding: "5px 10px", borderRadius: 20, border: "1.5px solid #dce5ec",
    background: "#fff", color: "#5a6b7a", fontWeight: 600, fontSize: 11.5, cursor: "pointer" },
  lowConf: { fontSize: 11, color: "#a06a10", background: "#fff6e3",
    border: "1px solid #f0d9a0", borderRadius: 6, padding: "4px 7px", marginTop: 6 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    background: "#1a2b3c", color: "#fff", padding: "11px 20px", borderRadius: 30,
    fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100, fontSize: 14 },
};
