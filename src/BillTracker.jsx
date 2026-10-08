import React, { useState, useEffect, useCallback, useRef } from "react";

/* ============================================================
   BILL TRACKER
   - each bill has an amount + day of the month it's due
   - "paid" is tracked per month, so it resets automatically
   - shows what's due soon, what's overdue, and the monthly total
   ============================================================ */

const CATS = ["Housing", "Utilities", "Insurance", "Vehicle", "Debt", "Subscriptions", "Other"];
const CAT_COLOR = {
  Housing: "#2c5f7c", Utilities: "#c78a2c", Insurance: "#3d7a4e", Vehicle: "#7c4adb",
  Debt: "#c0392b", Subscriptions: "#2c8f8f", Other: "#6b7c8c",
};

function monthKey(d = new Date()) {
  // local-time safe (no UTC drift)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// a one-time bill only shows in the month it's due; monthly bills show every month
function inPeriod(bill, period) {
  if (bill.recurrence !== "once") return true;
  return (bill.due_date || "").slice(0, 7) === period;
}
function dayOf(bill) {
  if (bill.recurrence === "once" && bill.due_date) {
    return Number(bill.due_date.slice(8, 10));
  }
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
function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---- money in / money out ---- */
const PEOPLE = [{ id: "adult_a", name: "Dad" }, { id: "adult_b", name: "Mom" }];
const personName = (id) => (PEOPLE.find((p) => p.id === id) || { name: "Family" }).name;
const SPEND_CATS = ["Groceries", "Gas", "Eating out", "Kids", "Household", "Medical", "Fun", "Other"];
const SPEND_COLOR = {
  Groceries: "#3d7a4e", Gas: "#c78a2c", "Eating out": "#c0392b", Kids: "#7c4adb",
  Household: "#2c5f7c", Medical: "#2c8f8f", Fun: "#d6608a", Other: "#6b7c8c",
};
function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function ReceiptIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M6 3l1.5 1.4L9 3l1.5 1.4L12 3l1.5 1.4L15 3l1.5 1.4L18 3v16.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5z" />
      <path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3" />
    </svg>
  );
}
function PiggyIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M19 9c1 .5 2 1.6 2 3v2h-2l-1 3h-3v-2H9v2H6l-1-3a6 6 0 0 1 5-9h4a6 6 0 0 1 5 4z" />
      <path d="M16 11h.01" /><path d="M2 9.5c.5 1 1.6 1.5 2.5 1.5" />
    </svg>
  );
}
function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WalletIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M21 11h-4a2 2 0 0 0 0 4h4z" />
    </svg>
  );
}
function CartIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M3 4h2l2.4 10.4A2 2 0 0 0 9.3 16h7.9a2 2 0 0 0 2-1.6L21 7H6" />
      <circle cx="10" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
    </svg>
  );
}
function money(n) {
  const v = Number(n || 0);
  return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---- stroke icon (Lucide style) for the scan button ---- */
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

function InfoIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/* ---- shrink a photo before upload; small print needs more detail than product photos ---- */
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

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isYmd = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

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

function copyText(t) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t);
      return;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) { console.error(e); }
}

