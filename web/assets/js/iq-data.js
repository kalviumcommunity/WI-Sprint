/* UtilizationIQ - data loading + rollups shared by every screen.
   Single source of truth so utilization math is identical across pages. */

const IQ = (() => {
  const STATE_KEY = "iq.filters.v1";

  /* Seed data ships as a plain script (assets/data/seed-data.js) that assigns
     window.IQ_SEED, so the site renders identically over http(s) and when the
     files are opened directly off disk. Kept promise-returning so callers
     don't care where it came from. */
  function loadSeed() {
    if (!window.IQ_SEED) {
      return Promise.reject(new Error("seed-data.js did not load; window.IQ_SEED is undefined"));
    }
    return Promise.resolve(window.IQ_SEED);
  }

  function defaultState() {
    return { department: "", period: "quarter", customFrom: "", customTo: "" };
  }

  function getState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return defaultState();
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch (e) {
      return defaultState();
    }
  }

  function setState(patch) {
    const next = { ...getState(), ...patch };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    document.dispatchEvent(new CustomEvent("iq:filterschange", { detail: next }));
    return next;
  }

  function weeksForPeriod(seed, period, state) {
    const all = seed.weeks; // ascending, oldest -> newest
    if (period === "week") return all.slice(-1);
    if (period === "month") return all.slice(-4);
    if (period === "quarter") return all.slice(-12);
    if (period === "custom" && state.customFrom && state.customTo) {
      const from = all.indexOf(state.customFrom);
      const to = all.indexOf(state.customTo);
      if (from === -1 || to === -1) return all.slice(-12);
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      return all.slice(lo, hi + 1);
    }
    return all.slice(-12);
  }

  function previousWeeks(seed, currentWeeks) {
    const all = seed.weeks;
    const startIdx = all.indexOf(currentWeeks[0]);
    const len = currentWeeks.length;
    const prevStart = Math.max(0, startIdx - len);
    if (prevStart === startIdx) return [];
    return all.slice(prevStart, startIdx);
  }

  function getScope(seed) {
    const state = getState();
    const weeks = weeksForPeriod(seed, state.period, state);
    const prevWeeks = previousWeeks(seed, weeks);
    const department = state.department || null;
    return { state, weeks, prevWeeks, department };
  }

  function consultantsInScope(seed, department) {
    return department ? seed.consultants.filter((c) => c.department === department) : seed.consultants;
  }

  function projectsInScope(seed, department) {
    return department ? seed.projects.filter((p) => p.department === department) : seed.projects;
  }

  function byId(list) {
    const map = new Map();
    for (const item of list) map.set(item.id, item);
    return map;
  }

  /** Per-consultant totals for the given weeks + department scope. */
  function rollupConsultants(seed, weeks, department) {
    const weekSet = new Set(weeks);
    const consultants = consultantsInScope(seed, department);
    const idSet = new Set(consultants.map((c) => c.id));
    const map = new Map();
    for (const c of consultants) map.set(c.id, { consultant: c, billable: 0, non_billable: 0, available: 0 });

    for (const t of seed.timesheets) {
      if (!weekSet.has(t.week_start) || !idSet.has(t.consultant_id)) continue;
      const row = map.get(t.consultant_id);
      row.billable += t.billable_hours;
      row.non_billable += t.non_billable_hours;
      row.available += t.available_hours;
    }

    return [...map.values()].map((r) => ({
      ...r,
      logged: r.billable + r.non_billable,
      bench: Math.max(0, r.available - r.billable - r.non_billable),
      utilization_pct: r.available > 0 ? (100 * r.billable) / r.available : null,
    }));
  }

  function rollupTotals(rows) {
    const billable = rows.reduce((s, r) => s + r.billable, 0);
    const non_billable = rows.reduce((s, r) => s + r.non_billable, 0);
    const available = rows.reduce((s, r) => s + r.available, 0);
    const bench = rows.reduce((s, r) => s + r.bench, 0);
    return {
      billable,
      non_billable,
      available,
      bench,
      utilization_pct: available > 0 ? (100 * billable) / available : null,
    };
  }

  function rollupByDepartment(seed, weeks, department) {
    const rows = rollupConsultants(seed, weeks, department);
    const map = new Map();
    for (const r of rows) {
      const d = r.consultant.department;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(r);
    }
    return [...map.entries()].map(([dept, rs]) => ({ department: dept, ...rollupTotals(rs) }));
  }

  function rollupByProject(seed, weeks, department) {
    const weekSet = new Set(weeks);
    const projects = projectsInScope(seed, department);
    const projectIds = new Set(projects.map((p) => p.id));
    const consultantMap = byId(seed.consultants);
    const map = new Map();
    for (const p of projects) map.set(p.id, { project: p, billable: 0, non_billable: 0, available: 0 });

    for (const t of seed.timesheets) {
      if (!weekSet.has(t.week_start) || !projectIds.has(t.project_id)) continue;
      const row = map.get(t.project_id);
      row.billable += t.billable_hours;
      row.non_billable += t.non_billable_hours;
      row.available += t.available_hours;
    }
    return [...map.values()].map((r) => ({
      ...r,
      utilization_pct: r.available > 0 ? (100 * r.billable) / r.available : null,
    }));
  }

  /** Bench cost = idle (available-but-unlogged) hours x rate, for the scope. */
  function benchCost(seed, weeks, department) {
    const rows = rollupConsultants(seed, weeks, department);
    return rows.reduce((sum, r) => sum + r.bench * r.consultant.hourly_rate, 0);
  }

  function billingInScope(seed, weeks, department) {
    const weekSet = new Set(weeks);
    const projects = projectsInScope(seed, department);
    const projectIds = new Set(projects.map((p) => p.id));
    return seed.billing.filter((b) => weekSet.has(b.week_start) && projectIds.has(b.project_id));
  }

  /** Unbilled variance = logged billable $ minus invoiced $, summed over scope. */
  function unbilledVariance(seed, weeks, department) {
    const rows = billingInScope(seed, weeks, department);
    return rows.reduce((sum, r) => sum + (r.logged_amount - r.invoiced_amount), 0);
  }

  function fmtHours(n) {
    return `${n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  }

  function fmtPct(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return `${n.toFixed(1)}%`;
  }

  function fmtMoney(n) {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }

  function weekLabel(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function statusForUtilization(pct, target) {
    if (pct === null) return "neutral";
    if (pct > 115) return "critical"; // overloaded well past standard capacity - burnout risk
    if (pct > 100) return "risk"; // billing above standard capacity, worth a look
    if (pct >= target) return "good";
    if (pct >= target - 15) return "risk";
    return "critical";
  }

  return {
    loadSeed,
    getState,
    setState,
    defaultState,
    getScope,
    weeksForPeriod,
    previousWeeks,
    consultantsInScope,
    projectsInScope,
    byId,
    rollupConsultants,
    rollupTotals,
    rollupByDepartment,
    rollupByProject,
    benchCost,
    billingInScope,
    unbilledVariance,
    fmtHours,
    fmtPct,
    fmtMoney,
    weekLabel,
    statusForUtilization,
  };
})();
