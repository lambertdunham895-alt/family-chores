import React, { useState, useEffect, useCallback } from "react";
import { fetchMonth, computeMonth, monthKey, todayIso, daysInMonth, dayOf, money, paydaysBetween, landedNear } from "./moneyMath.js";

/* =====================================================================
   This Week — the next seven days at a glance on the home screen:
   events, bills coming due, dinners, and what's safe to spend.
   ===================================================================== */

const WHO = {
  family: { name: "Family", color: "#b39ddb" }, adult_a: { name: "Dad", color: "#7ea6c9" },
  adult_b: { name: "Mom", color: "#ff7eb6" }, kid: { name: "Nolan", color: "#4dd4e8" },
};
const C = { gold: "#d6a64e", goldHi: "#f0d49a", text: "#f0e6d2", dim: "#a5a5ae", faint: "#6e6e78",
  green: "#7fd6a0", amber: "#f2c46d", red: "#f28b82", line: "rgba(214,166,78,0.20)", lineSoft: "rgba(255,255,255,0.06)" };

function prettyTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function dayName(d, i) {
  if (i === 0) return "Today";
  if (i === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

const PATHS = {
  bill: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  dinner: <><path d="M4 3v8a2 2 0 0 0 2 2h1v8M7 3v6M10 3v8" /><path d="M18 21V3c-2 1.5-3 4-3 7v4h3" /></>,
  right: <path d="M9 6l6 6-6 6" />,
  alert: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></>,
  pay: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 11h-4a2 2 0 0 0 0 4h4z" /></>,
};
function Ico({ name, size = 15, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>{PATHS[name]}</svg>
  );
}

export default function ThisWeek({ supabase, credsMissing, onOpenCalendar, onOpenMoney }) {
  const [data, setData] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (credsMissing || !supabase) return;
    const now = new Date(), end = addDays(now, 6);
    const p0 = monthKey(now), p1 = monthKey(end);
    try {
      const [ev, ml, m0, pay1] = await Promise.all([
        supabase.from("events").select("*").gte("day", todayIso(now)).lte("day", todayIso(end)),
        supabase.from("meals").select("*").gte("day", todayIso(now)).lte("day", todayIso(end)),
        fetchMonth(supabase, p0),
        // the week can run into next month, whose bills have their own paid/unpaid state
        p1 !== p0 ? supabase.from("bill_payments").select("*").eq("period_key", p1) : Promise.resolve({ data: [] }),
      ]);
      setData({ events: ev.data || [], meals: ml.data || [], m0, pay1: pay1.data || [], p0, p1 });
    } catch (e) { console.error(e); setData({ error: true }); }
  }, [supabase, credsMissing]);

  useEffect(() => {
    load();
    if (credsMissing || !supabase) return;
    let ch = supabase.channel("thisweek-sync");
    for (const t of ["events", "meals", "bills", "bill_payments", "income", "spending", "budgets", "savings_goals", "savings_moves", "pay_schedules"])
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, load);
    ch.subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, supabase, credsMissing]);

  if (!data) return <div style={S.card}><div style={S.muted}>Loading this week…</div></div>;
  if (data.error) return null;

  const now = new Date();
  const M = computeMonth(data.m0, data.p0, now);
  const paidIn = (bill, period) => (period === data.p0 ? data.m0.payments : data.pay1).some((p) => p.bill_id === bill.id);

  // a bill's due date in a given month; a 31st bill falls on the last day of a short month
  const dueOn = (bill, d) => {
    const key = monthKey(d);
    if (bill.recurrence === "once") return bill.due_date === todayIso(d);
    return Math.min(dayOf(bill), daysInMonth(key)) === d.getDate();
  };

  // unpaid bills from earlier this month (a one-time bill only counts in its own month)
  const overdue = data.m0.bills.filter((b) => {
    if (b.recurrence === "once" && (b.due_date || "").slice(0, 7) !== data.p0) return false;
    return !paidIn(b, data.p0) && Math.min(dayOf(b), daysInMonth(data.p0)) < now.getDate();
  });

  const pays = paydaysBetween(data.m0.paySchedules, todayIso(now), todayIso(addDays(now, 6)));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(now, i), iso = todayIso(d), key = monthKey(d);
    const events = data.events.filter((e) => e.day === iso).sort((a, b) =>
      (!a.start_time && b.start_time) ? -1 : (a.start_time && !b.start_time) ? 1 : (a.start_time || "").localeCompare(b.start_time || ""));
    const bills = data.m0.bills.filter((b) => dueOn(b, d) && !paidIn(b, key));
    const dinner = (data.meals.find((m) => m.day === iso) || {}).dinner;
    const paydays = pays.filter((p) => p.date === iso).map((p) => ({ ...p, landed: landedNear(data.m0.income, p.who, iso) }));
    days.push({ i, d, iso, events, bills, dinner, paydays, empty: !events.length && !bills.length && !dinner && !paydays.length });
  }
  const busy = days.filter((x) => !x.empty);
  const shown = showAll ? days : busy.slice(0, 4);
  const hidden = days.length - shown.length;
  const weekBills = days.reduce((t, x) => t + x.bills.reduce((s, b) => s + Number(b.amount || 0), 0), 0);

  return (
    <div style={S.card}>
      <div style={S.head}>
        <span style={S.title}>This week</span>
        {weekBills > 0 && <span style={S.headNote}>{money(weekBills)} in bills due</span>}
      </div>

      {data.m0.moneyReady && (
        <button style={S.safe} onClick={() => onOpenMoney && onOpenMoney("overview")}>
          {M.incomeTotal > 0 ? (
            <>
              <span style={S.safeLbl}>Safe to spend this month</span>
              <span style={{ ...S.safeNum, color: M.safeToSpend >= 0 ? C.green : C.red }}>
                {M.safeToSpend >= 0 ? money(M.safeToSpend) : `Short ${money(-M.safeToSpend)}`}
              </span>
            </>
          ) : (
            <span style={S.safeLbl}>Log a paycheck to see what's safe to spend</span>
          )}
          <Ico name="right" color={C.faint} />
        </button>
      )}

      {overdue.length > 0 && overdue.map((b) => (
        <button key={b.id} style={S.overdue} onClick={() => onOpenMoney && onOpenMoney("bills")}>
          <Ico name="alert" color={C.red} />
          <span style={{ flex: 1, textAlign: "left" }}>{b.name} is overdue</span>
          <span>{money(b.amount)}</span>
        </button>
      ))}

      {busy.length === 0 && !showAll ? (
        <div style={S.muted}>Nothing on the calendar and no bills due in the next seven days.</div>
      ) : shown.map((x) => (
        <div key={x.iso} style={S.day}>
          <div style={S.dayHead}>
            <span style={{ color: x.i === 0 ? C.goldHi : C.text }}>{dayName(x.d, x.i)}</span>
            <span style={S.dayDate}>{x.d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
          {x.empty && <div style={S.quiet}>Nothing planned</div>}
          {x.paydays.map((p) => (
            <button key={p.who} style={S.item} onClick={() => onOpenMoney && onOpenMoney("overview")}>
              <Ico name="pay" size={14} color={C.green} />
              <span style={{ ...S.what, color: C.green }}>{(WHO[p.who] || WHO.family).name} {p.landed ? "paid" : "payday"}</span>
              {p.landed && <span style={{ ...S.amt, color: C.green }}>+{money(p.landed.amount)}</span>}
            </button>
          ))}
          {x.events.map((e) => (
            <button key={e.id} style={S.item} onClick={onOpenCalendar}>
              <span style={{ ...S.dot, background: (WHO[e.who] || WHO.family).color }} />
              <span style={S.time}>{e.start_time ? prettyTime(e.start_time) : "All day"}</span>
              <span style={S.what}>{e.title}</span>
            </button>
          ))}
          {x.bills.map((b) => (
            <button key={b.id} style={S.item} onClick={() => onOpenMoney && onOpenMoney("bills")}>
              <Ico name="bill" size={14} color={C.amber} />
              <span style={{ ...S.what, color: C.amber }}>{b.name} due</span>
              <span style={S.amt}>{money(b.amount)}{b.variable ? " est." : ""}</span>
            </button>
          ))}
          {x.dinner && (
            <button style={S.item} onClick={onOpenCalendar}>
              <Ico name="dinner" size={14} color={C.dim} />
              <span style={{ ...S.what, color: C.dim }}>Dinner: {x.dinner}</span>
            </button>
          )}
        </div>
      ))}

      <div style={S.foot}>
        {(hidden > 0 || showAll) && (
          <button style={S.link} onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all 7 days"}</button>
        )}
        <span style={{ flex: 1 }} />
        <button style={S.link} onClick={onOpenCalendar}>Calendar</button>
        <button style={S.link} onClick={() => onOpenMoney && onOpenMoney("overview")}>Money</button>
      </div>
    </div>
  );
}

