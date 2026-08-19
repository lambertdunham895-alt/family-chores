import React, { useState, useEffect, useCallback } from "react";

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
      } else {
        const { data, error } = await supabase.from("events").insert(payload).select().single();
        if (error) throw error;
        setEvents((p) => [...p, data]);
        flash("Event added");
      }
      setEditing(null);
    } catch (e) { console.error(e); flash("Couldn't save"); load(); }
  };

  const removeEvent = async (e) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    setEvents((p) => p.filter((x) => x.id !== e.id));
    try { await supabase.from("events").delete().eq("id", e.id); }
    catch (err) { console.error(err); load(); }
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
        {!editing && <button style={S.addBtn} onClick={startNew}>+ Add</button>}
      </div>

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
      {dayEvents.length === 0 && !editing ? (
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
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    background: "#1a2b3c", color: "#fff", padding: "11px 20px", borderRadius: 30,
    fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100, fontSize: 14 },
};