export default function BillTracker({ supabase, profile, onBack, credsMissing }) {
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);   // for the visible month
  const [period, setPeriod] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // {} for new, bill for edit
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [cat, setCat] = useState("Utilities");
  const [autopay, setAutopay] = useState(false);
  const [recurrence, setRecurrence] = useState("monthly");   // 'monthly' | 'once'
  const [dueDate, setDueDate] = useState("");                // for one-time bills
  const [variable, setVariable] = useState(false);           // amount changes monthly
  const [acctNum, setAcctNum] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState(null);              // bill being viewed in the details modal
  const [history, setHistory] = useState(null);              // {bill, rows} when viewing
  const [askAmount, setAskAmount] = useState(null);          // {bill, value} when paying
  const [toast, setToast] = useState(null);

  // money in / money out for the visible month
  const [income, setIncome] = useState([]);
  const [spending, setSpending] = useState([]);
  const [moneyReady, setMoneyReady] = useState(true);   // false if the tables aren't set up yet
  const [entry, setEntry] = useState(null);             // add-paycheck / add-spending form
  const [showActivity, setShowActivity] = useState(false);

  // budgets + savings
  const [budgets, setBudgets] = useState([]);           // [{category, amount}]
  const [goals, setGoals] = useState([]);               // active savings goals
  const [moves, setMoves] = useState([]);               // every transfer, all months (small table)
  const [budgetDraft, setBudgetDraft] = useState(null); // {category: "600"} while editing
  const [goalForm, setGoalForm] = useState(null);       // add / edit a goal
  const [moving, setMoving] = useState(null);           // {goal, value} confirming a transfer
  const receiptRef = useRef(null);
  const [readingReceipt, setReadingReceipt] = useState(false);

  // AI scan
  const fileRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanNote, setScanNote] = useState(null);   // shown above the prefilled form

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 1900); };

  const load = useCallback(async () => {
    if (credsMissing) { setLoading(false); return; }
    try {
      const { data: b } = await supabase
        .from("bills").select("*").eq("active", true)
        .order("due_day", { ascending: true });
      setBills(b || []);
      const { data: p } = await supabase
        .from("bill_payments").select("*").eq("period_key", period);
      setPayments(p || []);
    } catch (e) { console.error(e); }
    try {
      const [inc, spd] = await Promise.all([
        supabase.from("income").select("*").eq("period_key", period).order("received_on", { ascending: false }),
        supabase.from("spending").select("*").eq("period_key", period).order("spent_on", { ascending: false }),
      ]);
      if (inc.error || spd.error) { setMoneyReady(false); }
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
    const ch = supabase
      .channel("bills-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "bills" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bill_payments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "income" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "spending" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "budgets" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_goals" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_moves" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, supabase, credsMissing]);

  const paidMap = {};
  payments.forEach((p) => { paidMap[p.bill_id] = p; });
  const isPaid = (b) => !!paidMap[b.id];

  /* ---------- actions ---------- */
  const markPaid = async (bill, amt) => {
    const row = {
      bill_id: bill.id, period_key: period, paid: true,
      amount_paid: amt, paid_by: profile?.id || null,
    };
    setPayments((p) => [...p.filter((x) => x.bill_id !== bill.id), { ...row, id: `tmp${Date.now()}` }]);
    try {
      await supabase.from("bill_payments").upsert(row, { onConflict: "bill_id,period_key" });
    } catch (e) { console.error(e); flash("Couldn't save"); load(); }
  };

  const togglePaid = async (bill) => {
    if (isPaid(bill)) {
      setPayments((p) => p.filter((x) => x.bill_id !== bill.id));
      try {
        await supabase.from("bill_payments").delete()
          .match({ bill_id: bill.id, period_key: period });
      } catch (e) { console.error(e); }
      return;
    }
    // variable bills: confirm what was actually paid this month
    if (bill.variable) {
      setAskAmount({ bill, value: String(bill.amount ?? "") });
      return;
    }
    markPaid(bill, bill.amount);
  };

  const confirmAmount = async () => {
    const { bill, value } = askAmount;
    const amt = parseFloat(value);
    if (isNaN(amt) || amt < 0) { flash("Enter a valid amount"); return; }
    setAskAmount(null);
    await markPaid(bill, amt);
    // remember it as the new estimate for next month
    if (Math.abs(amt - Number(bill.amount || 0)) > 0.005) {
      setBills((p) => p.map((b) => (b.id === bill.id ? { ...b, amount: amt } : b)));
      try { await supabase.from("bills").update({ amount: amt }).eq("id", bill.id); }
      catch (e) { console.error(e); }
    }
  };

  /* ---------- money in / money out ---------- */
  const defaultDate = () => (period === monthKey() ? todayIso() : `${period}-01`);

  const openEntry = async (kind) => {
    const who = PEOPLE.some((p) => p.id === profile?.id) ? profile.id : "adult_a";
    const base = { kind, who, amount: "", category: "Groceries", date: defaultDate(), note: "" };
    setEntry(base);
    // paychecks vary, so start from that person's last one rather than a blank box
    if (kind === "income") prefillLastPay(who, base);
  };
  const prefillLastPay = async (who, base) => {
    try {
      const { data } = await supabase.from("income").select("amount").eq("who", who)
        .order("received_on", { ascending: false }).limit(1);
      if (data && data[0]) setEntry((e) => (e && e.kind === "income" && e.who === who && !e.amount
        ? { ...e, amount: String(data[0].amount), prefilled: true } : e));
    } catch (e) { /* a blank box is fine */ }
  };

  const saveEntry = async () => {
    const amt = parseFloat(String(entry.amount).replace(/[$,]/g, ""));
    if (isNaN(amt) || amt <= 0) { flash("Enter an amount"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) { flash("Pick a date"); return; }
    const pk = entry.date.slice(0, 7);
    const isIncome = entry.kind === "income";
    const row = isIncome
      ? { received_on: entry.date, period_key: pk, who: entry.who, amount: amt,
          note: entry.note.trim() || null, created_by: profile?.id || null }
      : { spent_on: entry.date, period_key: pk, who: entry.who, category: entry.category,
          amount: amt, note: entry.note.trim() || null, created_by: profile?.id || null };
    try {
      const { data, error } = await supabase.from(isIncome ? "income" : "spending").insert(row).select().single();
      if (error) throw error;
      if (pk === period) (isIncome ? setIncome : setSpending)((list) => [data, ...list]);
      setEntry(null);
      flash(isIncome ? `Paycheck logged · ${money(amt)}` : `Logged ${entry.category.toLowerCase()} · ${money(amt)}`);
      if (pk !== period) flash(`Saved to ${monthLabel(pk)}`);
    } catch (e) { console.error(e); flash("Couldn't save — is the money setup run?"); }
  };

  const removeEntry = async (kind, row) => {
    const what = kind === "income" ? `${personName(row.who)}'s paycheck of ${money(row.amount)}`
                                   : `${row.category} · ${money(row.amount)}`;
    if (!confirm(`Delete ${what}?`)) return;
    (kind === "income" ? setIncome : setSpending)((list) => list.filter((r) => r.id !== row.id));
    try { await supabase.from(kind === "income" ? "income" : "spending").delete().eq("id", row.id); }
    catch (e) { console.error(e); load(); }
  };

  /* ---------- receipt scanning: photo -> prefilled spending entry ---------- */
  const onPickReceipt = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setReadingReceipt(true);
    try {
      const b64 = await compressForOCR(file);
      const { data, error } = await supabase.functions.invoke("scan-doc", {
        body: { image_base64: b64, media_type: "image/jpeg", mode: "receipt", today: todayYmd() },
      });
      if (error || (data && data.error)) throw new Error(await realError(error, data));
      const r = Array.isArray(data && data.results) ? data.results[0] : null;
      if (!r) throw new Error("Couldn't read that receipt.");
      const total = typeof r.total === "number" && isFinite(r.total) && r.total > 0 ? r.total : null;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : todayIso();
      const conf = typeof r.confidence === "number" ? r.confidence : 1;
      setEntry({
        kind: "spend",
        who: PEOPLE.some((p) => p.id === profile?.id) ? profile.id : "adult_a",
        amount: total == null ? "" : total.toFixed(2),
        category: SPEND_CATS.includes(r.category) ? r.category : "Other",
        date,
        note: typeof r.merchant === "string" ? r.merchant.trim().slice(0, 40) : "",
        receipt: total == null
          ? { tone: "warn", text: "Couldn't read the total — type it in from the receipt." }
          : conf < 0.6
            ? { tone: "warn", text: "Not fully sure about this one. Check the total against the receipt." }
            : { tone: "ok", text: "Filled in from your receipt. Check it, then save." },
      });
    } catch (err) {
      console.error(err);
      flash(err.message || "Couldn't read that receipt");
    }
    setReadingReceipt(false);
  };

  /* ---------- budgets ---------- */
  const startBudgets = () => {
    const d = {};
    SPEND_CATS.forEach((c) => {
      const b = budgets.find((x) => x.category === c);
      d[c] = b ? String(Number(b.amount)) : "";
    });
    setBudgetDraft(d);
  };
  const saveBudgets = async () => {
    const upserts = [], removals = [];
    for (const c of SPEND_CATS) {
      const raw = String(budgetDraft[c] || "").replace(/[$,]/g, "").trim();
      const v = parseFloat(raw);
      if (raw === "" || isNaN(v) || v <= 0) { if (budgets.some((b) => b.category === c)) removals.push(c); }
      else upserts.push({ category: c, amount: Math.round(v * 100) / 100, updated_at: new Date().toISOString() });
    }
    setBudgets(upserts.map((u) => ({ ...u })));
    setBudgetDraft(null);
    try {
      if (upserts.length) await supabase.from("budgets").upsert(upserts, { onConflict: "category" });
      for (const c of removals) await supabase.from("budgets").delete().eq("category", c);
      flash("Budgets saved");
    } catch (e) { console.error(e); flash("Couldn't save budgets"); load(); }
  };

  /* ---------- savings ---------- */
  const startGoal = (g) => setGoalForm(g
    ? { id: g.id, name: g.name, monthly: String(Number(g.monthly_amount)),
        target: g.target_amount ? String(Number(g.target_amount)) : "",
        start: String(Number(g.starting_amount || 0)) }
    : { name: "Emergency fund", monthly: "", target: "", start: "" });
  const num = (v) => { const n = parseFloat(String(v || "").replace(/[$,]/g, "")); return isNaN(n) ? null : n; };
  const saveGoal = async () => {
    const name = goalForm.name.trim();
    const monthly = num(goalForm.monthly);
    if (!name) { flash("Give it a name"); return; }
    if (monthly == null || monthly < 0) { flash("Enter a monthly amount"); return; }
    const row = { name: name.slice(0, 40), monthly_amount: monthly,
      target_amount: num(goalForm.target) || null, starting_amount: num(goalForm.start) || 0 };
    try {
      if (goalForm.id) await supabase.from("savings_goals").update(row).eq("id", goalForm.id);
      else await supabase.from("savings_goals").insert(row);
      setGoalForm(null); flash("Savings goal saved"); load();
    } catch (e) { console.error(e); flash("Couldn't save the goal"); }
  };
  const removeGoal = async (g) => {
    if (!confirm(`Stop tracking "${g.name}"? What you've already saved stays in your account — this only removes it from the app.`)) return;
    setGoals((list) => list.filter((x) => x.id !== g.id));
    try { await supabase.from("savings_goals").update({ active: false }).eq("id", g.id); }
    catch (e) { console.error(e); load(); }
  };
  const confirmMove = async () => {
    const amt = num(moving.value);
    if (amt == null || amt < 0) { flash("Enter an amount"); return; }
    const row = { goal_id: moving.goal.id, period_key: period, amount: amt, moved_on: defaultDate() };
    setMoves((list) => [...list.filter((m) => !(m.goal_id === row.goal_id && m.period_key === period)), { ...row, id: "tmp" + Date.now() }]);
    setMoving(null);
    try { await supabase.from("savings_moves").upsert(row, { onConflict: "goal_id,period_key" }); flash(`Set aside ${money(amt)}`); }
    catch (e) { console.error(e); flash("Couldn't save"); load(); }
  };
  const undoMove = async (g) => {
    setMoves((list) => list.filter((m) => !(m.goal_id === g.id && m.period_key === period)));
    try { await supabase.from("savings_moves").delete().match({ goal_id: g.id, period_key: period }); }
    catch (e) { console.error(e); load(); }
  };

  const openHistory = async (bill) => {
    setHistory({ bill, rows: null });
    try {
      const { data } = await supabase.from("bill_payments")
        .select("period_key, amount_paid, paid_at")
        .eq("bill_id", bill.id)
        .order("period_key", { ascending: false })
        .limit(12);
      setHistory({ bill, rows: data || [] });
    } catch (e) { console.error(e); setHistory({ bill, rows: [] }); }
  };

  const startNew = () => {
    const d = new Date();
    setScanNote(null);
    setEditing({}); setName(""); setAmount(""); setDueDay("1");
    setCat("Utilities"); setAutopay(false); setVariable(false);
    setRecurrence("monthly");
    setAcctNum(""); setPhone(""); setNotes("");
    setDueDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  const startEdit = (b) => {
    setScanNote(null);
    setEditing(b); setName(b.name); setAmount(String(b.amount));
    setDueDay(String(b.due_day)); setCat(b.category); setAutopay(!!b.autopay);
    setRecurrence(b.recurrence || "monthly");
    setDueDate(b.due_date || "");
    setVariable(!!b.variable);
    setAcctNum(b.account_number || ""); setPhone(b.phone || ""); setNotes(b.notes || "");
  };

  /* ---------- AI scan ---------- */
  const onPickPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";          // let the same file be picked again later
    if (!file) return;
    if (credsMissing) { flash("Supabase isn't configured"); return; }

    setScanError(null);
    setScanNote(null);
    setScanning(true);
    try {
      const b64 = await compressForOCR(file);
      const { data, error } = await supabase.functions.invoke("scan-doc", {
        body: {
          image_base64: b64,
          media_type: "image/jpeg",
          mode: "bill",
          today: todayYmd(),
        },
      });
      if (error || (data && data.error)) throw new Error(await realError(error, data));

      const r = Array.isArray(data && data.results) ? data.results[0] : null;
      if (!r) throw new Error("Nothing readable in that photo.");

      const missing = [];

      // name
      const nm = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
      setName(nm);
      if (!nm) missing.push("the biller");

      // amount
      const amt = typeof r.amount === "number" && isFinite(r.amount) && r.amount >= 0
        ? r.amount : null;
      setAmount(amt == null ? "" : String(amt));
      if (amt == null) missing.push("the amount");

      // due date -> monthly bill on that day of the month (the common case)
      if (isYmd(r.due_date)) {
        setDueDate(r.due_date);
        setDueDay(String(Number(r.due_date.slice(8, 10))));
      } else {
        setDueDate(todayYmd());
        setDueDay("1");
        missing.push("the due date");
      }

      setCat(CATS.includes(r.category) ? r.category : "Other");
      setVariable(!!r.variable);
      setRecurrence("monthly");
      setAutopay(false);
      setAcctNum(typeof r.account_number === "string" ? r.account_number.trim().slice(0, 40) : "");
      setPhone(typeof r.phone === "string" ? r.phone.trim().slice(0, 30) : "");
      setNotes("");
      setEditing({});

      const conf = typeof r.confidence === "number" ? r.confidence : 1;
      if (missing.length) {
        setScanNote({
          tone: "warn",
          text: `Couldn't find ${missing.join(" or ")} — fill that in below.`,
        });
      } else if (conf < 0.6) {
        setScanNote({
          tone: "warn",
          text: "Wasn't fully sure about this one. Check the amount and due date.",
        });
      } else {
        setScanNote({
          tone: "ok",
          text: "Filled in from your photo. Check it, then save.",
        });
      }
    } catch (err) {
      console.error(err);
      setScanError(err.message || "Couldn't scan that photo.");
    }
    setScanning(false);
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!name.trim()) { flash("Give it a name"); return; }
    if (isNaN(amt) || amt < 0) { flash("Enter a valid amount"); return; }

    let day = parseInt(dueDay, 10);
    if (recurrence === "once") {
      if (!dueDate) { flash("Pick the date it's due"); return; }
      day = Number(dueDate.slice(8, 10));      // keep due_day in sync for sorting
    } else if (isNaN(day) || day < 1 || day > 31) {
      flash("Due day must be 1–31"); return;
    }

    const payload = {
      name: name.trim(), amount: amt, due_day: day,
      category: cat, autopay, active: true, variable,
      recurrence,
      due_date: recurrence === "once" ? dueDate : null,
      account_number: acctNum.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (editing.id) {
        await supabase.from("bills").update(payload).eq("id", editing.id);
        flash("Bill updated");
      } else {
        await supabase.from("bills").insert(payload);
        flash("Bill added");
      }
      setEditing(null);
      setScanNote(null);
    } catch (e) { console.error(e); flash("Couldn't save"); }
  };

  const remove = async (b) => {
    if (!confirm(`Remove "${b.name}"? Past payment history is kept.`)) return;
    try {
      await supabase.from("bills").update({ active: false }).eq("id", b.id);
      flash("Removed");
    } catch (e) { console.error(e); }
  };

  /* ---------- derived ---------- */
  // one-time bills only appear in their own month
  const visible = bills.filter((b) => inPeriod(b, period));
  // for a paid bill use the real amount paid; otherwise the estimate
  const amtFor = (b) => {
    const p = paidMap[b.id];
    if (p && p.amount_paid != null) return Number(p.amount_paid);
    return Number(b.amount || 0);
  };
  const total = visible.reduce((s, b) => s + amtFor(b), 0);
  const paidTotal = visible.filter(isPaid).reduce((s, b) => s + amtFor(b), 0);
  const remaining = total - paidTotal;
  const pct = total > 0 ? Math.round((paidTotal / total) * 100) : 0;

  const incomeTotal = income.reduce((t, r) => t + Number(r.amount || 0), 0);
  const spendTotal = spending.reduce((t, r) => t + Number(r.amount || 0), 0);
  // savings comes off the top: a goal counts as set aside this month even before
  // you move it, so "left over" never quietly includes money meant for savings
  const movedFor = (g) => moves.find((m) => m.goal_id === g.id && m.period_key === period);
  const savingsReserved = goals.reduce((t, g) => {
    const m = movedFor(g); return t + (m ? Number(m.amount) : Number(g.monthly_amount || 0));
  }, 0);
  const savingsMoved = goals.reduce((t, g) => { const m = movedFor(g); return t + (m ? Number(m.amount) : 0); }, 0);
  const savedTotal = (g) => Number(g.starting_amount || 0) +
    moves.filter((m) => m.goal_id === g.id).reduce((t, m) => t + Number(m.amount || 0), 0);

  // what's actually in hand right now, versus what's yours once every bill and savings clears
  const leftNow = incomeTotal - paidTotal - spendTotal - savingsMoved;
  const leftAfter = incomeTotal - total - spendTotal - savingsReserved;

  /* budgets with pacing: compare how much is spent with how much of the month is gone */
  const thisMonth = monthKey();
  const dim = daysInMonth(period);
  const monthFrac = period < thisMonth ? 1 : period > thisMonth ? 0 : new Date().getDate() / dim;
  const daysLeft = period === thisMonth ? dim - new Date().getDate() + 1 : period > thisMonth ? dim : 0;
  const budgetRows = budgets
    .filter((b) => Number(b.amount) > 0)
    .sort((a, b) => SPEND_CATS.indexOf(a.category) - SPEND_CATS.indexOf(b.category))
    .map((b) => {
      const budget = Number(b.amount);
      const spent = spending.filter((r) => r.category === b.category).reduce((t, r) => t + Number(r.amount || 0), 0);
      const frac = spent / budget, left = budget - spent;
      let tone, text;
      if (left < 0) { tone = "over"; text = `Over by ${money(-left)}`; }
      else if (monthFrac >= 1) { tone = "ok"; text = `Finished ${money(left)} under`; }
      else if (frac > monthFrac + 0.12 && spent > 0) {
        tone = "warn";
        text = `Ahead of pace — ${Math.round(frac * 100)}% spent, ${Math.round(monthFrac * 100)}% of the month gone`;
      } else {
        tone = "ok";
        text = daysLeft > 0 ? `On track · ${money(left / daysLeft)}/day for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}` : `${money(left)} left`;
      }
      return { category: b.category, budget, spent, frac, left, tone, text };
    });
  // what's genuinely free if you stick to every budget
  const budgetHeadroom = budgetRows.reduce((t, r) => t + Math.max(0, r.left), 0);
  const freeAfterBudgets = leftAfter - budgetHeadroom;
  const incomeBy = PEOPLE.map((p) => ({ ...p,
    sum: income.filter((r) => r.who === p.id).reduce((t, r) => t + Number(r.amount || 0), 0) }));
  const spendBy = SPEND_CATS.map((c) => ({ c,
    sum: spending.filter((r) => r.category === c).reduce((t, r) => t + Number(r.amount || 0), 0) }))
    .filter((x) => x.sum > 0).sort((a, b) => b.sum - a.sum);
  const activity = [
    ...income.map((r) => ({ kind: "income", date: r.received_on, row: r })),
    ...spending.map((r) => ({ kind: "spend", date: r.spent_on, row: r })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const today = new Date();
  const viewingThisMonth = period === monthKey();
  const dayNow = today.getDate();

  const statusOf = (b) => {
    const d = dayOf(b);
    if (isPaid(b)) return { key: "paid", label: "Paid", color: "#3d7a4e" };
    if (!viewingThisMonth) return { key: "due", label: "Unpaid", color: "#6b7c8c" };
    if (d < dayNow) return { key: "late", label: "Overdue", color: "#c0392b" };
    if (d - dayNow <= 5) return { key: "soon", label: `Due in ${d - dayNow}d`, color: "#c78a2c" };
    return { key: "due", label: `Due ${ordinal(d)}`, color: "#6b7c8c" };
  };

  const sorted = [...visible].sort((a, b) => {
    const pa = isPaid(a) ? 1 : 0, pb = isPaid(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;              // unpaid first
    return dayOf(a) - dayOf(b);
  });

  if (loading) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40 }}>🧾</div>
        <div style={{ color: "#6b7c8c", marginTop: 12 }}>Loading bills…</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={onBack}>← Home</button>
        <h2 style={S.title}>🧾 Bills</h2>
        <div style={{ width: 70 }} />
      </div>

      {credsMissing && (
        <div style={S.banner}>⚠️ Supabase isn't configured — changes won't sync.</div>
      )}

      {/* ---- month switcher ---- */}
      <div style={S.monthBar}>
        <button style={S.monthBtn} onClick={() => setPeriod(shiftMonth(period, -1))}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={S.monthName}>{monthLabel(period)}</div>
          {!viewingThisMonth && (
            <button style={S.todayBtn} onClick={() => setPeriod(monthKey())}>back to this month</button>
          )}
        </div>
        <button style={S.monthBtn} onClick={() => setPeriod(shiftMonth(period, 1))}>›</button>
      </div>

      {/* ---- money card: what's left once the bills clear ---- */}
      <div style={S.summary}>
        {moneyReady && incomeTotal > 0 ? (
          <>
            <div style={S.sumLabel}>Left after this month's bills</div>
            <div style={{ ...S.leftBig, color: leftAfter >= 0 ? "#7fe0a0" : "#ffb4a8" }}>
              {leftAfter >= 0 ? money(leftAfter) : `Short ${money(-leftAfter)}`}
            </div>
            <div style={S.leftNow}>
              Left right now: <b>{money(leftNow)}</b>
              {total - paidTotal > 0 && <span style={{ opacity: 0.8 }}> · {money(total - paidTotal)} in bills still to come</span>}
            </div>
            {budgetRows.length > 0 && (
              <div style={S.leftNow}>
                If you stick to your budgets: <b style={{ color: freeAfterBudgets >= 0 ? "#7fe0a0" : "#ffb4a8" }}>
                  {freeAfterBudgets >= 0 ? `${money(freeAfterBudgets)} free` : `short ${money(-freeAfterBudgets)}`}</b>
              </div>
            )}
            <div style={S.flowRow}>
              <div style={S.flowCell}><div style={S.flowLbl}>Money in</div><div style={S.flowVal}>{money(incomeTotal)}</div></div>
              <div style={S.flowCell}><div style={S.flowLbl}>Bills</div><div style={S.flowVal}>{money(total)}</div></div>
              <div style={S.flowCell}><div style={S.flowLbl}>Spending</div><div style={S.flowVal}>{money(spendTotal)}</div></div>
              {goals.length > 0 && (
                <div style={S.flowCell}><div style={S.flowLbl}>Savings</div><div style={S.flowVal}>{money(savingsReserved)}</div></div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={S.sumRow}>
              <div>
                <div style={S.sumLabel}>Bills remaining</div>
                <div style={{ ...S.sumBig, color: remaining > 0 ? "#ffb4a8" : "#7fe0a0" }}>{money(remaining)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={S.sumLabel}>Month total</div>
                <div style={S.sumBig}>{money(total)}</div>
              </div>
            </div>
            <div style={S.moneyHint}>
              {moneyReady
                ? "Log this month's first paycheck to see what's left after bills."
                : "Money tracking isn't set up yet — run the setup script in Supabase."}
            </div>
          </>
        )}
        <div style={S.barOuter}><div style={{ ...S.barInner, width: `${pct}%` }} /></div>
        <div style={S.sumNote}>
          {visible.filter(isPaid).length} of {visible.length} bills paid · {money(paidTotal)} so far
        </div>
      </div>

      {moneyReady && !entry && (
        <div style={S.moneyBtns}>
          <button style={S.payBtn} onClick={() => openEntry("income")}>
            <WalletIcon size={16} color="#fff" /><span>Paycheck</span>
          </button>
          <button style={S.spendBtn} onClick={() => openEntry("spend")}>
            <CartIcon size={16} color="#2c5f7c" /><span>Spending</span>
          </button>
          <button style={{ ...S.receiptBtn, ...(readingReceipt ? { opacity: 0.6 } : {}) }}
            disabled={readingReceipt} title="Scan a receipt"
            onClick={() => receiptRef.current && receiptRef.current.click()}>
            <ReceiptIcon size={18} color="#2c5f7c" />
          </button>
        </div>
      )}
      <input ref={receiptRef} type="file" accept="image/*" onChange={onPickReceipt} style={{ display: "none" }} />
      {readingReceipt && <div style={S.scanNoteBox}>Reading the receipt… this takes a few seconds.</div>}
      {moneyReady && !entry && activity.length > 0 && (
        <button style={S.actToggle} onClick={() => setShowActivity((v) => !v)}>
          {showActivity ? "Hide this month's activity" : `Show this month's activity (${activity.length})`}
        </button>
      )}

      {/* ---- log a paycheck / log spending ---- */}
      {entry && (
        <div style={S.editCard}>
          <div style={{ fontWeight: 800, marginBottom: 6, color: "#1a2b3c" }}>
            {entry.kind === "income" ? "Log a paycheck" : entry.receipt ? "Log this receipt" : "Log spending"}
          </div>
          {entry.receipt && (
            <div style={entry.receipt.tone === "warn" ? S.noteWarn : S.noteOk}>{entry.receipt.text}</div>
          )}

          <label style={S.label}>{entry.kind === "income" ? "Whose paycheck" : "Who spent it"}</label>
          <div style={S.chipRow}>
            {PEOPLE.map((p) => (
              <button key={p.id} style={{ ...S.chip, ...(entry.who === p.id ? S.chipOn : {}) }}
                onClick={() => {
                  setEntry((e) => ({ ...e, who: p.id, ...(e.kind === "income" && e.prefilled ? { amount: "", prefilled: false } : {}) }));
                  if (entry.kind === "income") prefillLastPay(p.id, entry);
                }}>{p.name}</button>
            ))}
          </div>

          {entry.kind === "spend" && (
            <>
              <label style={S.label}>What for</label>
              <div style={S.chipRow}>
                {SPEND_CATS.map((c) => (
                  <button key={c} style={{ ...S.chip, ...(entry.category === c ? { ...S.chipOn,
                    background: SPEND_COLOR[c], borderColor: SPEND_COLOR[c] } : {}) }}
                    onClick={() => setEntry((e) => ({ ...e, category: c }))}>{c}</button>
                ))}
              </div>
            </>
          )}

          <label style={S.label}>Amount</label>
          <input style={{ ...S.input, fontSize: 22, fontWeight: 700 }} inputMode="decimal" placeholder="0.00"
            value={entry.amount} autoFocus
            onChange={(e) => setEntry((x) => ({ ...x, amount: e.target.value, prefilled: false }))} />
          {entry.kind === "income" && entry.prefilled && (
            <p style={S.hint}>That's {personName(entry.who)}'s last paycheck — change it if this one was different.</p>
          )}

          <label style={S.label}>Date</label>
          <input style={S.input} type="date" value={entry.date}
            onChange={(e) => setEntry((x) => ({ ...x, date: e.target.value }))} />

          <label style={S.label}>Note (optional)</label>
          <input style={S.input} value={entry.note}
            placeholder={entry.kind === "income" ? "e.g. overtime week" : "e.g. Kroger"}
            onChange={(e) => setEntry((x) => ({ ...x, note: e.target.value }))} />

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} onClick={saveEntry}>Save</button>
            <button style={S.cancelBtn} onClick={() => setEntry(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- this month's money activity ---- */}
      {showActivity && !entry && (
        <div style={S.actCard}>
          {incomeTotal > 0 && (
            <div style={S.actSummary}>
              {incomeBy.filter((p) => p.sum > 0).map((p) => (
                <span key={p.id} style={S.actPill}>{p.name} brought in <b>{money(p.sum)}</b></span>
              ))}
            </div>
          )}
          {spendBy.length > 0 && (
            <div style={{ ...S.actSummary, marginTop: 6 }}>
              {spendBy.map((x) => (
                <span key={x.c} style={{ ...S.actPill, borderColor: SPEND_COLOR[x.c], color: SPEND_COLOR[x.c] }}>
                  {x.c} <b>{money(x.sum)}</b>
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {activity.map(({ kind, date, row }) => (
              <div key={kind + row.id} style={S.actRow}>
                <span style={S.actDate}>{shortDate(date)}</span>
                <span style={S.actWhat}>
                  {kind === "income" ? `${personName(row.who)}'s paycheck` : row.category}
                  {row.note && <span style={S.actNote}> · {row.note}</span>}
                </span>
                <span style={{ ...S.actAmt, color: kind === "income" ? "#3d7a4e" : "#c0392b" }}>
                  {kind === "income" ? "+" : "−"}{money(row.amount)}
                </span>
                <button style={S.iconBtn} onClick={() => removeEntry(kind === "income" ? "income" : "spend", row)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- budgets with pacing ---- */}
      {moneyReady && !entry && (
        <div style={S.section}>
          <div style={S.headerRow}>
            <h3 style={S.sectionTitle}>Budgets</h3>
            {!budgetDraft && budgetRows.length > 0 && (
              <button style={S.ghostBtn} onClick={startBudgets}>Edit</button>
            )}
          </div>

          {budgetDraft ? (
            <div style={S.editCard}>
              <div style={{ fontWeight: 800, color: "#1a2b3c" }}>Monthly budgets</div>
              <p style={S.hint}>How much you mean to spend each month. Leave a box empty to not budget it.</p>
              {SPEND_CATS.map((c) => (
                <div key={c} style={S.budgetEditRow}>
                  <span style={{ ...S.dot, background: SPEND_COLOR[c] }} />
                  <span style={{ flex: 1, fontSize: 14, color: "#1a2b3c" }}>{c}</span>
                  <span style={{ color: "#8a97a8", marginRight: 4 }}>$</span>
                  <input style={{ ...S.input, width: 110, padding: "8px 10px" }} inputMode="decimal" placeholder="—"
                    value={budgetDraft[c]} onChange={(e) => setBudgetDraft((d) => ({ ...d, [c]: e.target.value }))} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={S.saveBtn} onClick={saveBudgets}>Save budgets</button>
                <button style={S.cancelBtn} onClick={() => setBudgetDraft(null)}>Cancel</button>
              </div>
            </div>
          ) : budgetRows.length === 0 ? (
            <div style={S.emptyCard}>
              <div style={{ fontSize: 13.5, color: "#3d4c59", lineHeight: 1.45 }}>
                Set a monthly target for groceries, gas, and the rest. The app will warn you
                when you're spending faster than the month is going.
              </div>
              <button style={{ ...S.addBtn, marginTop: 10 }} onClick={startBudgets}>Set budgets</button>
            </div>
          ) : (
            budgetRows.map((r) => {
              // traffic lights, not category colours: a warning colour must only ever mean a warning
              const col = r.tone === "over" ? "#c0392b" : r.tone === "warn" ? "#c78a2c" : "#3d7a4e";
              return (
                <div key={r.category} style={S.budgetRow}>
                  <div style={S.budgetTop}>
                    <span style={{ fontWeight: 700, color: "#1a2b3c" }}>{r.category}</span>
                    <span style={{ fontSize: 13, color: "#3d4c59" }}>
                      <b>{money(r.spent)}</b> <span style={{ color: "#8a97a8" }}>of {money(r.budget)}</span>
                    </span>
                  </div>
                  <div style={S.budgetBar}>
                    <div style={{ ...S.budgetFill, width: `${Math.min(100, r.frac * 100)}%`, background: col }} />
                    {monthFrac > 0 && monthFrac < 1 && (
                      <div style={{ ...S.paceMark, left: `${monthFrac * 100}%` }} title="where you'd be if spending evenly" />
                    )}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: r.tone === "ok" ? "#6b7c8c" : col,
                    fontWeight: r.tone === "ok" ? 400 : 700 }}>{r.text}</div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ---- savings: set aside before "left over" ---- */}
      {moneyReady && !entry && (
        <div style={S.section}>
          <div style={S.headerRow}>
            <h3 style={S.sectionTitle}>Savings</h3>
            {!goalForm && goals.length > 0 && <button style={S.ghostBtn} onClick={() => startGoal(null)}>+ Goal</button>}
          </div>

          {goalForm ? (
            <div style={S.editCard}>
              <div style={{ fontWeight: 800, color: "#1a2b3c" }}>{goalForm.id ? "Edit goal" : "New savings goal"}</div>
              <label style={S.label}>Name</label>
              <input style={S.input} value={goalForm.name} onChange={(e) => setGoalForm((g) => ({ ...g, name: e.target.value }))} />
              <label style={S.label}>Set aside each month</label>
              <input style={S.input} inputMode="decimal" placeholder="e.g. 100" value={goalForm.monthly}
                onChange={(e) => setGoalForm((g) => ({ ...g, monthly: e.target.value }))} />
              <label style={S.label}>Goal total (optional)</label>
              <input style={S.input} inputMode="decimal" placeholder="e.g. 1000" value={goalForm.target}
                onChange={(e) => setGoalForm((g) => ({ ...g, target: e.target.value }))} />
              <label style={S.label}>Already saved toward it (optional)</label>
              <input style={S.input} inputMode="decimal" placeholder="0" value={goalForm.start}
                onChange={(e) => setGoalForm((g) => ({ ...g, start: e.target.value }))} />
              <p style={S.hint}>This amount comes off your "left over" every month, so savings happens first.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={S.saveBtn} onClick={saveGoal}>Save</button>
                <button style={S.cancelBtn} onClick={() => setGoalForm(null)}>Cancel</button>
              </div>
            </div>
          ) : goals.length === 0 ? (
            <div style={S.emptyCard}>
              <div style={{ fontSize: 13.5, color: "#3d4c59", lineHeight: 1.45 }}>
                Pay yourself first. A savings goal comes off the top each month, before anything
                counts as "left over" — so it doesn't just become whatever's left at the end.
              </div>
              <button style={{ ...S.addBtn, marginTop: 10 }} onClick={() => startGoal(null)}>Start a savings goal</button>
            </div>
          ) : (
            goals.map((g) => {
              const m = movedFor(g), saved = savedTotal(g), target = Number(g.target_amount || 0);
              const pctT = target > 0 ? Math.min(1, saved / target) : 0;
              const monthly = Number(g.monthly_amount || 0);
              const togo = target > 0 && monthly > 0 && saved < target ? Math.ceil((target - saved) / monthly) : null;
              return (
                <div key={g.id} style={S.goalCard}>
                  <div style={S.budgetTop}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, color: "#1a2b3c" }}>
                      <PiggyIcon size={17} color="#3d7a4e" />{g.name}
                    </span>
                    <span style={{ display: "flex", gap: 2 }}>
                      <button style={S.iconBtn} onClick={() => startGoal(g)}>✎</button>
                      <button style={{ ...S.iconBtn, color: "#c0392b" }} onClick={() => removeGoal(g)}>✕</button>
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#6b7c8c", margin: "2px 0 8px" }}>
                    {money(monthly)} a month{target > 0 ? ` toward ${money(target)}` : ""}
                  </div>
                  {target > 0 && (
                    <>
                      <div style={S.budgetBar}><div style={{ ...S.budgetFill, width: `${pctT * 100}%`, background: "#3d7a4e" }} /></div>
                      <div style={{ fontSize: 12, color: "#3d4c59", margin: "4px 0 8px" }}>
                        <b>{money(saved)}</b> saved · {Math.round(pctT * 100)}%
                        {saved >= target ? " — goal reached" : togo ? ` · about ${togo} month${togo === 1 ? "" : "s"} to go` : ""}
                      </div>
                    </>
                  )}
                  {target === 0 && (
                    <div style={{ fontSize: 12, color: "#3d4c59", marginBottom: 8 }}><b>{money(saved)}</b> saved so far</div>
                  )}

                  {moving && moving.goal.id === g.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "#8a97a8" }}>$</span>
                      <input style={{ ...S.input, flex: 1, padding: "8px 10px" }} inputMode="decimal" autoFocus
                        value={moving.value} onChange={(e) => setMoving((x) => ({ ...x, value: e.target.value }))} />
                      <button style={{ ...S.saveBtn, flex: "0 0 auto", padding: "9px 16px" }} onClick={confirmMove}>Set aside</button>
                      <button style={{ ...S.cancelBtn, flex: "0 0 auto", padding: "9px 12px" }} onClick={() => setMoving(null)}>✕</button>
                    </div>
                  ) : m ? (
                    <div style={S.movedRow}>
                      <span>✓ {money(m.amount)} set aside {period === monthKey() ? "this month" : `in ${monthLabel(period)}`}</span>
                      <button style={S.undoBtn} onClick={() => undoMove(g)}>Undo</button>
                    </div>
                  ) : (
                    <button style={S.moveBtn} onClick={() => setMoving({ goal: g, value: String(monthly || "") })}>
                      Mark this month's {money(monthly)} as set aside
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ---- add / edit ---- */}
      <div style={S.headerRow}>
        <h3 style={S.sectionTitle}>Bills</h3>
        {!editing && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...S.scanBtn, ...(scanning ? { opacity: 0.6 } : {}) }}
              disabled={scanning}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              <ScanIcon size={15} color="#2c5f7c" />
              <span>{scanning ? "Reading…" : "Scan"}</span>
            </button>
            <button style={S.addBtn} onClick={startNew}>+ Add bill</button>
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
        <div style={S.scanNoteBox}>Reading the bill… this takes a few seconds.</div>
      )}

      {scanError && !scanning && (
        <div style={S.errNote}>
          <span style={{ flex: 1 }}>{scanError}</span>
          <button style={S.iconBtn} onClick={() => setScanError(null)}>✕</button>
        </div>
      )}

      {editing && (
        <div style={S.editCard}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {editing.id ? "Edit bill" : "New bill"}
          </div>
          {scanNote && (
            <div style={scanNote.tone === "warn" ? S.noteWarn : S.noteOk}>
              {scanNote.text}
            </div>
          )}
          <label style={S.label}>Name</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Electric" />
          <label style={S.label}>Amount</label>
          <input style={S.input} type="number" inputMode="decimal" step="0.01" min="0"
            value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="142.50" />
          <label style={S.label}>How often</label>
          <div style={S.chipRow}>
            <button
              style={{ ...S.chip, ...(recurrence === "monthly" ? S.chipOn : {}) }}
              onClick={() => setRecurrence("monthly")}
            >🔁 Every month</button>
            <button
              style={{ ...S.chip, ...(recurrence === "once" ? S.chipOn : {}) }}
              onClick={() => setRecurrence("once")}
            >1️⃣ One time</button>
          </div>

          {recurrence === "monthly" ? (
            <>
              <label style={S.label}>Day of month it's due</label>
              <input style={S.input} type="number" inputMode="numeric" min="1" max="31"
                value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="15" />
              <p style={S.hint}>Resets to unpaid on the 1st of each month.</p>
            </>
          ) : (
            <>
              <label style={S.label}>Date it's due</label>
              <input style={S.input} type="date"
                value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <p style={S.hint}>Shows only in that month, then disappears once it's behind you.</p>
            </>
          )}
          <label style={S.label}>Category</label>
          <div style={S.chipRow}>
            {CATS.map((c) => (
              <button key={c}
                style={{ ...S.chip, ...(cat === c ? { background: CAT_COLOR[c], color: "#fff", borderColor: CAT_COLOR[c] } : {}) }}
                onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
            <span>On autopay</span>
          </label>
          <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={variable} onChange={(e) => setVariable(e.target.checked)} />
            <span>Amount changes each month (electric, water, gas…)</span>
          </label>
          {variable && (
            <p style={S.hint}>
              The amount above is just an estimate. When you mark it paid you'll enter what it
              actually was, and that becomes next month's estimate.
            </p>
          )}

          <div style={S.divider} />

          <label style={S.label}>Account number</label>
          <input style={S.input} value={acctNum} inputMode="text"
            onChange={(e) => setAcctNum(e.target.value)}
            placeholder="e.g., 4471 or ****4471" />
          <p style={S.hint}>
            The last 4 digits are usually all you need to identify yourself on a call — and safer to store.
          </p>

          <label style={S.label}>Customer service phone</label>
          <input style={S.input} type="tel" inputMode="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(501) 555-0142" />

          <label style={S.label}>Notes</label>
          <textarea style={{ ...S.input, minHeight: 74, resize: "vertical", fontFamily: "inherit" }}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Login, due-date quirks, who to ask for, plan details…" />

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} onClick={save}>Save</button>
            <button style={S.cancelBtn} onClick={() => { setEditing(null); setScanNote(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- list ---- */}
      {visible.length === 0 && !editing ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40 }}>🧾</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>
            {bills.length === 0
              ? 'No bills yet. Tap "+ Add bill" to track your first one.'
              : "Nothing due this month."}
          </p>
        </div>
      ) : (
        sorted.map((b) => {
          const st = statusOf(b);
          const paid = isPaid(b);
          return (
            <div key={b.id} style={{ ...S.billRow, opacity: paid ? 0.62 : 1 }}>
              <div
                style={{ ...S.check, ...(paid ? S.checkOn : {}) }}
                onClick={() => togglePaid(b)}
              >{paid ? "✓" : ""}</div>
              <div style={{ flex: 1 }} onClick={() => togglePaid(b)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ ...S.billName, textDecoration: paid ? "line-through" : "none" }}>
                    {b.name}
                  </span>
                  {b.autopay && <span style={S.autoTag}>AUTO</span>}
                  {b.recurrence === "once" && <span style={S.onceTag}>ONE TIME</span>}
                  {b.variable && <span style={S.varTag}>VARIES</span>}
                </div>
                <div style={S.billMeta}>
                  <span style={{ ...S.catDot, background: CAT_COLOR[b.category] || "#6b7c8c" }} />
                  <span>{b.category}</span>
                  <span style={{ color: st.color, fontWeight: 700 }}>· {st.label}</span>
                </div>
              </div>
              <div style={S.amount}>
                {money(amtFor(b))}
                {b.variable && !paid && <div style={S.estTag}>est.</div>}
              </div>
              <button style={S.iconBtn} title="Payment history"
                onClick={() => openHistory(b)}>📊</button>
              {(b.account_number || b.phone || b.notes) && (
                <button style={S.iconBtn} title="Account details"
                  onClick={() => setDetails(b)}>
                  <InfoIcon size={15} color="#6b7c8c" />
                </button>
              )}
              <button style={S.iconBtn} onClick={() => startEdit(b)}>✎</button>
              <button style={{ ...S.iconBtn, color: "#c0392b" }} onClick={() => remove(b)}>✕</button>
            </div>
          );
        })
      )}

      {/* ---- account details ---- */}
      {details && (
        <div style={S.modalWrap} onClick={() => setDetails(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalName}>{details.name}</div>
            <p style={S.modalSub}>Account details</p>

            {details.account_number && (
              <div style={S.detailBlock}>
                <div style={S.detailLabel}>Account number</div>
                <div style={S.detailRow}>
                  <span style={S.detailMono}>{details.account_number}</span>
                  <button style={S.copyBtn} onClick={() => copyText(details.account_number)}>
                    Copy
                  </button>
                </div>
              </div>
            )}

            {details.phone && (
              <div style={S.detailBlock}>
                <div style={S.detailLabel}>Customer service</div>
                <div style={S.detailRow}>
                  <a href={`tel:${details.phone.replace(/[^\d+]/g, "")}`} style={S.detailLink}>
                    {details.phone}
                  </a>
                  <button style={S.copyBtn} onClick={() => copyText(details.phone)}>
                    Copy
                  </button>
                </div>
              </div>
            )}

            {details.notes && (
              <div style={S.detailBlock}>
                <div style={S.detailLabel}>Notes</div>
                <div style={S.detailNotes}>{details.notes}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={S.saveBtn}
                onClick={() => { const b = details; setDetails(null); startEdit(b); }}>
                Edit
              </button>
              <button style={S.cancelBtn} onClick={() => setDetails(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- what did it actually cost this month? ---- */}
      {askAmount && (
        <div style={S.modalWrap} onClick={() => setAskAmount(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalName}>{askAmount.bill.name}</div>
            <p style={S.modalSub}>How much was it this month?</p>
            <input
              style={{ ...S.input, fontSize: 22, fontWeight: 700, textAlign: "center" }}
              type="number" inputMode="decimal" step="0.01" min="0"
              value={askAmount.value}
              autoFocus
              onChange={(e) => setAskAmount({ ...askAmount, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAmount(); }}
            />
            <p style={S.hint}>Last time: {money(askAmount.bill.amount)}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={S.saveBtn} onClick={confirmAmount}>Mark paid</button>
              <button style={S.cancelBtn} onClick={() => setAskAmount(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- payment history ---- */}
      {history && (
        <div style={S.modalWrap} onClick={() => setHistory(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <div>
                <div style={S.modalName}>{history.bill.name}</div>
                <p style={S.modalSub}>What you've paid</p>
              </div>
              <button style={S.closeBtn} onClick={() => setHistory(null)}>✕</button>
            </div>

            {history.rows === null ? (
              <p style={S.hint}>Loading…</p>
            ) : history.rows.length === 0 ? (
              <p style={S.hint}>No payments recorded yet.</p>
            ) : (
              <>
                {(() => {
                  const vals = history.rows.map((r) => Number(r.amount_paid || 0));
                  const max = Math.max(...vals, 1);
                  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                  return (
                    <>
                      <div style={S.histStats}>
                        <span>avg {money(avg)}</span>
                        <span>low {money(Math.min(...vals))}</span>
                        <span>high {money(Math.max(...vals))}</span>
                      </div>
                      {history.rows.map((r) => {
                        const v = Number(r.amount_paid || 0);
                        return (
                          <div key={r.period_key} style={S.histRow}>
                            <span style={S.histMonth}>{monthLabel(r.period_key).replace(/ \d{4}$/, "")}</span>
                            <div style={S.histBarOuter}>
                              <div style={{ ...S.histBarInner, width: `${(v / max) * 100}%` }} />
                            </div>
                            <span style={S.histAmt}>{money(v)}</span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
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
    padding: "16px 0", borderBottom: "2px solid #e3ebf0", marginBottom: 14 },
  title: { color: "#2c5f7c", fontSize: 19, margin: 0, fontWeight: 800 },
  backBtn: { background: "none", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "6px 12px", color: "#2c5f7c", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  banner: { background: "#fff4e0", border: "1.5px solid #f0c97a", borderRadius: 10,
    padding: "10px 12px", fontSize: 12.5, color: "#8a5a1a", marginBottom: 12 },
  monthBar: { display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12 },
  monthBtn: { background: "#fff", border: "1.5px solid #c5d4de", borderRadius: 8,
    width: 40, height: 36, fontSize: 20, color: "#2c5f7c", cursor: "pointer", lineHeight: 1 },
  monthName: { fontWeight: 800, color: "#2c5f7c", fontSize: 16 },
  todayBtn: { background: "none", border: "none", color: "#3a7bd5", fontSize: 11.5,
    cursor: "pointer", textDecoration: "underline", padding: 2 },
  summary: { background: "linear-gradient(135deg,#20364a,#2c5f7c)", color: "#fff",
    borderRadius: 14, padding: "14px 16px", marginBottom: 16 },
  sumRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end" },
  sumLabel: { fontSize: 11.5, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.5 },
  sumBig: { fontSize: 24, fontWeight: 800, marginTop: 2 },
  barOuter: { background: "rgba(255,255,255,0.22)", borderRadius: 20, height: 8,
    margin: "12px 0 6px", overflow: "hidden" },
  barInner: { background: "#7fe0a0", height: "100%", borderRadius: 20, transition: "width .4s" },
  sumNote: { fontSize: 12, opacity: 0.9 },
  leftBig: { fontSize: 32, fontWeight: 800, marginTop: 2, letterSpacing: -0.5 },
  leftNow: { fontSize: 13, marginTop: 4, opacity: 0.95 },
  flowRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  flowCell: { flex: "1 1 40%", minWidth: 0, background: "rgba(255,255,255,0.1)", borderRadius: 9, padding: "7px 9px" },
  flowLbl: { fontSize: 10.5, opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.4 },
  flowVal: { fontSize: 14.5, fontWeight: 700, marginTop: 1 },
  moneyHint: { fontSize: 12.5, marginTop: 10, background: "rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "8px 10px" },
  moneyBtns: { display: "flex", gap: 8, marginBottom: 16 },
  payBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    background: "#3d7a4e", color: "#fff", border: "none", borderRadius: 10,
    padding: "11px 10px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  spendBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    background: "#fff", color: "#2c5f7c", border: "1.5px solid #c5d4de", borderRadius: 10,
    padding: "11px 10px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  actBtn: { background: "#fff", color: "#6b7c8c", border: "1.5px solid #dce5ec", borderRadius: 10,
    padding: "11px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" },
  actCard: { background: "#f8fbfd", border: "1.5px solid #dce5ec", borderRadius: 12,
    padding: 12, marginBottom: 16 },
  actSummary: { display: "flex", flexWrap: "wrap", gap: 6 },
  actPill: { fontSize: 12, border: "1.5px solid #c5d4de", borderRadius: 20, padding: "4px 10px",
    color: "#2c5f7c", background: "#fff" },
  actRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 2px",
    borderBottom: "1px solid #e8eef2" },
  actDate: { fontSize: 11.5, color: "#8a97a8", width: 46, flexShrink: 0 },
  actWhat: { flex: 1, fontSize: 13.5, color: "#1a2b3c", minWidth: 0 },
  actNote: { color: "#8a97a8", fontSize: 12 },
  actAmt: { fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap" },
  receiptBtn: { flex: "0 0 auto", width: 48, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#fff", border: "1.5px solid #c5d4de", borderRadius: 10, cursor: "pointer" },
  actToggle: { display: "block", width: "100%", background: "none", border: "none", color: "#3a7bd5",
    fontSize: 12.5, cursor: "pointer", textDecoration: "underline", margin: "-8px 0 12px", padding: 2 },
  section: { marginBottom: 18 },
  ghostBtn: { background: "#fff", color: "#2c5f7c", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "6px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" },
  emptyCard: { background: "#f8fbfd", border: "1.5px dashed #c5d4de", borderRadius: 12, padding: 14 },
  budgetRow: { padding: "10px 2px", borderBottom: "1px solid #eef2f5" },
  budgetTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  budgetBar: { position: "relative", height: 9, background: "#e8eef2", borderRadius: 10, marginTop: 7, overflow: "visible" },
  budgetFill: { height: "100%", borderRadius: 10, transition: "width .35s" },
  paceMark: { position: "absolute", top: -3, width: 2, height: 15, background: "#1a2b3c", opacity: 0.55,
    borderRadius: 1, transform: "translateX(-1px)" },
  budgetEditRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  goalCard: { background: "#fff", border: "1.5px solid #dce5ec", borderRadius: 12, padding: 12, marginBottom: 10 },
  moveBtn: { width: "100%", background: "#eef7f0", color: "#2f6b40", border: "1.5px solid #b9dcc3",
    borderRadius: 9, padding: "10px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  movedRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#eef7f0",
    color: "#2f6b40", borderRadius: 9, padding: "9px 12px", fontWeight: 700, fontSize: 13 },
  undoBtn: { background: "none", border: "none", color: "#6b7c8c", fontSize: 12, cursor: "pointer",
    textDecoration: "underline" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 8 },
  sectionTitle: { color: "#2c5f7c", fontSize: 16, margin: 0 },
  addBtn: { background: "#3d7a4e", color: "#fff", border: "none", borderRadius: 8,
    padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13.5 },
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
  divider: { height: 1, background: "#e3ebf0", margin: "16px 0 4px" },
  detailBlock: { marginTop: 12 },
  detailLabel: { fontSize: 10.5, fontWeight: 700, color: "#9aa8b5",
    textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  detailRow: { display: "flex", alignItems: "center", gap: 8,
    background: "#f4f8fa", border: "1px solid #e3ebf0", borderRadius: 8, padding: "9px 10px" },
  detailMono: { flex: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 15, fontWeight: 600, color: "#22303c", wordBreak: "break-all" },
  detailLink: { flex: 1, fontSize: 15, fontWeight: 700, color: "#2c5f7c", textDecoration: "none" },
  copyBtn: { background: "#fff", border: "1.5px solid #c5d4de", borderRadius: 6,
    padding: "5px 10px", fontSize: 11.5, fontWeight: 700, color: "#2c5f7c",
    cursor: "pointer", flexShrink: 0 },
  detailNotes: { background: "#f4f8fa", border: "1px solid #e3ebf0", borderRadius: 8,
    padding: "9px 10px", fontSize: 13.5, color: "#3d4c59", whiteSpace: "pre-wrap", lineHeight: 1.45 },
  saveBtn: { flex: 1, background: "#2c5f7c", color: "#fff", border: "none",
    borderRadius: 8, padding: "11px 0", fontWeight: 700, cursor: "pointer" },
  cancelBtn: { flex: 1, background: "#fff", color: "#6b7c8c", border: "1.5px solid #c5d4de",
    borderRadius: 8, padding: "11px 0", fontWeight: 600, cursor: "pointer" },
  billRow: { display: "flex", alignItems: "center", gap: 10, padding: "12px 6px",
    borderBottom: "1px solid #eef3f6" },
  check: { flexShrink: 0, width: 26, height: 26, border: "2px solid #2c5f7c",
    borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  checkOn: { background: "#3d7a4e", borderColor: "#3d7a4e" },
  billName: { fontSize: 15.5, fontWeight: 600 },
  autoTag: { fontSize: 9.5, fontWeight: 800, color: "#2c8f8f", background: "#e0f3f3",
    padding: "2px 6px", borderRadius: 6, letterSpacing: 0.5 },
  onceTag: { fontSize: 9.5, fontWeight: 800, color: "#7c4adb", background: "#efe8fb",
    padding: "2px 6px", borderRadius: 6, letterSpacing: 0.5 },
  hint: { fontSize: 11.5, color: "#8a97a8", margin: "6px 0 0" },
  varTag: { fontSize: 9.5, fontWeight: 800, color: "#c78a2c", background: "#fdf1dc",
    padding: "2px 6px", borderRadius: 6, letterSpacing: 0.5 },
  estTag: { fontSize: 9, color: "#8a97a8", fontWeight: 600, textAlign: "right" },
  modalWrap: { position: "fixed", inset: 0, background: "rgba(8,14,22,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 200 },
  modal: { background: "#fff", borderRadius: 16, padding: 18, width: "100%",
    maxWidth: 380, maxHeight: "86vh", overflowY: "auto",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  modalName: { fontSize: 19, fontWeight: 800, color: "#1a2b3c" },
  modalSub: { fontSize: 12.5, color: "#6b7c8c", margin: "2px 0 12px" },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer",
    color: "#6b7c8c", padding: 4, lineHeight: 1 },
  histStats: { display: "flex", justifyContent: "space-between", fontSize: 11.5,
    color: "#6b7c8c", fontWeight: 700, background: "#f4f8fa", borderRadius: 8,
    padding: "7px 10px", marginBottom: 10 },
  histRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 7 },
  histMonth: { fontSize: 11.5, color: "#6b7c8c", width: 62, flexShrink: 0 },
  histBarOuter: { flex: 1, background: "#eef3f6", borderRadius: 6, height: 14, overflow: "hidden" },
  histBarInner: { background: "#2c5f7c", height: "100%", borderRadius: 6 },
  histAmt: { fontSize: 12.5, fontWeight: 700, width: 68, textAlign: "right" },
  billMeta: { fontSize: 11.5, color: "#6b7c8c", marginTop: 3,
    display: "flex", alignItems: "center", gap: 5 },
  catDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  amount: { fontSize: 15.5, fontWeight: 800, color: "#1a2b3c", minWidth: 74, textAlign: "right" },
  iconBtn: { background: "none", border: "none", fontSize: 14, cursor: "pointer",
    padding: "4px 5px", opacity: 0.6 },
  empty: { textAlign: "center", padding: "50px 20px" },
  scanBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff",
    color: "#2c5f7c", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13.5 },
  scanNoteBox: { background: "#eef6fb", border: "1.5px solid #bcd9ea", borderRadius: 10,
    padding: "10px 12px", fontSize: 13, color: "#2c5f7c", marginBottom: 12, fontWeight: 600 },
  errNote: { display: "flex", alignItems: "center", gap: 8, background: "#fdeceb",
    border: "1.5px solid #f0b4ae", borderRadius: 10, padding: "10px 12px",
    fontSize: 12.5, color: "#a03027", marginBottom: 12 },
  noteOk: { background: "#eef6fb", border: "1px solid #bcd9ea", borderRadius: 8,
    padding: "8px 10px", fontSize: 12, color: "#2c5f7c", marginBottom: 10 },
  noteWarn: { background: "#fff6e3", border: "1px solid #f0d9a0", borderRadius: 8,
    padding: "8px 10px", fontSize: 12, color: "#a06a10", marginBottom: 10 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    background: "#1a2b3c", color: "#fff", padding: "11px 20px", borderRadius: 30,
    fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100, fontSize: 14 },
};