const S = {
  card: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", textAlign: "left", background: "linear-gradient(160deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.018) 100%)",
    border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 8px", marginBottom: 14, color: C.text,
    boxShadow: "0 6px 20px rgba(0,0,0,0.45)" },
  head: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  title: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 18, fontWeight: 700, color: C.goldHi, letterSpacing: 0.4 },
  headNote: { fontSize: 12.5, color: C.dim },
  safe: { display: "flex", alignItems: "center", gap: 10, width: "100%", background: "rgba(214,166,78,0.08)",
    border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 12px", marginBottom: 8, cursor: "pointer", color: C.text },
  safeLbl: { flex: 1, textAlign: "left", fontSize: 13, color: C.dim },
  safeNum: { fontSize: 17, fontWeight: 800 },
  overdue: { display: "flex", alignItems: "center", gap: 10, width: "100%", background: "rgba(242,139,130,0.08)",
    border: "1px solid rgba(242,139,130,0.28)", color: C.red, borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    fontSize: 14, fontWeight: 700, cursor: "pointer" },
  day: { borderTop: `1px solid ${C.lineSoft}`, padding: "10px 0 6px" },
  dayHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", fontWeight: 800, fontSize: 14.5, marginBottom: 4 },
  dayDate: { fontSize: 12, color: C.faint, fontWeight: 600 },
  quiet: { fontSize: 13, color: C.faint, padding: "4px 0" },
  item: { display: "flex", alignItems: "center", gap: 9, width: "100%", background: "transparent", border: "none",
    color: C.text, padding: "7px 0", fontSize: 14, cursor: "pointer", textAlign: "left" },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  time: { fontSize: 12.5, color: C.dim, width: 62, flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  what: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  amt: { fontWeight: 700, color: C.text, whiteSpace: "nowrap" },
  muted: { fontSize: 13.5, color: C.dim, padding: "6px 0 10px", lineHeight: 1.45 },
  foot: { display: "flex", alignItems: "center", gap: 4, borderTop: `1px solid ${C.lineSoft}`, marginTop: 4, paddingTop: 4 },
  link: { background: "none", border: "none", color: C.gold, fontSize: 13, fontWeight: 700, padding: "8px 8px", cursor: "pointer" },
};
