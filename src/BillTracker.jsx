import React, { useState, useEffect, useCallback, useRef } from "react";

/* =====================================================================
   Money — household cash flow: paychecks, spending, budgets, bills, savings.
   Dark + gold to match the home screen. Everything syncs live between phones.
   ===================================================================== */

const CATS = ["Housing", "Utilities", "Insurance", "Vehicle", "Debt", "Subscriptions", "Other"];
const CAT_COLOR = {
  Housing: "#7ea6c9", Utilities: "#e0b45c", Insurance: "#7fc29b", Vehicle: "#b39ddb",
  Debt: "#f28b82", Subscriptions: "#6cc6c6", Other: "#9a9aa3",
};
const PEOPLE = [{ id: "adult_a", name: "Dad" }, { id: "adult_b", name: "Mom" }];
const personName = (id) => (PEOPLE.find((p) => p.id === id) || { name: "Family" }).name;
const SPEND_CATS = ["Groceries", "Gas", "Eating out", "Kids", "Household", "Medical", "Fun", "Other"];
const SPEND_COLOR = {
  Groceries: "#7fc29b", Gas: "#e0b45c", "Eating out": "#f28b82", Kids: "#b39ddb",
  Household: "#7ea6c9", Medical: "#6cc6c6", Fun: "#e58fb5", Other: "#9a9aa3",
};

/* palette */
const C = {
  bg: "#0b0b0d", card: "#141418", card2: "#1b1b21", line: "rgba(214,166,78,0.16)",
  lineSoft: "rgba(255,255,255,0.06)", gold: "#d6a64e", goldHi: "#f0d49a",
  text: "#f0e6d2", dim: "#a5a5ae", faint: "#6e6e78",
  green: "#7fd6a0", amber: "#f2c46d", red: "#f28b82",
};

/* ---------- dates (local time only — never toISOString, which drifts across midnight UTC) ---------- */
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const isYmd = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
function inPeriod(bill, period) {
  if (bill.recurrence !== "once") return true;
  return (bill.due_date || "").slice(0, 7) === period;
}
function dayOf(bill) {
  if (bill.recurrence === "once" && bill.due_date) return Number(bill.due_date.slice(8, 10));
  return bill.due_day;
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function money(n) {
  const v = Number(n || 0);
  return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[$,]/g, "")); return isNaN(n) ? null : n; };

/* ---------- photos for the scanner: text needs more detail than a product shot ---------- */
function compressForOCR(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image"));
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
/* supabase-js hides an edge function's error body behind a generic message — dig it out */
async function realError(error, data) {
  if (data && data.error) return data.error;
  try {
    if (error && error.context && typeof error.context.json === "function") {
      const body = await error.context.json(); if (body && body.error) return body.error;
    }
  } catch (e) { /* fall through */ }
  return (error && error.message) || "Scan failed.";
}
function copyText(t) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); return; } } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
  } catch (e) { /* nothing more to try */ }
}

/* ---------- one icon set, stroke style, matching the home screen ---------- */
const ICONS = {
  back: <path d="M15 6l-6 6 6 6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 11h-4a2 2 0 0 0 0 4h4z" /></>,
  cart: <><path d="M3 4h2l2.4 10.4A2 2 0 0 0 9.3 16h7.9a2 2 0 0 0 2-1.6L21 7H6" /><circle cx="10" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></>,
  receipt: <><path d="M6 3l1.5 1.4L9 3l1.5 1.4L12 3l1.5 1.4L15 3l1.5 1.4L18 3v16.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5z" /><path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3" /></>,
  piggy: <><path d="M19 9c1 .5 2 1.6 2 3v2h-2l-1 3h-3v-2H9v2H6l-1-3a6 6 0 0 1 5-9h4a6 6 0 0 1 5 4z" /><path d="M16 11h.01" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>,
  bill: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  alert: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  backspace: <><path d="M21 5H9l-6 7 6 7h12z" /><path d="M17 9l-6 6M11 9l6 6" /></>,
  chevDown: <path d="M6 9l6 6 6-6" />,
};
function Icon({ name, size = 18, color = "currentColor", stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
      {ICONS[name]}
    </svg>
  );
}

