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
          {visible.filter(isPaid).length} of {visible.length} paid · {money(paidTotal)} so far
        </div>
      </div>

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
