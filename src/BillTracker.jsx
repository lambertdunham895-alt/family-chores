import React, { useState, useEffect, useCallback } from "react";

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

function monthKey(d = new Date()) { return d.toISOString().slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}
function money(n) {
  return "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
  const [toast, setToast] = useState(null);

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
    setLoading(false);
  }, [supabase, credsMissing, period]);

  useEffect(() => {
    load();
    if (credsMissing) return;
    const ch = supabase
      .channel("bills-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "bills" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bill_payments" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, supabase, credsMissing]);

  const paidMap = {};
  payments.forEach((p) => { paidMap[p.bill_id] = p; });
  const isPaid = (b) => !!paidMap[b.id];

  /* ---------- actions ---------- */
  const togglePaid = async (bill) => {
    const already = isPaid(bill);
    if (already) {
      setPayments((p) => p.filter((x) => x.bill_id !== bill.id));
      try {
        await supabase.from("bill_payments").delete()
          .match({ bill_id: bill.id, period_key: period });
      } catch (e) { console.error(e); }
    } else {
      const row = {
        bill_id: bill.id, period_key: period, paid: true,
        amount_paid: bill.amount, paid_by: profile?.id || null,
      };
      setPayments((p) => [...p, { ...row, id: `tmp${Date.now()}` }]);
      try {
        await supabase.from("bill_payments").upsert(row, { onConflict: "bill_id,period_key" });
      } catch (e) { console.error(e); flash("Couldn't save"); }
    }
  };

  const startNew = () => {
    setEditing({}); setName(""); setAmount(""); setDueDay("1");
    setCat("Utilities"); setAutopay(false);
  };
  const startEdit = (b) => {
    setEditing(b); setName(b.name); setAmount(String(b.amount));
    setDueDay(String(b.due_day)); setCat(b.category); setAutopay(!!b.autopay);
  };

  const save = async () => {
    const amt = parseFloat(amount);
    const day = parseInt(dueDay, 10);
    if (!name.trim()) { flash("Give it a name"); return; }
    if (isNaN(amt) || amt < 0) { flash("Enter a valid amount"); return; }
    if (isNaN(day) || day < 1 || day > 31) { flash("Due day must be 1–31"); return; }
    const payload = {
      name: name.trim(), amount: amt, due_day: day,
      category: cat, autopay, active: true,
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
  const total = bills.reduce((s, b) => s + Number(b.amount || 0), 0);
  const paidTotal = bills.filter(isPaid).reduce((s, b) => s + Number(b.amount || 0), 0);
  const remaining = total - paidTotal;
  const pct = total > 0 ? Math.round((paidTotal / total) * 100) : 0;

  const today = new Date();
  const viewingThisMonth = period === monthKey();
  const dayNow = today.getDate();

  const statusOf = (b) => {
    if (isPaid(b)) return { key: "paid", label: "Paid", color: "#3d7a4e" };
    if (!viewingThisMonth) return { key: "due", label: "Unpaid", color: "#6b7c8c" };
    if (b.due_day < dayNow) return { key: "late", label: "Overdue", color: "#c0392b" };
    if (b.due_day - dayNow <= 5) return { key: "soon", label: `Due in ${b.due_day - dayNow}d`, color: "#c78a2c" };
    return { key: "due", label: `Due ${ordinal(b.due_day)}`, color: "#6b7c8c" };
  };

  const sorted = [...bills].sort((a, b) => {
    const pa = isPaid(a) ? 1 : 0, pb = isPaid(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;              // unpaid first
    return a.due_day - b.due_day;
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

      {/* ---- summary ---- */}
      <div style={S.summary}>
        <div style={S.sumRow}>
          <div>
            <div style={S.sumLabel}>Remaining</div>
            <div style={{ ...S.sumBig, color: remaining > 0 ? "#c0392b" : "#3d7a4e" }}>
              {money(remaining)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={S.sumLabel}>Month total</div>
            <div style={S.sumBig}>{money(total)}</div>
          </div>
        </div>
        <div style={S.barOuter}>
          <div style={{ ...S.barInner, width: `${pct}%` }} />
        </div>
        <div style={S.sumNote}>
          {bills.filter(isPaid).length} of {bills.length} paid · {money(paidTotal)} so far
        </div>
      </div>

      {/* ---- add / edit ---- */}
      <div style={S.headerRow}>
        <h3 style={S.sectionTitle}>Bills</h3>
        {!editing && <button style={S.addBtn} onClick={startNew}>+ Add bill</button>}
      </div>

      {editing && (
        <div style={S.editCard}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {editing.id ? "Edit bill" : "New bill"}
          </div>
          <label style={S.label}>Name</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Electric" />
          <label style={S.label}>Amount</label>
          <input style={S.input} type="number" inputMode="decimal" step="0.01" min="0"
            value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="142.50" />
          <label style={S.label}>Day of month it's due</label>
          <input style={S.input} type="number" inputMode="numeric" min="1" max="31"
            value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="15" />
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
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={S.saveBtn} onClick={save}>Save</button>
            <button style={S.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- list ---- */}
      {bills.length === 0 && !editing ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40 }}>🧾</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>
            No bills yet. Tap "+ Add bill" to track your first one.
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
                </div>
                <div style={S.billMeta}>
                  <span style={{ ...S.catDot, background: CAT_COLOR[b.category] || "#6b7c8c" }} />
                  <span>{b.category}</span>
                  <span style={{ color: st.color, fontWeight: 700 }}>· {st.label}</span>
                </div>
              </div>
              <div style={S.amount}>{money(b.amount)}</div>
              <button style={S.iconBtn} onClick={() => startEdit(b)}>✎</button>
              <button style={{ ...S.iconBtn, color: "#c0392b" }} onClick={() => remove(b)}>✕</button>
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
  billMeta: { fontSize: 11.5, color: "#6b7c8c", marginTop: 3,
    display: "flex", alignItems: "center", gap: 5 },
  catDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  amount: { fontSize: 15.5, fontWeight: 800, color: "#1a2b3c", minWidth: 74, textAlign: "right" },
  iconBtn: { background: "none", border: "none", fontSize: 14, cursor: "pointer",
    padding: "4px 5px", opacity: 0.6 },
  empty: { textAlign: "center", padding: "50px 20px" },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    background: "#1a2b3c", color: "#fff", padding: "11px 20px", borderRadius: 30,
    fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100, fontSize: 14 },
};
