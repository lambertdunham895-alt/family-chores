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
  const out = { bills: [], payments: [], income: [], spending: [], budgets: [], goals: [], moves: [], paySchedules: [], moneyReady: true };
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
  out.paySchedules = await fetchPaySchedules(supabase);
  return out;
}

export async function fetchPaySchedules(supabase) {
  try {
    const { data, error } = await supabase.from("pay_schedules").select("*").eq("active", true);
    return error ? [] : (data || []);
  } catch (e) { return []; }
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


/* =====================================================================
   Paydays. Day arithmetic runs on whole-day numbers in UTC so daylight-saving
   changes can never shift a payday by a day; dates are written back out as
   plain YYYY-MM-DD strings.
   ===================================================================== */
const dayNum = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const isoFromDayNum = (n) => { const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };

export const PAY_FREQS = [
  ["weekly", "Every week"], ["biweekly", "Every 2 weeks"], ["semimonthly", "Twice a month"], ["monthly", "Once a month"],
];

/* every expected payday between two dates (inclusive), as [{date, who}] sorted by date */
export function paydaysBetween(schedules, startIso, endIso) {
  const out = [], a = dayNum(startIso), b = dayNum(endIso);
  for (const s of schedules || []) {
    if (s.active === false) continue;
    if ((s.frequency === "weekly" || s.frequency === "biweekly") && s.anchor_date) {
      const step = s.frequency === "weekly" ? 7 : 14, anchor = dayNum(s.anchor_date);
      let n = anchor + Math.ceil((a - anchor) / step) * step;      // first payday on or after the start
      for (; n <= b; n += step) out.push({ date: isoFromDayNum(n), who: s.who });
    } else if (s.frequency === "semimonthly" || s.frequency === "monthly") {
      const days = s.frequency === "monthly" ? [s.day1] : [s.day1, s.day2];
      const [sy, sm] = startIso.split("-").map(Number), [ey, em] = endIso.split("-").map(Number);
      for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, m = 1) : m++) {
        const last = new Date(y, m, 0).getDate();
        for (const dd of new Set(days.filter((x) => x).map((x) => Math.min(x, last)))) {   // the 31st becomes the last day
          const iso = `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
          if (iso >= startIso && iso <= endIso) out.push({ date: iso, who: s.who });
        }
      }
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

export function nextPayday(schedule, fromIso) {
  const end = isoFromDayNum(dayNum(fromIso) + 62);
  return paydaysBetween([schedule], fromIso, end)[0]?.date || null;
}

export function describeSchedule(s) {
  const ord = (n) => { const t = ["th", "st", "nd", "rd"], v = n % 100; return n + (t[(v - 20) % 10] || t[v] || t[0]); };
  if (s.frequency === "weekly") return "Every week";
  if (s.frequency === "biweekly") return "Every 2 weeks";
  if (s.frequency === "semimonthly") return `The ${ord(s.day1)} and ${ord(s.day2)}`;
  if (s.frequency === "monthly") return `The ${ord(s.day1)} of each month`;
  return "";
}

/* a payday counts as "landed" if a paycheck for that person was logged within two days of it */
export function landedNear(income, who, iso) {
  const n = dayNum(iso);
  return (income || []).find((r) => r.who === who && Math.abs(dayNum(r.received_on) - n) <= 2) || null;
}
