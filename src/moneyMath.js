/* =====================================================================
   moneyMath — the single source of truth for every money number in the app.
   The Money screen and the home screen's This Week card both use this, so
   "safe to spend" can never mean two different things in two places.
   ===================================================================== */

export const SPEND_CATS = ["Groceries", "Gas", "Eating out", "Kids", "Household", "Medical", "Fun", "Other"];

/* local-time dates only — toISOString drifts across midnight UTC */
export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export function inPeriod(bill, period) {
  if (bill.recurrence !== "once") return true;
  return (bill.due_date || "").slice(0, 7) === period;
}
export function dayOf(bill) {
  if (bill.recurrence === "once" && bill.due_date) return Number(bill.due_date.slice(8, 10));
  return bill.due_day;
}
export function money(n) {
  const v = Number(n || 0);
  return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* everything one month's numbers depend on */
export async function fetchMonth(supabase, period) {
  const out = { bills: [], payments: [], income: [], spending: [], budgets: [], goals: [], moves: [], moneyReady: true };
  try {
    const [b, p] = await Promise.all([
      supabase.from("bills").select("*").eq("active", true).order("due_day", { ascending: true }),
      supabase.from("bill_payments").select("*").eq("period_key", period),
    ]);
    out.bills = b.data || []; out.payments = p.data || [];
  } catch (e) { console.error(e); }
  try {
    const [inc, spd] = await Promise.all([
      supabase.from("income").select("*").eq("period_key", period).order("received_on", { ascending: false }),
      supabase.from("spending").select("*").eq("period_key", period).order("spent_on", { ascending: false }),
    ]);
    if (inc.error || spd.error) out.moneyReady = false;
    else { out.income = inc.data || []; out.spending = spd.data || []; }
  } catch (e) { console.error(e); out.moneyReady = false; }
  try {
    const [bg, gl, mv] = await Promise.all([
      supabase.from("budgets").select("*"),
      supabase.from("savings_goals").select("*").eq("active", true).order("created_at", { ascending: true }),
      supabase.from("savings_moves").select("*"),
    ]);
    if (!bg.error) out.budgets = bg.data || [];
    if (!gl.error) out.goals = gl.data || [];
    if (!mv.error) out.moves = mv.data || [];
  } catch (e) { console.error(e); }
  return out;
}

/* every derived number for a month */
export function computeMonth(d, period, now = new Date()) {
  const bills = d.bills || [], payments = d.payments || [], income = d.income || [], spending = d.spending || [];
  const budgets = d.budgets || [], goals = d.goals || [], moves = d.moves || [];

  const paidMap = {}; payments.forEach((p) => { paidMap[p.bill_id] = p; });
  const isPaid = (b) => !!paidMap[b.id];
  // a paid bill counts at what it actually cost; an unpaid one at its estimate
  const amtFor = (b) => { const p = paidMap[b.id]; return p && p.amount_paid != null ? Number(p.amount_paid) : Number(b.amount || 0); };

  const visible = bills.filter((b) => inPeriod(b, period));
  const billsTotal = visible.reduce((t, b) => t + amtFor(b), 0);
  const billsPaid = visible.filter(isPaid).reduce((t, b) => t + amtFor(b), 0);
  const billsLeft = billsTotal - billsPaid;

  const incomeTotal = income.reduce((t, r) => t + Number(r.amount || 0), 0);
  const spendTotal = spending.reduce((t, r) => t + Number(r.amount || 0), 0);

  // savings comes off the top: it counts as set aside this month even before you move it
  const movedFor = (g) => moves.find((m) => m.goal_id === g.id && m.period_key === period);
  const savingsReserved = goals.reduce((t, g) => { const m = movedFor(g); return t + (m ? Number(m.amount) : Number(g.monthly_amount || 0)); }, 0);
  const savingsMoved = goals.reduce((t, g) => { const m = movedFor(g); return t + (m ? Number(m.amount) : 0); }, 0);
  const savedTotal = (g) => Number(g.starting_amount || 0) + moves.filter((m) => m.goal_id === g.id).reduce((t, m) => t + Number(m.amount || 0), 0);

  const thisMonth = monthKey(now), dayNow = now.getDate(), viewingThisMonth = period === thisMonth;
  const dim = daysInMonth(period);
  const monthFrac = period < thisMonth ? 1 : period > thisMonth ? 0 : dayNow / dim;
  const daysLeft = viewingThisMonth ? dim - dayNow + 1 : period > thisMonth ? dim : 0;

  // budgets with pacing: how much is spent versus how much of the month has gone
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

  // safe to spend: free once bills, savings, spending so far, and the rest of every budget are covered
  const afterBills = incomeTotal - billsTotal - spendTotal - savingsReserved;
  const safeToSpend = afterBills - budgetHeadroom;
  const inHand = incomeTotal - billsPaid - spendTotal - savingsMoved;

  return { paidMap, isPaid, amtFor, visible, billsTotal, billsPaid, billsLeft, incomeTotal, spendTotal,
    movedFor, savingsReserved, savingsMoved, savedTotal, thisMonth, dayNow, viewingThisMonth, dim, monthFrac,
    daysLeft, budgetRows, budgetHeadroom, afterBills, safeToSpend, inHand };
}