export default function BillTracker({ supabase, profile, onBack, credsMissing, startWith, onStarted }) {
  /* ---- data ---- */
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [income, setIncome] = useState([]);
  const [spending, setSpending] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [moves, setMoves] = useState([]);
  const [moneyReady, setMoneyReady] = useState(true);
  const [period, setPeriod] = useState(monthKey());
  const [loading, setLoading] = useState(true);

  /* ---- ui ---- */
  const [tab, setTab] = useState("overview");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [ql, setQl] = useState(null);                 // quick-log sheet
  const [sheet, setSheet] = useState(null);           // action menu {title, actions}
  const [toast, setToast] = useState(null);           // {msg, undo?}
  const toastTimer = useRef(null);
  const receiptRef = useRef(null);
  const billScanRef = useRef(null);
  const [reading, setReading] = useState(null);       // "receipt" | "bill" while scanning

  /* bill form */
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState(""); const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("1"); const [cat, setCat] = useState("Utilities");
  const [autopay, setAutopay] = useState(false); const [recurrence, setRecurrence] = useState("monthly");
  const [dueDate, setDueDate] = useState(""); const [variable, setVariable] = useState(false);
  const [acctNum, setAcctNum] = useState(""); const [phone, setPhone] = useState(""); const [notes, setNotes] = useState("");
  const [scanNote, setScanNote] = useState(null);
  const [details, setDetails] = useState(null);
  const [history, setHistory] = useState(null);
  const [askAmount, setAskAmount] = useState(null);

  /* budgets + savings forms */
  const [budgetDraft, setBudgetDraft] = useState(null);
  const [goalForm, setGoalForm] = useState(null);
  const [moving, setMoving] = useState(null);

  const flash = (msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 4500 : 2000);
  };

  /* ---------- load + live sync ---------- */
  const load = useCallback(async () => {
    if (credsMissing) { setLoading(false); return; }
    try {
      const [b, p] = await Promise.all([
        supabase.from("bills").select("*").eq("active", true).order("due_day", { ascending: true }),
        supabase.from("bill_payments").select("*").eq("period_key", period),
      ]);
      setBills(b.data || []); setPayments(p.data || []);
    } catch (e) { console.error(e); }
    try {
      const [inc, spd] = await Promise.all([
        supabase.from("income").select("*").eq("period_key", period).order("received_on", { ascending: false }),
        supabase.from("spending").select("*").eq("period_key", period).order("spent_on", { ascending: false }),
      ]);
      if (inc.error || spd.error) setMoneyReady(false);
      else { setMoneyReady(true); setIncome(inc.data || []); setSpending(spd.data || []); }
    } catch (e) { console.error(e); setMoneyReady(false); }
    try {
      const [bg, gl, mv] = await Promise.all([
        supabase.from("budgets").select("*"),
        supabase.from("savings_goals").select("*").eq("active", true).order("created_at", { ascending: true }),
        supabase.from("savings_moves").select("*"),
      ]);
      if (!bg.error) setBudgets(bg.data || []);
      if (!gl.error) setGoals(gl.data || []);
      if (!mv.error) setMoves(mv.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [supabase, credsMissing, period]);

  useEffect(() => {
    load();
    if (credsMissing) return;
    let ch = supabase.channel("money-sync");
    for (const t of ["bills", "bill_payments", "income", "spending", "budgets", "savings_goals", "savings_moves"])
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, load);
    ch.subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, supabase, credsMissing]);

  /* opened from the home screen's "Log spending" shortcut */
  useEffect(() => {
    if (startWith === "quicklog" && !loading) { openQuickLog("spend"); onStarted && onStarted(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith, loading]);

  const myId = PEOPLE.some((p) => p.id === profile?.id) ? profile.id : "adult_a";
  const defaultDate = () => (period === monthKey() ? todayIso() : `${period}-01`);

  /* ================= quick log ================= */
  // most-used categories first, so the usual one is under your thumb
  const catOrder = (() => {
    const n = {}; spending.forEach((r) => { n[r.category] = (n[r.category] || 0) + 1; });
    return [...SPEND_CATS].sort((a, b) => (n[b] || 0) - (n[a] || 0) || SPEND_CATS.indexOf(a) - SPEND_CATS.indexOf(b));
  })();
  // default to the category you use most — a wrong guess gets filed silently if you forget to tap
  const lastCat = spending.length ? catOrder[0] : "Groceries";

  function openQuickLog(mode) {
    const base = { mode, amount: "", category: lastCat, who: myId, date: defaultDate(), note: "",
      showMore: false, receipt: null };
    setQl(base);
    if (mode === "income") prefillPay(myId);
  }
  async function prefillPay(who) {
    try {
      const { data } = await supabase.from("income").select("amount").eq("who", who)
        .order("received_on", { ascending: false }).limit(1);
      if (data && data[0]) setQl((q) => (q && q.mode === "income" && q.who === who && !q.amount
        ? { ...q, amount: String(Number(data[0].amount)), prefilled: true } : q));
    } catch (e) { /* a blank amount is fine */ }
  }
  function keypad(k) {
    setQl((q) => {
      let a = q.prefilled ? "" : q.amount;
      if (k === "⌫") a = a.slice(0, -1);
      else if (k === ".") { if (!a.includes(".")) a = (a || "0") + "."; }
      else {
        if (a.includes(".") && a.split(".")[1].length >= 2) return q;
        if (!a.includes(".") && a.replace(/^0+/, "").length >= 6) return q;
        a = a === "0" ? k : a + k;
      }
      return { ...q, amount: a, prefilled: false };
    });
  }
  async function saveQuickLog() {
    const amt = num(ql.amount);
    if (amt == null || amt <= 0) { flash("Enter an amount"); return; }
    if (!isYmd(ql.date)) { flash("Pick a date"); return; }
    const pk = ql.date.slice(0, 7), isIn = ql.mode === "income";
    const row = isIn
      ? { received_on: ql.date, period_key: pk, who: ql.who, amount: amt, note: ql.note.trim() || null, created_by: profile?.id || null }
      : { spent_on: ql.date, period_key: pk, who: ql.who, category: ql.category, amount: amt, note: ql.note.trim() || null, created_by: profile?.id || null };
    const table = isIn ? "income" : "spending";
    try {
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (error) throw error;
      if (pk === period) (isIn ? setIncome : setSpending)((l) => [data, ...l]);
      setQl(null);
      const label = isIn ? `Paycheck logged · ${money(amt)}` : `${money(amt)} · ${ql.category}`;
      flash(pk === period ? label : `${label} — saved to ${monthLabel(pk)}`, async () => {
        (isIn ? setIncome : setSpending)((l) => l.filter((r) => r.id !== data.id));
        setToast(null);
        try { await supabase.from(table).delete().eq("id", data.id); } catch (e) { load(); }
      });
    } catch (e) { console.error(e); flash("Couldn't save"); }
  }
  async function deleteEntry(kind, row) {
    const table = kind === "income" ? "income" : "spending";
    (kind === "income" ? setIncome : setSpending)((l) => l.filter((r) => r.id !== row.id));
    try { await supabase.from(table).delete().eq("id", row.id); } catch (e) { console.error(e); load(); }
    flash("Deleted", async () => {
      setToast(null);
      const { id, ...rest } = row;
      try { await supabase.from(table).insert(rest); load(); } catch (e) { console.error(e); }
    });
  }

  /* receipt -> fills the quick-log sheet */
  async function onPickReceipt(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    setReading("receipt");
    try {
      const b64 = await compressForOCR(file);
      const { data, error } = await supabase.functions.invoke("scan-doc",
        { body: { image_base64: b64, media_type: "image/jpeg", mode: "receipt", today: todayIso() } });
      if (error || (data && data.error)) throw new Error(await realError(error, data));
      const r = Array.isArray(data && data.results) ? data.results[0] : null;
      if (!r) throw new Error("Couldn't read that receipt.");
      const total = typeof r.total === "number" && isFinite(r.total) && r.total > 0 ? r.total : null;
      const conf = typeof r.confidence === "number" ? r.confidence : 1;
      setQl({ mode: "spend", who: myId,
        amount: total == null ? "" : total.toFixed(2),
        category: SPEND_CATS.includes(r.category) ? r.category : "Other",
        date: isYmd(r.date) ? r.date : todayIso(),
        note: typeof r.merchant === "string" ? r.merchant.trim().slice(0, 40) : "",
        showMore: true,
        receipt: total == null ? { tone: "warn", text: "Couldn't read the total — type it from the receipt." }
          : conf < 0.6 ? { tone: "warn", text: "Not fully sure — check the total against the receipt." }
          : { tone: "ok", text: "Read from your receipt. Check it, then save." } });
    } catch (err) { console.error(err); flash(err.message || "Couldn't read that receipt"); }
    setReading(null);
  }

  /* ================= bills ================= */
  const paidMap = {}; payments.forEach((p) => { paidMap[p.bill_id] = p; });
  const isPaid = (b) => !!paidMap[b.id];
  const markPaid = async (bill, amt) => {
    const row = { bill_id: bill.id, period_key: period, paid: true, amount_paid: amt, paid_by: profile?.id || null };
    setPayments((p) => [...p.filter((x) => x.bill_id !== bill.id), { ...row, id: `tmp${Date.now()}` }]);
    try { await supabase.from("bill_payments").upsert(row, { onConflict: "bill_id,period_key" }); }
    catch (e) { console.error(e); flash("Couldn't save"); load(); }
  };
  const togglePaid = async (bill) => {
    if (isPaid(bill)) {
      setPayments((p) => p.filter((x) => x.bill_id !== bill.id));
      try { await supabase.from("bill_payments").delete().match({ bill_id: bill.id, period_key: period }); }
      catch (e) { console.error(e); }
      return;
    }
    if (bill.variable) { setAskAmount({ bill, value: String(bill.amount ?? "") }); return; }
    markPaid(bill, bill.amount);
    flash(`${bill.name} paid · ${money(bill.amount)}`);
  };
  const confirmAmount = async () => {
    const { bill, value } = askAmount; const amt = num(value);
    if (amt == null || amt < 0) { flash("Enter a valid amount"); return; }
    setAskAmount(null); await markPaid(bill, amt);
    flash(`${bill.name} paid · ${money(amt)}`);
    if (Math.abs(amt - Number(bill.amount || 0)) > 0.005) {
      setBills((p) => p.map((b) => (b.id === bill.id ? { ...b, amount: amt } : b)));
      try { await supabase.from("bills").update({ amount: amt }).eq("id", bill.id); } catch (e) { console.error(e); }
    }
  };
  const openHistory = async (bill) => {
    setHistory({ bill, rows: null });
    try {
      const { data } = await supabase.from("bill_payments").select("period_key, amount_paid, paid_at")
        .eq("bill_id", bill.id).order("period_key", { ascending: false }).limit(12);
      setHistory({ bill, rows: data || [] });
    } catch (e) { console.error(e); setHistory({ bill, rows: [] }); }
  };
  const startNew = () => {
    setScanNote(null); setEditing({}); setName(""); setAmount(""); setDueDay("1"); setCat("Utilities");
    setAutopay(false); setVariable(false); setRecurrence("monthly"); setAcctNum(""); setPhone(""); setNotes("");
    setDueDate(todayIso());
  };
  const startEdit = (b) => {
    setScanNote(null); setEditing(b); setName(b.name); setAmount(String(b.amount)); setDueDay(String(b.due_day));
    setCat(b.category); setAutopay(!!b.autopay); setRecurrence(b.recurrence || "monthly"); setDueDate(b.due_date || "");
    setVariable(!!b.variable); setAcctNum(b.account_number || ""); setPhone(b.phone || ""); setNotes(b.notes || "");
  };
  async function onPickBill(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    setReading("bill");
    try {
      const b64 = await compressForOCR(file);
      const { data, error } = await supabase.functions.invoke("scan-doc",
        { body: { image_base64: b64, media_type: "image/jpeg", mode: "bill", today: todayIso() } });
      if (error || (data && data.error)) throw new Error(await realError(error, data));
      const r = Array.isArray(data && data.results) ? data.results[0] : null;
      if (!r) throw new Error("Nothing readable in that photo.");
      const missing = [];
      const nm = typeof r.name === "string" ? r.name.trim().slice(0, 60) : ""; setName(nm); if (!nm) missing.push("the biller");
      const amt = typeof r.amount === "number" && isFinite(r.amount) && r.amount >= 0 ? r.amount : null;
      setAmount(amt == null ? "" : String(amt)); if (amt == null) missing.push("the amount");
      if (isYmd(r.due_date)) { setDueDate(r.due_date); setDueDay(String(Number(r.due_date.slice(8, 10)))); }
      else { setDueDate(todayIso()); setDueDay("1"); missing.push("the due date"); }
      setCat(CATS.includes(r.category) ? r.category : "Other"); setVariable(!!r.variable); setRecurrence("monthly");
      setAutopay(false); setAcctNum(typeof r.account_number === "string" ? r.account_number.trim().slice(0, 40) : "");
      setPhone(typeof r.phone === "string" ? r.phone.trim().slice(0, 30) : ""); setNotes(""); setEditing({});
      const conf = typeof r.confidence === "number" ? r.confidence : 1;
      setScanNote(missing.length ? { tone: "warn", text: `Couldn't find ${missing.join(" or ")} — fill that in below.` }
        : conf < 0.6 ? { tone: "warn", text: "Not fully sure about this one. Check the amount and due date." }
        : { tone: "ok", text: "Filled in from your photo. Check it, then save." });
    } catch (err) { console.error(err); flash(err.message || "Couldn't scan that photo"); }
    setReading(null);
  }
  const saveBill = async () => {
    const amt = num(amount);
    if (!name.trim()) { flash("Give it a name"); return; }
    if (amt == null || amt < 0) { flash("Enter a valid amount"); return; }
    let day = parseInt(dueDay, 10);
    if (recurrence === "once") { if (!dueDate) { flash("Pick the date it's due"); return; } day = Number(dueDate.slice(8, 10)); }
    else if (isNaN(day) || day < 1 || day > 31) { flash("Due day must be 1–31"); return; }
    const payload = { name: name.trim(), amount: amt, due_day: day, category: cat, autopay, active: true, variable, recurrence,
      due_date: recurrence === "once" ? dueDate : null, account_number: acctNum.trim() || null,
      phone: phone.trim() || null, notes: notes.trim() || null };
    try {
      if (editing.id) { await supabase.from("bills").update(payload).eq("id", editing.id); flash("Bill updated"); }
      else { await supabase.from("bills").insert(payload); flash("Bill added"); }
      setEditing(null); setScanNote(null); load();
    } catch (e) { console.error(e); flash("Couldn't save"); }
  };
  const removeBill = async (b) => {
    if (!confirm(`Remove "${b.name}"? Its payment history is kept.`)) return;
    setBills((l) => l.filter((x) => x.id !== b.id));
    try { await supabase.from("bills").update({ active: false }).eq("id", b.id); flash("Bill removed"); }
    catch (e) { console.error(e); load(); }
  };

  /* ================= budgets ================= */
  const startBudgets = () => {
    const d = {}; SPEND_CATS.forEach((c) => { const b = budgets.find((x) => x.category === c); d[c] = b ? String(Number(b.amount)) : ""; });
    setBudgetDraft(d);
  };
  const saveBudgets = async () => {
    const ups = [], rem = [];
    for (const c of SPEND_CATS) {
      const v = num(budgetDraft[c]);
      if (v == null || v <= 0) { if (budgets.some((b) => b.category === c)) rem.push(c); }
      else ups.push({ category: c, amount: Math.round(v * 100) / 100, updated_at: new Date().toISOString() });
    }
    setBudgets(ups); setBudgetDraft(null);
    try {
      if (ups.length) await supabase.from("budgets").upsert(ups, { onConflict: "category" });
      for (const c of rem) await supabase.from("budgets").delete().eq("category", c);
      flash("Budgets saved");
    } catch (e) { console.error(e); flash("Couldn't save budgets"); load(); }
  };

  /* ================= savings ================= */
  const startGoal = (g) => setGoalForm(g
    ? { id: g.id, name: g.name, monthly: String(Number(g.monthly_amount)), target: g.target_amount ? String(Number(g.target_amount)) : "", start: String(Number(g.starting_amount || 0)) }
    : { name: "Emergency fund", monthly: "", target: "", start: "" });
  const saveGoal = async () => {
    const nm = goalForm.name.trim(), monthly = num(goalForm.monthly);
    if (!nm) { flash("Give it a name"); return; }
    if (monthly == null || monthly < 0) { flash("Enter a monthly amount"); return; }
    const row = { name: nm.slice(0, 40), monthly_amount: monthly, target_amount: num(goalForm.target) || null, starting_amount: num(goalForm.start) || 0 };
    try {
      if (goalForm.id) await supabase.from("savings_goals").update(row).eq("id", goalForm.id);
      else await supabase.from("savings_goals").insert(row);
      setGoalForm(null); flash("Savings goal saved"); load();
    } catch (e) { console.error(e); flash("Couldn't save the goal"); }
  };
  const removeGoal = async (g) => {
    if (!confirm(`Stop tracking "${g.name}"? What you've saved stays in your account — this only removes it from the app.`)) return;
    setGoals((l) => l.filter((x) => x.id !== g.id));
    try { await supabase.from("savings_goals").update({ active: false }).eq("id", g.id); } catch (e) { console.error(e); load(); }
  };
  const movedFor = (g) => moves.find((m) => m.goal_id === g.id && m.period_key === period);
  const confirmMove = async () => {
    const amt = num(moving.value);
    if (amt == null || amt < 0) { flash("Enter an amount"); return; }
    const row = { goal_id: moving.goal.id, period_key: period, amount: amt, moved_on: defaultDate() };
    setMoves((l) => [...l.filter((m) => !(m.goal_id === row.goal_id && m.period_key === period)), { ...row, id: "tmp" + Date.now() }]);
    setMoving(null);
    try { await supabase.from("savings_moves").upsert(row, { onConflict: "goal_id,period_key" }); flash(`Set aside ${money(amt)}`); }
    catch (e) { console.error(e); flash("Couldn't save"); load(); }
  };
  const undoMove = async (g) => {
    setMoves((l) => l.filter((m) => !(m.goal_id === g.id && m.period_key === period)));
    try { await supabase.from("savings_moves").delete().match({ goal_id: g.id, period_key: period }); } catch (e) { console.error(e); load(); }
  };

  /* ================= the numbers ================= */
  const visible = bills.filter((b) => inPeriod(b, period));
  const amtFor = (b) => { const p = paidMap[b.id]; return p && p.amount_paid != null ? Number(p.amount_paid) : Number(b.amount || 0); };
  const billsTotal = visible.reduce((t, b) => t + amtFor(b), 0);
  const billsPaid = visible.filter(isPaid).reduce((t, b) => t + amtFor(b), 0);
  const billsLeft = billsTotal - billsPaid;

  const incomeTotal = income.reduce((t, r) => t + Number(r.amount || 0), 0);
  const spendTotal = spending.reduce((t, r) => t + Number(r.amount || 0), 0);
  const savingsReserved = goals.reduce((t, g) => { const m = movedFor(g); return t + (m ? Number(m.amount) : Number(g.monthly_amount || 0)); }, 0);
  const savingsMoved = goals.reduce((t, g) => { const m = movedFor(g); return t + (m ? Number(m.amount) : 0); }, 0);
  const savedTotal = (g) => Number(g.starting_amount || 0) + moves.filter((m) => m.goal_id === g.id).reduce((t, m) => t + Number(m.amount || 0), 0);

  const thisMonth = monthKey(), today = new Date(), dayNow = today.getDate();
  const viewingThisMonth = period === thisMonth;
  const dim = daysInMonth(period);
  const monthFrac = period < thisMonth ? 1 : period > thisMonth ? 0 : dayNow / dim;
  const daysLeft = viewingThisMonth ? dim - dayNow + 1 : period > thisMonth ? dim : 0;

  const budgetRows = budgets.filter((b) => Number(b.amount) > 0)
    .sort((a, b) => SPEND_CATS.indexOf(a.category) - SPEND_CATS.indexOf(b.category))
    .map((b) => {
      const budget = Number(b.amount);
      const spent = spending.filter((r) => r.category === b.category).reduce((t, r) => t + Number(r.amount || 0), 0);
      const frac = spent / budget, left = budget - spent;
      let tone, text;
      if (left < 0) { tone = "over"; text = `Over by ${money(-left)}`; }
      else if (monthFrac >= 1) { tone = "ok"; text = `Finished ${money(left)} under`; }
      else if (frac > monthFrac + 0.12 && spent > 0) { tone = "warn"; text = `Ahead of pace — ${Math.round(frac * 100)}% spent, ${Math.round(monthFrac * 100)}% of the month gone`; }
      else { tone = "ok"; text = daysLeft > 0 ? `On track · ${money(left / daysLeft)}/day for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}` : `${money(left)} left`; }
      return { category: b.category, budget, spent, frac, left, tone, text };
    });
  const budgetHeadroom = budgetRows.reduce((t, r) => t + Math.max(0, r.left), 0);

  /* "safe to spend": what's free once bills, savings, spending so far,
     and the rest of every budget are accounted for */
  const afterBills = incomeTotal - billsTotal - spendTotal - savingsReserved;
  const safeToSpend = afterBills - budgetHeadroom;
  const inHand = incomeTotal - billsPaid - spendTotal - savingsMoved;

  const statusOf = (b) => {
    const d = dayOf(b);
    if (isPaid(b)) return { key: "paid", label: "Paid", color: C.green };
    if (!viewingThisMonth) return { key: "due", label: "Unpaid", color: C.dim };
    if (d < dayNow) return { key: "late", label: "Overdue", color: C.red };
    if (d - dayNow <= 5) return { key: "soon", label: d === dayNow ? "Due today" : `Due in ${d - dayNow}d`, color: C.amber };
    return { key: "due", label: `Due ${ordinal(d)}`, color: C.dim };
  };
  const sortedBills = [...visible].sort((a, b) => (isPaid(a) - isPaid(b)) || (dayOf(a) - dayOf(b)));

  /* things worth a look, most urgent first */
  const alerts = [];
  if (viewingThisMonth) {
    visible.filter((b) => !isPaid(b) && statusOf(b).key === "late")
      .forEach((b) => alerts.push({ tone: "red", text: `${b.name} is overdue`, amt: amtFor(b), go: "bills" }));
    visible.filter((b) => !isPaid(b) && statusOf(b).key === "soon")
      .forEach((b) => alerts.push({ tone: "amber", text: `${b.name} ${statusOf(b).label.toLowerCase()}`, amt: amtFor(b), go: "bills" }));
  }
  budgetRows.filter((r) => r.tone === "over").forEach((r) => alerts.push({ tone: "red", text: `${r.category} is over budget`, amt: -r.left, go: "spending" }));
  budgetRows.filter((r) => r.tone === "warn").forEach((r) => alerts.push({ tone: "amber", text: `${r.category} is ahead of pace`, go: "spending" }));
  if (viewingThisMonth) goals.filter((g) => !movedFor(g) && Number(g.monthly_amount) > 0)
    .forEach((g) => alerts.push({ tone: "gold", text: `${g.name}: not set aside yet`, amt: Number(g.monthly_amount), go: "savings" }));

  const spendingByDay = (() => {
    const g = {}; spending.forEach((r) => { (g[r.spent_on] = g[r.spent_on] || []).push(r); });
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  /* ================= render ================= */
  if (loading) {
    return <div style={S.screen}><div style={S.center}><div style={{ color: C.dim }}>Loading…</div></div></div>;
  }

  const TABS = [["overview", "Overview"], ["spending", "Spending"], ["bills", "Bills"], ["savings", "Savings"]];
  const toneCol = { red: C.red, amber: C.amber, gold: C.gold, green: C.green };
  const rowMenu = (title, actions) => setSheet({ title, actions });
  const overlayOpen = ql || sheet || details || history || askAmount;

  const Bar = ({ frac, color, mark }) => (
    <div style={S.bar}>
      <div style={{ ...S.barFill, width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color }} />
      {mark > 0 && mark < 1 && <div style={{ ...S.barMark, left: `${mark * 100}%` }} />}
    </div>
  );

  return (
    <div style={S.screen}>
      <div style={S.wrap}>
        {/* ---- header ---- */}
        <div style={S.top}>
          <button style={S.backBtn} onClick={onBack}><Icon name="back" size={16} /><span>Home</span></button>
          <h1 style={S.title}>Money</h1>
          <div style={{ width: 78 }} />
        </div>
        <div style={S.monthBar}>
          <button style={S.monthBtn} aria-label="Previous month" onClick={() => setPeriod(shiftMonth(period, -1))}><Icon name="left" size={18} /></button>
          <div style={{ textAlign: "center" }}>
            <div style={S.monthName}>{monthLabel(period)}</div>
            {!viewingThisMonth && <button style={S.linkBtn} onClick={() => setPeriod(thisMonth)}>back to this month</button>}
          </div>
          <button style={S.monthBtn} aria-label="Next month" onClick={() => setPeriod(shiftMonth(period, 1))}><Icon name="right" size={18} /></button>
        </div>

        <div style={S.tabs}>
          {TABS.map(([id, label]) => (
            <button key={id} style={{ ...S.tab, ...(tab === id ? S.tabOn : {}) }} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {!moneyReady && <div style={S.warnBox}>Money tracking isn't set up in the database yet.</div>}

        {/* ======================= OVERVIEW ======================= */}
        {tab === "overview" && (
          <>
            {incomeTotal > 0 ? (
              <button style={S.hero} onClick={() => setShowBreakdown((v) => !v)}>
                <div style={S.heroLbl}>Safe to spend</div>
                <div style={{ ...S.heroNum, color: safeToSpend >= 0 ? C.green : C.red }}>
                  {safeToSpend >= 0 ? money(safeToSpend) : `Short ${money(-safeToSpend)}`}
                </div>
                <div style={S.heroSub}>
                  {budgetRows.length ? "after bills, savings, and the rest of your budgets" : "after bills and savings"}
                  {daysLeft > 0 && safeToSpend > 0 && viewingThisMonth ? ` · ${money(safeToSpend / daysLeft)}/day` : ""}
                </div>
                <div style={S.heroMore}>
                  <span>{showBreakdown ? "Hide breakdown" : "How this is worked out"}</span>
                  <span style={{ transform: showBreakdown ? "rotate(180deg)" : "none", display: "inline-flex" }}><Icon name="chevDown" size={14} /></span>
                </div>
                {showBreakdown && (
                  <div style={S.breakdown}>
                    {[["Money in", incomeTotal, 1], ["Bills this month", billsTotal, -1],
                      ...(goals.length ? [["Savings", savingsReserved, -1]] : []),
                      ["Spent so far", spendTotal, -1],
                      ...(budgetRows.length ? [["Rest of your budgets", budgetHeadroom, -1]] : [])].map(([l, v, s]) => (
                      <div key={l} style={S.bdRow}><span>{l}</span><span>{s > 0 ? "+" : "−"}{money(v).replace("−", "")}</span></div>
                    ))}
                    <div style={{ ...S.bdRow, ...S.bdTotal }}><span>Safe to spend</span><span>{money(safeToSpend)}</span></div>
                    <div style={S.bdNote}>Money actually in hand right now: <b>{money(inHand)}</b></div>
                  </div>
                )}
              </button>
            ) : (
              <div style={S.hero}>
                <div style={S.heroLbl}>Safe to spend</div>
                <div style={{ fontSize: 15, color: C.text, margin: "8px 0 12px", lineHeight: 1.45 }}>
                  Log this month's first paycheck and you'll see exactly what's safe to spend.
                </div>
                <button style={S.primary} onClick={() => openQuickLog("income")}><Icon name="wallet" size={17} /><span>Log a paycheck</span></button>
              </div>
            )}

            <div style={S.actions}>
              <button style={S.action} onClick={() => openQuickLog("spend")}><Icon name="cart" size={20} color={C.gold} /><span>Log spending</span></button>
              <button style={S.action} disabled={!!reading} onClick={() => receiptRef.current && receiptRef.current.click()}>
                <Icon name="receipt" size={20} color={C.gold} /><span>{reading === "receipt" ? "Reading…" : "Scan receipt"}</span></button>
              <button style={S.action} onClick={() => openQuickLog("income")}><Icon name="wallet" size={20} color={C.gold} /><span>Paycheck</span></button>
            </div>

            <div style={S.card}>
              <div style={S.cardHead}>Needs a look</div>
              {alerts.length === 0 ? (
                <div style={S.allGood}><Icon name="ok" size={18} color={C.green} /><span>Nothing needs your attention.</span></div>
              ) : alerts.map((a, i) => (
                <button key={i} style={S.alert} onClick={() => setTab(a.go)}>
                  <span style={{ ...S.alertDot, background: toneCol[a.tone] }} />
                  <span style={{ flex: 1, textAlign: "left" }}>{a.text}</span>
                  {a.amt != null && <span style={{ color: C.dim }}>{money(a.amt)}</span>}
                  <Icon name="right" size={15} color={C.faint} />
                </button>
              ))}
            </div>

            <div style={S.card}>
              <div style={S.cardHeadRow}>
                <span style={S.cardHead}>Money in</span>
                <span style={S.cardTotal}>{money(incomeTotal)}</span>
              </div>
              {income.length === 0 ? <div style={S.muted}>No paychecks logged this month.</div> :
                income.map((r) => (
                  <div key={r.id} style={S.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.rowName}>{personName(r.who)}'s paycheck</div>
                      <div style={S.rowMeta}>{shortDate(r.received_on)}{r.note ? ` · ${r.note}` : ""}</div>
                    </div>
                    <span style={{ ...S.rowAmt, color: C.green }}>+{money(r.amount)}</span>
                    <button style={S.more} aria-label="Options" onClick={() => rowMenu(`${personName(r.who)}'s paycheck · ${money(r.amount)}`,
                      [{ label: "Delete", icon: "trash", danger: true, onClick: () => deleteEntry("income", r) }])}><Icon name="more" size={18} /></button>
                  </div>
                ))}
            </div>

            {spending.length > 0 && (
              <div style={S.card}>
                <div style={S.cardHeadRow}>
                  <span style={S.cardHead}>Recent spending</span>
                  <button style={S.linkBtn} onClick={() => setTab("spending")}>See all</button>
                </div>
                {spending.slice(0, 4).map((r) => (
                  <div key={r.id} style={S.row}>
                    <span style={{ ...S.catDot, background: SPEND_COLOR[r.category] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.rowName}>{r.note || r.category}</div>
                      <div style={S.rowMeta}>{r.note ? `${r.category} · ` : ""}{shortDate(r.spent_on)}</div>
                    </div>
                    <span style={S.rowAmt}>−{money(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ======================= SPENDING ======================= */}
        {tab === "spending" && (
          <>
            <div style={S.card}>
              <div style={S.cardHeadRow}>
                <span style={S.cardHead}>Budgets</span>
                {!budgetDraft && budgetRows.length > 0 && <button style={S.ghost} onClick={startBudgets}>Edit</button>}
              </div>
              {budgetDraft ? (
                <>
                  <div style={S.muted}>Monthly targets. Leave a box empty to not budget it.</div>
                  {SPEND_CATS.map((c) => (
                    <div key={c} style={S.budgetEdit}>
                      <span style={{ ...S.catDot, background: SPEND_COLOR[c] }} />
                      <span style={{ flex: 1 }}>{c}</span>
                      <span style={{ color: C.faint }}>$</span>
                      <input style={{ ...S.input, width: 110, marginTop: 0 }} inputMode="decimal" placeholder="—"
                        value={budgetDraft[c]} onChange={(e) => setBudgetDraft((d) => ({ ...d, [c]: e.target.value }))} />
                    </div>
                  ))}
                  <div style={S.formBtns}>
                    <button style={S.primary} onClick={saveBudgets}>Save budgets</button>
                    <button style={S.secondary} onClick={() => setBudgetDraft(null)}>Cancel</button>
                  </div>
                </>
              ) : budgetRows.length === 0 ? (
                <>
                  <div style={S.muted}>Give groceries, gas, and eating out a monthly target. You'll get a warning when you're spending faster than the month is passing.</div>
                  <button style={{ ...S.primary, marginTop: 12 }} onClick={startBudgets}>Set budgets</button>
                </>
              ) : budgetRows.map((r) => {
                const col = r.tone === "over" ? C.red : r.tone === "warn" ? C.amber : C.green;
                return (
                  <div key={r.category} style={S.budgetRow}>
                    <div style={S.budgetTop}>
                      <span style={{ fontWeight: 700 }}>{r.category}</span>
                      <span><b>{money(r.spent)}</b> <span style={{ color: C.faint }}>of {money(r.budget)}</span></span>
                    </div>
                    <Bar frac={r.frac} color={col} mark={monthFrac} />
                    <div style={{ fontSize: 12.5, marginTop: 5, color: r.tone === "ok" ? C.dim : col, fontWeight: r.tone === "ok" ? 400 : 700 }}>{r.text}</div>
                  </div>
                );
              })}
              {budgetRows.length > 0 && !budgetDraft && monthFrac > 0 && monthFrac < 1 && (
                <div style={S.legend}><span style={S.legendMark} /> where you'd be spending evenly</div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.cardHeadRow}>
                <span style={S.cardHead}>All spending</span>
                <span style={S.cardTotal}>{money(spendTotal)}</span>
              </div>
              {spending.length === 0 ? <div style={S.muted}>Nothing logged this month. Tap + to add a purchase.</div> :
                spendingByDay.map(([day, rows]) => (
                  <div key={day}>
                    <div style={S.dayHead}>{shortDate(day)}</div>
                    {rows.map((r) => (
                      <div key={r.id} style={S.row}>
                        <span style={{ ...S.catDot, background: SPEND_COLOR[r.category] }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={S.rowName}>{r.note || r.category}</div>
                          <div style={S.rowMeta}>{r.note ? `${r.category} · ` : ""}{personName(r.who)}</div>
                        </div>
                        <span style={S.rowAmt}>−{money(r.amount)}</span>
                        <button style={S.more} aria-label="Options" onClick={() => rowMenu(`${r.note || r.category} · ${money(r.amount)}`,
                          [{ label: "Delete", icon: "trash", danger: true, onClick: () => deleteEntry("spend", r) }])}><Icon name="more" size={18} /></button>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </>
        )}

        {/* ======================= BILLS ======================= */}
        {tab === "bills" && (
          <>
            <div style={S.card}>
              <div style={S.cardHeadRow}>
                <span style={S.cardHead}>{billsLeft > 0 ? `${money(billsLeft)} still to pay` : visible.length ? "All paid" : "Bills"}</span>
                <span style={{ color: C.dim, fontSize: 13 }}>{visible.filter(isPaid).length} of {visible.length} paid</span>
              </div>
              <Bar frac={billsTotal > 0 ? billsPaid / billsTotal : 0} color={C.green} />
              <div style={{ ...S.formBtns, marginTop: 14 }}>
                <button style={S.primary} onClick={startNew}><Icon name="plus" size={16} /><span>Add bill</span></button>
                <button style={S.secondary} disabled={!!reading} onClick={() => billScanRef.current && billScanRef.current.click()}>
                  <Icon name="scan" size={16} /><span>{reading === "bill" ? "Reading…" : "Scan a bill"}</span></button>
              </div>
            </div>

            {editing && (
              <div style={S.card}>
                <div style={S.cardHead}>{editing.id ? "Edit bill" : "New bill"}</div>
                {scanNote && <div style={scanNote.tone === "warn" ? S.noteWarn : S.noteOk}>{scanNote.text}</div>}
                <label style={S.label}>Name</label>
                <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electric" />
                <label style={S.label}>{variable ? "Usual amount (estimate)" : "Amount"}</label>
                <input style={S.input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                <label style={S.label}>How often</label>
                <div style={S.chips}>
                  {[["monthly", "Every month"], ["once", "One time"]].map(([v, l]) => (
                    <button key={v} style={{ ...S.chip, ...(recurrence === v ? S.chipOn : {}) }} onClick={() => setRecurrence(v)}>{l}</button>
                  ))}
                </div>
                {recurrence === "monthly" ? (
                  <><label style={S.label}>Day of the month it's due</label>
                    <input style={S.input} type="number" inputMode="numeric" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
                    <div style={S.hint}>Resets to unpaid on the 1st of each month.</div></>
                ) : (
                  <><label style={S.label}>Date it's due</label>
                    <input style={S.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    <div style={S.hint}>Shows only in that month.</div></>
                )}
                <label style={S.label}>Category</label>
                <div style={S.chips}>
                  {CATS.map((c) => (
                    <button key={c} style={{ ...S.chip, ...(cat === c ? { ...S.chipOn, background: CAT_COLOR[c], borderColor: CAT_COLOR[c], color: "#0b0b0d" } : {}) }}
                      onClick={() => setCat(c)}>{c}</button>
                  ))}
                </div>
                <label style={S.toggle}><input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} /><span>On autopay</span></label>
                <label style={S.toggle}><input type="checkbox" checked={variable} onChange={(e) => setVariable(e.target.checked)} /><span>Amount changes each month</span></label>
                {variable && <div style={S.hint}>When you mark it paid you'll enter the real amount, and that becomes next month's estimate.</div>}
                <div style={S.divider} />
                <label style={S.label}>Account number (last 4 is enough)</label>
                <input style={S.input} value={acctNum} onChange={(e) => setAcctNum(e.target.value)} placeholder="e.g. 4471" />
                <label style={S.label}>Customer service phone</label>
                <input style={S.input} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(501) 555-0142" />
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes}
                  onChange={(e) => setNotes(e.target.value)} placeholder="Login, plan details, who to ask for…" />
                <div style={S.formBtns}>
                  <button style={S.primary} onClick={saveBill}>Save</button>
                  <button style={S.secondary} onClick={() => { setEditing(null); setScanNote(null); }}>Cancel</button>
                </div>
              </div>
            )}

            {!editing && (
              <div style={S.card}>
                <div style={{ ...S.cardHead, marginBottom: 4 }}>Due this month</div>
                {visible.length === 0 ? (
                  <div style={S.muted}>{bills.length === 0 ? "No bills yet. Add one or scan a statement." : "Nothing due this month."}</div>
                ) : sortedBills.map((b) => {
                  const st = statusOf(b), paid = isPaid(b);
                  const acts = [];
                  if (b.account_number || b.phone || b.notes) acts.push({ label: "Account details", icon: "info", onClick: () => setDetails(b) });
                  acts.push({ label: "Payment history", icon: "history", onClick: () => openHistory(b) });
                  acts.push({ label: "Edit bill", icon: "edit", onClick: () => startEdit(b) });
                  acts.push({ label: "Delete bill", icon: "trash", danger: true, onClick: () => removeBill(b) });
                  return (
                    <div key={b.id} style={{ ...S.billRow, opacity: paid ? 0.55 : 1 }}>
                      <button style={{ ...S.checkBtn, ...(paid ? S.checkOn : {}) }} aria-label={paid ? "Mark unpaid" : "Mark paid"}
                        onClick={() => togglePaid(b)}>{paid && <Icon name="check" size={18} color="#0b0b0d" stroke={3} />}</button>
                      <button style={S.billMain} onClick={() => togglePaid(b)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ ...S.rowName, textDecoration: paid ? "line-through" : "none" }}>{b.name}</span>
                          {b.autopay && <span style={S.tag}>AUTO</span>}
                          {b.variable && <span style={S.tag}>VARIES</span>}
                          {b.recurrence === "once" && <span style={S.tag}>ONE TIME</span>}
                        </div>
                        <div style={S.rowMeta}>
                          <span style={{ ...S.catDot, background: CAT_COLOR[b.category] || C.dim, marginRight: 6 }} />
                          {`${b.category} ·\u00a0`}<span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                        </div>
                      </button>
                      <div style={{ textAlign: "right" }}>
                        <div style={S.rowAmt}>{money(amtFor(b))}</div>
                        {b.variable && !paid && <div style={{ fontSize: 10.5, color: C.faint }}>est.</div>}
                      </div>
                      <button style={S.more} aria-label="Bill options" onClick={() => rowMenu(b.name, acts)}><Icon name="more" size={18} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ======================= SAVINGS ======================= */}
        {tab === "savings" && (
          <>
            {goalForm ? (
              <div style={S.card}>
                <div style={S.cardHead}>{goalForm.id ? "Edit goal" : "New savings goal"}</div>
                <label style={S.label}>Name</label>
                <input style={S.input} value={goalForm.name} onChange={(e) => setGoalForm((g) => ({ ...g, name: e.target.value }))} />
                <label style={S.label}>Set aside each month</label>
                <input style={S.input} inputMode="decimal" placeholder="e.g. 100" value={goalForm.monthly} onChange={(e) => setGoalForm((g) => ({ ...g, monthly: e.target.value }))} />
                <label style={S.label}>Goal total (optional)</label>
                <input style={S.input} inputMode="decimal" placeholder="e.g. 1000" value={goalForm.target} onChange={(e) => setGoalForm((g) => ({ ...g, target: e.target.value }))} />
                <label style={S.label}>Already saved toward it (optional)</label>
                <input style={S.input} inputMode="decimal" placeholder="0" value={goalForm.start} onChange={(e) => setGoalForm((g) => ({ ...g, start: e.target.value }))} />
                <div style={S.hint}>This comes off "safe to spend" every month, so saving happens first.</div>
                <div style={S.formBtns}>
                  <button style={S.primary} onClick={saveGoal}>Save</button>
                  <button style={S.secondary} onClick={() => setGoalForm(null)}>Cancel</button>
                </div>
              </div>
            ) : goals.length === 0 ? (
              <div style={S.card}>
                <div style={S.cardHead}>Pay yourself first</div>
                <div style={S.muted}>A savings goal comes off the top every month — before anything counts as safe to spend — so it doesn't just become whatever's left at the end.</div>
                <button style={{ ...S.primary, marginTop: 12 }} onClick={() => startGoal(null)}><Icon name="piggy" size={17} /><span>Start a savings goal</span></button>
              </div>
            ) : (
              <>
                {goals.map((g) => {
                  const m = movedFor(g), saved = savedTotal(g), target = Number(g.target_amount || 0), monthly = Number(g.monthly_amount || 0);
                  const pct = target > 0 ? Math.min(1, saved / target) : 0;
                  const togo = target > 0 && monthly > 0 && saved < target ? Math.ceil((target - saved) / monthly) : null;
                  return (
                    <div key={g.id} style={S.card}>
                      <div style={S.cardHeadRow}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, ...S.cardHead }}><Icon name="piggy" size={18} color={C.gold} />{g.name}</span>
                        <button style={S.more} aria-label="Goal options" onClick={() => rowMenu(g.name, [
                          { label: "Edit goal", icon: "edit", onClick: () => startGoal(g) },
                          { label: "Stop tracking", icon: "trash", danger: true, onClick: () => removeGoal(g) }])}><Icon name="more" size={18} /></button>
                      </div>
                      <div style={S.goalBig}>{money(saved)}<span style={S.goalOf}>{target > 0 ? ` of ${money(target)}` : " saved"}</span></div>
                      {target > 0 && <Bar frac={pct} color={C.gold} />}
                      <div style={{ ...S.muted, marginTop: 6 }}>
                        {money(monthly)} a month
                        {target > 0 ? (saved >= target ? " · goal reached" : togo ? ` · about ${togo} month${togo === 1 ? "" : "s"} to go` : "") : ""}
                      </div>
                      {moving && moving.goal.id === g.id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                          <input style={{ ...S.input, flex: 1, marginTop: 0 }} inputMode="decimal" autoFocus value={moving.value}
                            onChange={(e) => setMoving((x) => ({ ...x, value: e.target.value }))} />
                          <button style={{ ...S.primary, flex: "0 0 auto" }} onClick={confirmMove}>Set aside</button>
                          <button style={{ ...S.secondary, flex: "0 0 auto", padding: "12px 14px" }} onClick={() => setMoving(null)}><Icon name="close" size={16} /></button>
                        </div>
                      ) : m ? (
                        <div style={S.moved}><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="check" size={16} color={C.green} stroke={3} />
                          {money(m.amount)} set aside {viewingThisMonth ? "this month" : `in ${monthLabel(period)}`}</span>
                          <button style={S.linkBtn} onClick={() => undoMove(g)}>Undo</button></div>
                      ) : (
                        <button style={{ ...S.secondary, width: "100%", marginTop: 12 }} onClick={() => setMoving({ goal: g, value: String(monthly || "") })}>
                          I moved this month's {money(monthly)}</button>
                      )}
                    </div>
                  );
                })}
                <button style={{ ...S.secondary, width: "100%" }} onClick={() => startGoal(null)}><Icon name="plus" size={16} /><span>Another goal</span></button>
              </>
            )}
          </>
        )}
        <div style={{ height: 110 }} />
      </div>

      {/* ---- the + button: log anything from any tab ---- */}
      {!overlayOpen && !editing && !goalForm && !budgetDraft && moneyReady && (
        <button style={S.fab} aria-label="Log spending" onClick={() => openQuickLog("spend")}><Icon name="plus" size={28} color="#0b0b0d" stroke={2.6} /></button>
      )}

      <input ref={receiptRef} type="file" accept="image/*" onChange={onPickReceipt} style={{ display: "none" }} />
      <input ref={billScanRef} type="file" accept="image/*" onChange={onPickBill} style={{ display: "none" }} />

      {/* ======================= QUICK LOG SHEET ======================= */}
      {ql && (
        <div style={S.scrim} onClick={() => setQl(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.grab} />
            <div style={S.qlTop}>
              <div style={S.seg}>
                {[["spend", "Spending"], ["income", "Paycheck"]].map(([m, l]) => (
                  <button key={m} style={{ ...S.segBtn, ...(ql.mode === m ? S.segOn : {}) }}
                    onClick={() => { if (ql.mode !== m) { setQl((q) => ({ ...q, mode: m, amount: "", prefilled: false, receipt: null })); if (m === "income") prefillPay(ql.who); } }}>{l}</button>
                ))}
              </div>
              <button style={S.closeX} aria-label="Close" onClick={() => setQl(null)}><Icon name="close" size={20} /></button>
            </div>

            {ql.receipt && <div style={ql.receipt.tone === "warn" ? S.noteWarn : S.noteOk}>{ql.receipt.text}</div>}

            <div style={{ ...S.qlAmount, color: ql.amount && !ql.prefilled ? C.text : C.faint }}>
              ${ql.amount || "0"}
            </div>
            {ql.mode === "income" && ql.prefilled && <div style={S.qlHint}>{personName(ql.who)}'s last paycheck — type over it if this one's different</div>}

            {ql.mode === "spend" && (
              <div style={S.qlCats}>
                {catOrder.map((c) => (
                  <button key={c} style={{ ...S.qlCat, ...(ql.category === c ? { background: SPEND_COLOR[c], borderColor: SPEND_COLOR[c], color: "#0b0b0d" } : {}) }}
                    onClick={() => setQl((q) => ({ ...q, category: c }))}>{c}</button>
                ))}
              </div>
            )}

            <div style={S.qlRow}>
              <div style={S.seg}>
                {PEOPLE.map((p) => (
                  <button key={p.id} style={{ ...S.segBtn, ...(ql.who === p.id ? S.segOn : {}) }}
                    onClick={() => { setQl((q) => ({ ...q, who: p.id, ...(q.mode === "income" && (q.prefilled || !q.amount) ? { amount: "", prefilled: false } : {}) }));
                      if (ql.mode === "income") prefillPay(p.id); }}>{p.name}</button>
                ))}
              </div>
              <button style={S.linkBtn} onClick={() => setQl((q) => ({ ...q, showMore: !q.showMore }))}>
                {ql.showMore ? "Less" : ql.date !== todayIso() ? shortDate(ql.date) : "Date & note"}</button>
              {ql.mode === "spend" && (
                <button style={S.qlScan} aria-label="Scan a receipt" disabled={!!reading} onClick={() => receiptRef.current && receiptRef.current.click()}>
                  <Icon name="receipt" size={18} color={C.gold} /></button>
              )}
            </div>
            {reading === "receipt" && <div style={S.qlHint}>Reading the receipt…</div>}
            {ql.showMore && (
              <div style={S.qlMore}>
                <input style={{ ...S.input, marginTop: 0 }} type="date" value={ql.date} onChange={(e) => setQl((q) => ({ ...q, date: e.target.value }))} />
                <input style={S.input} value={ql.note} placeholder={ql.mode === "income" ? "Note — e.g. overtime week" : "Store or note — e.g. Kroger"}
                  onChange={(e) => setQl((q) => ({ ...q, note: e.target.value }))} />
              </div>
            )}

            <div style={S.keypad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
                <button key={k} style={S.key} aria-label={k === "⌫" ? "Delete digit" : k} onClick={() => keypad(k)}>
                  {k === "⌫" ? <Icon name="backspace" size={22} /> : k}</button>
              ))}
            </div>
            <button style={{ ...S.primary, ...S.qlSave, opacity: num(ql.amount) > 0 ? 1 : 0.45 }} onClick={saveQuickLog}>
              {ql.mode === "income" ? "Log paycheck" : `Log ${ql.category.toLowerCase()}`}
            </button>
          </div>
        </div>
      )}

      {/* ---- row menu ---- */}
      {sheet && (
        <div style={S.scrim} onClick={() => setSheet(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.grab} />
            <div style={S.sheetTitle}>{sheet.title}</div>
            {sheet.actions.map((a) => (
              <button key={a.label} style={{ ...S.sheetAct, color: a.danger ? C.red : C.text }}
                onClick={() => { setSheet(null); a.onClick(); }}>
                <Icon name={a.icon} size={19} /><span>{a.label}</span></button>
            ))}
            <button style={{ ...S.secondary, width: "100%", marginTop: 8 }} onClick={() => setSheet(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- what did a variable bill actually cost? ---- */}
      {askAmount && (
        <div style={S.scrim} onClick={() => setAskAmount(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.grab} />
            <div style={S.sheetTitle}>{askAmount.bill.name}</div>
            <div style={S.muted}>How much was it this month?</div>
            <input style={{ ...S.input, fontSize: 26, fontWeight: 800, textAlign: "center" }} inputMode="decimal" autoFocus
              value={askAmount.value} onChange={(e) => setAskAmount({ ...askAmount, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAmount(); }} />
            <div style={S.hint}>Last time: {money(askAmount.bill.amount)}</div>
            <div style={S.formBtns}>
              <button style={S.primary} onClick={confirmAmount}>Mark paid</button>
              <button style={S.secondary} onClick={() => setAskAmount(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- account details ---- */}
      {details && (
        <div style={S.scrim} onClick={() => setDetails(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.grab} />
            <div style={S.sheetTitle}>{details.name}</div>
            {details.account_number && (
              <div style={S.detail}><div style={S.detailLbl}>Account number</div>
                <div style={S.detailRow}><span style={S.mono}>{details.account_number}</span>
                  <button style={S.ghost} onClick={() => { copyText(details.account_number); flash("Copied"); }}>Copy</button></div></div>
            )}
            {details.phone && (
              <div style={S.detail}><div style={S.detailLbl}>Customer service</div>
                <div style={S.detailRow}><a href={`tel:${details.phone.replace(/[^\d+]/g, "")}`} style={S.tel}>{details.phone}</a>
                  <button style={S.ghost} onClick={() => { copyText(details.phone); flash("Copied"); }}>Copy</button></div></div>
            )}
            {details.notes && <div style={S.detail}><div style={S.detailLbl}>Notes</div><div style={S.detailNotes}>{details.notes}</div></div>}
            <div style={S.formBtns}>
              <button style={S.primary} onClick={() => { const b = details; setDetails(null); setTab("bills"); startEdit(b); }}>Edit</button>
              <button style={S.secondary} onClick={() => setDetails(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- payment history ---- */}
      {history && (
        <div style={S.scrim} onClick={() => setHistory(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.grab} />
            <div style={S.sheetTitle}>{history.bill.name} — what you've paid</div>
            {history.rows === null ? <div style={S.muted}>Loading…</div> :
              history.rows.length === 0 ? <div style={S.muted}>No payments recorded yet.</div> : (() => {
                const vals = history.rows.map((r) => Number(r.amount_paid || 0));
                const max = Math.max(...vals, 1), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                return (
                  <>
                    <div style={S.histStats}><span>avg {money(avg)}</span><span>low {money(Math.min(...vals))}</span><span>high {money(Math.max(...vals))}</span></div>
                    {history.rows.map((r) => {
                      const v = Number(r.amount_paid || 0);
                      return (
                        <div key={r.period_key} style={S.histRow}>
                          <span style={S.histMonth}>{monthLabel(r.period_key).replace(/ \d{4}$/, "").slice(0, 3)}</span>
                          <div style={{ flex: 1 }}><Bar frac={v / max} color={C.gold} /></div>
                          <span style={S.histAmt}>{money(v)}</span>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            <button style={{ ...S.secondary, width: "100%", marginTop: 12 }} onClick={() => setHistory(null)}>Close</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={S.toast}>
          <span>{toast.msg}</span>
          {toast.undo && <button style={S.undo} onClick={toast.undo}>Undo</button>}
        </div>
      )}
    </div>
  );
}

/* ================= styles ================= */
const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const S = {
  screen: { minHeight: "100vh", width: "100%", background: `radial-gradient(120% 60% at 50% -10%, #17181c 0%, ${C.bg} 55%)`,
    color: C.text, fontFamily: font, WebkitTapHighlightColor: "transparent" },
  wrap: { maxWidth: 560, margin: "0 auto", padding: "0 14px" },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },

  top: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 6px" },
  backBtn: { display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", color: C.dim,
    border: `1px solid ${C.lineSoft}`, borderRadius: 999, padding: "8px 14px 8px 10px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", width: 78 },
  title: { margin: 0, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, fontWeight: 700, letterSpacing: 1,
    background: "linear-gradient(180deg,#f4dfae 0%,#d6a64e 55%,#a97c2e 100%)", WebkitBackgroundClip: "text",
    backgroundClip: "text", WebkitTextFillColor: "transparent", color: C.gold },

  monthBar: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0 12px" },
  monthBtn: { width: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: C.card,
    color: C.dim, border: `1px solid ${C.lineSoft}`, borderRadius: 12, cursor: "pointer" },
  monthName: { fontWeight: 700, fontSize: 16.5, color: C.text },
  linkBtn: { background: "none", border: "none", color: C.gold, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 2px" },

  tabs: { position: "sticky", top: 0, zIndex: 5, display: "flex", gap: 4, padding: 4, margin: "0 -2px 14px",
    background: "rgba(20,20,24,0.94)", backdropFilter: "blur(8px)", border: `1px solid ${C.lineSoft}`, borderRadius: 14 },
  tab: { flex: 1, background: "transparent", border: "none", color: C.dim, fontWeight: 700, fontSize: 13.5,
    padding: "10px 4px", borderRadius: 10, cursor: "pointer" },
  tabOn: { background: "rgba(214,166,78,0.16)", color: C.goldHi },
  warnBox: { background: "rgba(242,196,109,0.1)", border: `1px solid rgba(242,196,109,0.3)`, color: C.amber,
    borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 12 },

  hero: { display: "block", width: "100%", textAlign: "left", background: "linear-gradient(160deg,#1d1c18 0%,#141418 70%)",
    border: `1px solid rgba(214,166,78,0.28)`, borderRadius: 18, padding: "18px 18px 14px", marginBottom: 12,
    color: C.text, cursor: "pointer", boxShadow: "0 10px 30px rgba(0,0,0,0.45)" },
  heroLbl: { fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.gold, fontWeight: 700 },
  heroNum: { fontSize: 40, fontWeight: 800, letterSpacing: -1, margin: "4px 0 2px", lineHeight: 1.1 },
  heroSub: { fontSize: 13, color: C.dim },
  heroMore: { display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: C.gold, marginTop: 10, fontWeight: 600 },
  breakdown: { marginTop: 12, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 8 },
  bdRow: { display: "flex", justifyContent: "space-between", fontSize: 14, padding: "5px 0", color: C.dim },
  bdTotal: { color: C.text, fontWeight: 800, borderTop: `1px solid ${C.lineSoft}`, marginTop: 4, paddingTop: 9 },
  bdNote: { fontSize: 12.5, color: C.dim, marginTop: 8 },

  actions: { display: "flex", gap: 8, marginBottom: 12 },
  action: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: C.card,
    color: C.text, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 6px", fontSize: 13, fontWeight: 700, cursor: "pointer" },

  card: { background: C.card, border: `1px solid ${C.lineSoft}`, borderRadius: 16, padding: "14px 14px", marginBottom: 12 },
  cardHead: { fontSize: 15.5, fontWeight: 800, color: C.text },
  cardHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  cardTotal: { fontWeight: 800, color: C.dim, fontSize: 14 },
  muted: { fontSize: 13.5, color: C.dim, lineHeight: 1.45 },
  allGood: { display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 14, paddingTop: 6 },
  alert: { display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: "none",
    borderTop: `1px solid ${C.lineSoft}`, color: C.text, fontSize: 14, padding: "12px 2px", cursor: "pointer", textAlign: "left" },
  alertDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },

  row: { display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: `1px solid ${C.lineSoft}` },
  rowName: { fontSize: 15, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowMeta: { fontSize: 12.5, color: C.dim, marginTop: 2, display: "flex", alignItems: "center", flexWrap: "wrap" },
  rowAmt: { fontSize: 15, fontWeight: 800, color: C.text, whiteSpace: "nowrap" },
  more: { width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent",
    border: "none", color: C.dim, borderRadius: 10, cursor: "pointer", flexShrink: 0 },
  catDot: { display: "inline-block", width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  dayHead: { fontSize: 11.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.faint, fontWeight: 700, margin: "12px 0 0" },

  bar: { position: "relative", height: 9, background: "rgba(255,255,255,0.07)", borderRadius: 10, marginTop: 8 },
  barFill: { height: "100%", borderRadius: 10, transition: "width .35s" },
  barMark: { position: "absolute", top: -4, width: 2, height: 17, background: C.text, opacity: 0.7, borderRadius: 1, transform: "translateX(-1px)" },
  budgetRow: { padding: "11px 0", borderTop: `1px solid ${C.lineSoft}` },
  budgetTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14.5 },
  budgetEdit: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" },
  legend: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.faint, marginTop: 10 },
  legendMark: { width: 2, height: 13, background: C.text, opacity: 0.7, borderRadius: 1 },

  primary: { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: "linear-gradient(180deg,#e2b862,#c8953c)", color: "#1a140a", border: "none", borderRadius: 12,
    padding: "13px 16px", fontSize: 15, fontWeight: 800, cursor: "pointer" },
  secondary: { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.card2,
    color: C.text, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" },
  ghost: { background: "transparent", color: C.gold, border: `1px solid ${C.line}`, borderRadius: 10,
    padding: "7px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  formBtns: { display: "flex", gap: 8, marginTop: 16 },

  label: { display: "block", fontSize: 12.5, fontWeight: 700, color: C.dim, margin: "14px 0 5px" },
  input: { width: "100%", boxSizing: "border-box", background: "#0f0f12", color: C.text, border: `1px solid rgba(255,255,255,0.12)`,
    borderRadius: 11, padding: "12px 12px", fontSize: 16, marginTop: 8, outline: "none", colorScheme: "dark" },
  hint: { fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.4 },
  chips: { display: "flex", flexWrap: "wrap", gap: 7 },
  chip: { background: C.card2, color: C.dim, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 999,
    padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  chipOn: { background: "rgba(214,166,78,0.2)", color: C.goldHi, borderColor: "rgba(214,166,78,0.55)" },
  toggle: { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.text, marginTop: 14 },
  divider: { height: 1, background: C.lineSoft, margin: "18px 0 2px" },
  noteOk: { background: "rgba(127,214,160,0.1)", border: "1px solid rgba(127,214,160,0.3)", color: C.green,
    borderRadius: 10, padding: "9px 11px", fontSize: 13, margin: "8px 0" },
  noteWarn: { background: "rgba(242,196,109,0.1)", border: "1px solid rgba(242,196,109,0.32)", color: C.amber,
    borderRadius: 10, padding: "9px 11px", fontSize: 13, margin: "8px 0" },

  billRow: { display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: `1px solid ${C.lineSoft}` },
  checkBtn: { width: 34, height: 34, flexShrink: 0, borderRadius: 10, border: `2px solid rgba(214,166,78,0.55)`,
    background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 },
  checkOn: { background: C.green, borderColor: C.green },
  billMain: { flex: 1, minWidth: 0, background: "transparent", border: "none", textAlign: "left", padding: "4px 2px", cursor: "pointer", color: C.text },
  tag: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: C.gold, border: `1px solid ${C.line}`, borderRadius: 6, padding: "1px 6px" },

  goalBig: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginTop: 2 },
  goalOf: { fontSize: 14, fontWeight: 600, color: C.dim, letterSpacing: 0 },
  moved: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(127,214,160,0.09)",
    border: "1px solid rgba(127,214,160,0.25)", color: C.green, borderRadius: 12, padding: "10px 12px", fontWeight: 700, fontSize: 14, marginTop: 12 },

  fab: { position: "fixed", right: 18, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))", width: 62, height: 62,
    borderRadius: "50%", border: "none", background: "linear-gradient(180deg,#e9c06c,#c8953c)", zIndex: 20,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.6), 0 0 0 4px rgba(214,166,78,0.14)" },

  scrim: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { width: "100%", maxWidth: 560, maxHeight: "94vh", overflowY: "auto", boxSizing: "border-box", background: "#16161a",
    borderTop: `1px solid ${C.line}`, borderRadius: "22px 22px 0 0", padding: "8px 16px calc(18px + env(safe-area-inset-bottom, 0px))",
    color: C.text, fontFamily: font },
  grab: { width: 42, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.18)", margin: "2px auto 12px" },
  sheetTitle: { fontSize: 16.5, fontWeight: 800, marginBottom: 8 },
  sheetAct: { display: "flex", alignItems: "center", gap: 14, width: "100%", background: "transparent", border: "none",
    borderTop: `1px solid ${C.lineSoft}`, padding: "15px 4px", fontSize: 15.5, fontWeight: 600, cursor: "pointer", textAlign: "left" },

  qlTop: { display: "flex", alignItems: "center", gap: 10 },
  seg: { display: "flex", background: "#0f0f12", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 12, padding: 3, flex: 1 },
  segBtn: { flex: 1, background: "transparent", border: "none", color: C.dim, fontWeight: 700, fontSize: 14,
    padding: "9px 6px", borderRadius: 9, cursor: "pointer" },
  segOn: { background: "rgba(214,166,78,0.2)", color: C.goldHi },
  closeX: { width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent",
    border: "none", color: C.dim, cursor: "pointer" },
  qlAmount: { fontSize: 50, fontWeight: 800, textAlign: "center", letterSpacing: -1.5, margin: "16px 0 4px", fontVariantNumeric: "tabular-nums" },
  qlHint: { textAlign: "center", fontSize: 12.5, color: C.dim, marginBottom: 4 },
  qlCats: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7, margin: "12px 0 4px" },
  qlCat: { background: C.card2, color: C.dim, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 999,
    padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  qlRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 },
  qlScan: { width: 44, height: 42, display: "flex", alignItems: "center", justifyContent: "center", background: C.card2,
    border: `1px solid ${C.line}`, borderRadius: 12, cursor: "pointer", flexShrink: 0 },
  qlMore: { marginTop: 10 },
  keypad: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 },
  key: { height: 56, display: "flex", alignItems: "center", justifyContent: "center", background: C.card2, color: C.text,
    border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 14, fontSize: 24, fontWeight: 600, cursor: "pointer",
    fontVariantNumeric: "tabular-nums" },
  qlSave: { width: "100%", marginTop: 12, padding: "16px", fontSize: 16.5 },

  detail: { marginTop: 12 },
  detailLbl: { fontSize: 11.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.faint, fontWeight: 700, marginBottom: 5 },
  detailRow: { display: "flex", alignItems: "center", gap: 10, background: "#0f0f12", border: `1px solid rgba(255,255,255,0.08)`,
    borderRadius: 11, padding: "10px 12px" },
  mono: { flex: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, fontWeight: 700 },
  tel: { flex: 1, color: C.gold, fontSize: 16, fontWeight: 700, textDecoration: "none" },
  detailNotes: { background: "#0f0f12", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 11, padding: "10px 12px",
    fontSize: 14, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.45 },

  histStats: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.dim, margin: "4px 0 8px" },
  histRow: { display: "flex", alignItems: "center", gap: 10, padding: "5px 0" },
  histMonth: { width: 34, fontSize: 12.5, color: C.dim },
  histAmt: { width: 82, textAlign: "right", fontSize: 13, fontWeight: 700 },

  toast: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(98px + env(safe-area-inset-bottom, 0px))",
    zIndex: 60, display: "flex", alignItems: "center", gap: 14, background: "#24242a", color: C.text, border: `1px solid ${C.line}`,
    borderRadius: 999, padding: "11px 12px 11px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    maxWidth: "calc(100% - 32px)", whiteSpace: "nowrap" },
  undo: { background: "rgba(214,166,78,0.18)", color: C.goldHi, border: "none", borderRadius: 999, padding: "6px 12px",
    fontSize: 13.5, fontWeight: 800, cursor: "pointer" },
};
