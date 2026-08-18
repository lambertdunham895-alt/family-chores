import React, { useState, useEffect, useCallback } from "react";

/* ============================================================
   GROCERY LIST
   - shared live list (syncs across every device)
   - items grouped by category (store-aisle order)
   - "staples" you can re-add with one tap
   ============================================================ */

const CAT_ORDER = [
  "Produce", "Meat", "Dairy", "Bakery", "Frozen",
  "Pantry", "Snacks", "Drinks", "Household", "Personal", "Pets", "Other",
];

const CAT_COLOR = {
  Produce: "#3d7a4e", Meat: "#b0553a", Dairy: "#3a7bd5", Bakery: "#9c7a2c",
  Frozen: "#4aa3c7", Pantry: "#8a6a3a", Snacks: "#7c4adb", Drinks: "#2c8f8f",
  Household: "#6b7c8c", Personal: "#c0559b", Pets: "#9c5a2c", Other: "#6b7c8c",
};

function catRank(c) {
  const i = CAT_ORDER.indexOf(c);
  return i === -1 ? CAT_ORDER.length : i;
}

export default function GroceryList({ supabase, profile, onBack, credsMissing }) {
  const [items, setItems] = useState([]);
  const [staples, setStaples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");
  const [cat, setCat] = useState("Produce");
  const [showStaples, setShowStaples] = useState(false);
  const [stapleFilter, setStapleFilter] = useState("All");
  const [manageStaples, setManageStaples] = useState(false);
  const [newStaple, setNewStaple] = useState("");
  const [newStapleCat, setNewStapleCat] = useState("Produce");
  const [toast, setToast] = useState(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  const load = useCallback(async () => {
    if (credsMissing) { setLoading(false); return; }
    try {
      const { data: it } = await supabase
        .from("grocery_items").select("*").order("created_at", { ascending: true });
      setItems(it || []);
      const { data: st } = await supabase
        .from("grocery_staples").select("*").order("name", { ascending: true });
      setStaples(st || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [supabase, credsMissing]);

  useEffect(() => {
    load();
    if (credsMissing) return;
    const ch = supabase
      .channel("grocery-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_staples" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, supabase, credsMissing]);

  /* ---------- actions ---------- */
  const addItem = async (name, category, quantity) => {
    const nm = (name || "").trim();
    if (!nm) return;
    // don't double-add something already on the list unchecked
    const dupe = items.find(
      (i) => !i.checked && i.name.toLowerCase() === nm.toLowerCase()
    );
    if (dupe) { flash(`${nm} is already on the list`); return; }
    const row = {
      name: nm,
      category: category || "Other",
      qty: (quantity || "").trim() || null,
      added_by: profile?.id || null,
    };
    setItems((p) => [...p, { ...row, id: `tmp${Date.now()}`, checked: false }]);
    try { await supabase.from("grocery_items").insert(row); }
    catch (e) { console.error(e); flash("Couldn't add — check connection"); }
  };

  const submitTyped = async () => {
    if (!text.trim()) return;
    await addItem(text, cat, qty);
    setText(""); setQty("");
  };

  const toggle = async (item) => {
    const next = !item.checked;
    setItems((p) => p.map((i) => (i.id === item.id ? { ...i, checked: next } : i)));
    try {
      await supabase.from("grocery_items")
        .update({ checked: next, checked_at: next ? new Date().toISOString() : null })
        .eq("id", item.id);
    } catch (e) { console.error(e); }
  };

  const removeItem = async (item) => {
    setItems((p) => p.filter((i) => i.id !== item.id));
    try { await supabase.from("grocery_items").delete().eq("id", item.id); }
    catch (e) { console.error(e); }
  };

  const clearChecked = async () => {
    const done = items.filter((i) => i.checked);
    if (!done.length) return;
    if (!confirm(`Clear ${done.length} checked item${done.length > 1 ? "s" : ""}?`)) return;
    setItems((p) => p.filter((i) => !i.checked));
    try { await supabase.from("grocery_items").delete().eq("checked", true); }
    catch (e) { console.error(e); }
  };

  const addStaple = async () => {
    const nm = newStaple.trim();
    if (!nm) return;
    if (staples.some((x) => x.name.toLowerCase() === nm.toLowerCase())) {
      flash(`${nm} is already a staple`); return;
    }
    const cat_ = newStapleCat;
    setNewStaple("");
    try {
      // insert and take the real row back, so the new staple appears instantly
      const { data, error } = await supabase
        .from("grocery_staples")
        .insert({ name: nm, category: cat_ })
        .select()
        .single();
      if (error) throw error;
      setStaples((p) =>
        [...p.filter((x) => x.name.toLowerCase() !== nm.toLowerCase()), data]
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      flash(`${nm} added to staples`);
    } catch (e) {
      console.error(e);
      flash("Couldn't add staple");
      load();   // fall back to a reload so the UI can't drift from the database
    }
  };

  const removeStaple = async (st) => {
    if (!confirm(`Remove "${st.name}" from staples?`)) return;
    setStaples((p) => p.filter((x) => x.id !== st.id));
    try { await supabase.from("grocery_staples").delete().eq("id", st.id); }
    catch (e) { console.error(e); flash("Couldn't remove"); }
  };

  const saveAsStaple = async (item) => {
    if (staples.some((x) => x.name.toLowerCase() === item.name.toLowerCase())) {
      flash("Already in staples"); return;
    }
    try {
      const { data, error } = await supabase.from("grocery_staples")
        .insert({ name: item.name, category: item.category })
        .select()
        .single();
      if (error) throw error;
      setStaples((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
      flash(`${item.name} saved to staples`);
    } catch (e) { flash("Already in staples"); load(); }
  };

  /* ---------- grouping ---------- */
  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const groups = {};
  open.forEach((i) => { (groups[i.category] = groups[i.category] || []).push(i); });
  const cats = Object.keys(groups).sort((a, b) => catRank(a) - catRank(b));

  const stapleCats = ["All", ...CAT_ORDER.filter((c) => staples.some((s) => s.category === c))];
  const shownStaples = staples.filter(
    (s) => stapleFilter === "All" || s.category === stapleFilter
  );
  const onList = (nm) => open.some((i) => i.name.toLowerCase() === nm.toLowerCase());

  if (loading) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40 }}>🛒</div>
        <div style={{ color: "#6b7c8c", marginTop: 12 }}>Loading the list…</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={onBack}>← Home</button>
        <h2 style={S.title}>🛒 Grocery List</h2>
        <div style={{ width: 70, textAlign: "right", fontSize: 12, color: "#6b7c8c" }}>
          {open.length} item{open.length === 1 ? "" : "s"}
        </div>
      </div>

      {credsMissing && (
        <div style={S.banner}>⚠️ Supabase isn't configured — changes won't sync.</div>
      )}

      {/* ---- add box ---- */}
      <div style={S.addCard}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitTyped(); }}
            placeholder="Add an item…"
          />
          <input
            style={{ ...S.input, width: 74 }}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitTyped(); }}
            placeholder="qty"
          />
        </div>
        <div style={S.catRow}>
          {CAT_ORDER.map((c) => (
            <button
              key={c}
              style={{
                ...S.catChip,
                ...(cat === c
                  ? { background: CAT_COLOR[c], color: "#fff", borderColor: CAT_COLOR[c] }
                  : {}),
              }}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={S.primaryBtn} onClick={submitTyped}>+ Add</button>
          <button style={S.ghostBtn} onClick={() => setShowStaples((v) => !v)}>
            {showStaples ? "Hide staples" : "⭐ Staples"}
          </button>
        </div>
      </div>

      {/* ---- staples drawer ---- */}
      {showStaples && (
        <div style={S.stapleBox}>
          <div style={S.stapleHead}>
            <span style={{ fontWeight: 800, color: "#8a5a1a", fontSize: 13 }}>
              ⭐ Staples ({staples.length})
            </span>
            <button
              style={{ ...S.manageBtn, ...(manageStaples ? S.manageBtnOn : {}) }}
              onClick={() => setManageStaples((v) => !v)}
            >
              {manageStaples ? "Done" : "Manage"}
            </button>
          </div>

          {manageStaples && (
            <div style={S.stapleAdd}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={newStaple}
                  onChange={(e) => setNewStaple(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addStaple(); }}
                  placeholder="New staple…"
                />
                <button style={S.smallAdd} onClick={addStaple}>+ Add</button>
              </div>
              <div style={S.catRow}>
                {CAT_ORDER.map((c) => (
                  <button
                    key={c}
                    style={{
                      ...S.catChip,
                      ...(newStapleCat === c
                        ? { background: CAT_COLOR[c], color: "#fff", borderColor: CAT_COLOR[c] }
                        : {}),
                    }}
                    onClick={() => setNewStapleCat(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <p style={S.manageHint}>Tap any staple below to remove it.</p>
            </div>
          )}

          <div style={S.catRow}>
            {stapleCats.map((c) => (
              <button
                key={c}
                style={{ ...S.catChip, ...(stapleFilter === c ? S.catChipOn : {}) }}
                onClick={() => setStapleFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div style={S.stapleGrid}>
            {shownStaples.map((s) => {
              const already = onList(s.name);
              if (manageStaples) {
                return (
                  <button
                    key={s.id}
                    style={{
                      ...S.stapleBtn,
                      background: "#fff5f4",
                      borderColor: "#e8b8b0",
                      color: "#c0392b",
                      borderLeft: `4px solid ${CAT_COLOR[s.category] || "#6b7c8c"}`,
                    }}
                    onClick={() => removeStaple(s)}
                  >
                    ✕ {s.name}
                  </button>
                );
              }
              return (
                <button
                  key={s.id}
                  style={{
                    ...S.stapleBtn,
                    ...(already ? { opacity: 0.45, borderColor: "#bcd" } : {}),
                    borderLeft: `4px solid ${CAT_COLOR[s.category] || "#6b7c8c"}`,
                  }}
                  onClick={() => !already && addItem(s.name, s.category, "")}
                  disabled={already}
                >
                  {already ? "✓ " : "+ "}{s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- the list ---- */}
      {open.length === 0 && done.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40 }}>🧺</div>
          <p style={{ color: "#6b7c8c", marginTop: 8 }}>
            List is empty. Add something above, or tap ⭐ Staples for the usual stuff.
          </p>
        </div>
      ) : (
        <>
          {cats.map((c) => (
            <div key={c} style={{ marginBottom: 14 }}>
              <div style={{ ...S.catHeader, background: CAT_COLOR[c] || "#6b7c8c" }}>
                {c}
                <span style={{ opacity: 0.85, fontWeight: 400 }}>{groups[c].length}</span>
              </div>
              {groups[c].map((i) => (
                <div key={i.id} style={S.row}>
                  <div style={S.check} onClick={() => toggle(i)} />
                  <div style={{ flex: 1 }} onClick={() => toggle(i)}>
                    <span style={S.itemName}>{i.name}</span>
                    {i.qty && <span style={S.qtyTag}>{i.qty}</span>}
                  </div>
                  <button style={S.iconBtn} title="Save to staples"
                    onClick={() => saveAsStaple(i)}>⭐</button>
                  <button style={S.iconBtn} title="Remove"
                    onClick={() => removeItem(i)}>✕</button>
                </div>
              ))}
            </div>
          ))}

          {done.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={S.doneHeader}>
                <span>In the cart ({done.length})</span>
                <button style={S.clearBtn} onClick={clearChecked}>Clear</button>
              </div>
              {done.map((i) => (
                <div key={i.id} style={{ ...S.row, opacity: 0.5 }}>
                  <div style={{ ...S.check, ...S.checkOn }} onClick={() => toggle(i)}>✓</div>
                  <div style={{ flex: 1 }} onClick={() => toggle(i)}>
                    <span style={{ ...S.itemName, textDecoration: "line-through" }}>{i.name}</span>
                    {i.qty && <span style={S.qtyTag}>{i.qty}</span>}
                  </div>
                  <button style={S.iconBtn} onClick={() => removeItem(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
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
  title: { color: "#3d7a4e", fontSize: 19, margin: 0, fontWeight: 800 },
  backBtn: { background: "none", border: "1.5px solid #c5d4de", borderRadius: 8,
    padding: "6px 12px", color: "#2c5f7c", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  banner: { background: "#fff4e0", border: "1.5px solid #f0c97a", borderRadius: 10,
    padding: "10px 12px", fontSize: 12.5, color: "#8a5a1a", marginBottom: 12 },
  addCard: { background: "#f8fbfd", border: "1.5px solid #c5d4de", borderRadius: 12,
    padding: 12, marginBottom: 14 },
  input: { padding: "10px 10px", border: "1.5px solid #c5d4de", borderRadius: 8,
    fontSize: 15, boxSizing: "border-box", width: "100%" },
  catRow: { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 },
  catChip: { padding: "5px 10px", borderRadius: 20, border: "1.5px solid #dce5ec",
    background: "#fff", color: "#5a6b7a", fontWeight: 600, fontSize: 11.5, cursor: "pointer" },
  catChipOn: { background: "#2c5f7c", color: "#fff", borderColor: "#2c5f7c" },
  primaryBtn: { flex: 1, background: "#3d7a4e", color: "#fff", border: "none",
    borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  ghostBtn: { flex: 1, background: "#fff", color: "#2c5f7c", border: "1.5px solid #c5d4de",
    borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  stapleBox: { background: "#fffdf5", border: "1.5px solid #f0d9a0", borderRadius: 12,
    padding: 12, marginBottom: 14 },
  stapleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 },
  stapleHead: { display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 4 },
  manageBtn: { background: "#fff", border: "1.5px solid #dcc79a", color: "#8a5a1a",
    borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  manageBtnOn: { background: "#8a5a1a", color: "#fff", borderColor: "#8a5a1a" },
  stapleAdd: { background: "#fff", border: "1.5px solid #ecdcb8", borderRadius: 10,
    padding: 10, marginTop: 8 },
  smallAdd: { background: "#3d7a4e", color: "#fff", border: "none", borderRadius: 8,
    padding: "0 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" },
  manageHint: { fontSize: 11.5, color: "#8a5a1a", margin: "8px 0 0", opacity: 0.85 },
  stapleBtn: { background: "#fff", border: "1.5px solid #dce5ec", borderRadius: 8,
    padding: "9px 8px", fontSize: 13, fontWeight: 600, color: "#2c3e50",
    cursor: "pointer", textAlign: "left" },
  catHeader: { color: "#fff", fontWeight: 700, padding: "7px 12px", borderRadius: 8,
    marginBottom: 6, display: "flex", justifyContent: "space-between",
    alignItems: "center", fontSize: 14 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "11px 8px",
    borderBottom: "1px solid #eef3f6", cursor: "pointer" },
  check: { flexShrink: 0, width: 24, height: 24, border: "2px solid #3d7a4e",
    borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 700, fontSize: 15 },
  checkOn: { background: "#3d7a4e", borderColor: "#3d7a4e" },
  itemName: { fontSize: 15 },
  qtyTag: { marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: "#5a6b7a",
    background: "#eef3f6", padding: "2px 7px", borderRadius: 8 },
  iconBtn: { background: "none", border: "none", fontSize: 14, cursor: "pointer",
    padding: "4px 6px", opacity: 0.65 },
  doneHeader: { display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 4px", borderTop: "2px solid #e3ebf0", marginTop: 8,
    color: "#6b7c8c", fontSize: 13, fontWeight: 700 },
  clearBtn: { background: "#fff", border: "1.5px solid #e8b8b0", color: "#c0392b",
    borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  empty: { textAlign: "center", padding: "50px 20px" },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    background: "#1a2b3c", color: "#fff", padding: "11px 20px", borderRadius: 30,
    fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100, fontSize: 14 },
};
