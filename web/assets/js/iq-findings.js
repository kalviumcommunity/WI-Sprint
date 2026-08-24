/* Computes the "detected issue" findings shared by the Executive Overview
   ("needs attention", top 5) and the full Inefficiency Insights table.
   Every finding carries the evidence numbers that triggered it - no
   unexplained "AI risk score", just arithmetic a reviewer can re-check. */

const IQ_FINDINGS = (() => {
  function benchFindings(seed, weeks, department, target) {
    const rows = IQ.rollupConsultants(seed, weeks, department);
    const out = [];
    for (const r of rows) {
      if (r.available <= 0) continue;
      if (r.utilization_pct >= target) continue;
      const costImpact = r.bench * r.consultant.hourly_rate;
      out.push({
        type: "Bench time",
        severity: r.utilization_pct < target - 15 ? "critical" : "risk",
        title: `${r.consultant.name} tracking under target`,
        meta: `${r.consultant.department} · ${r.consultant.role}`,
        costImpact,
        detail: `${IQ.fmtPct(r.utilization_pct)} utilization (${IQ.fmtHours(r.billable)}h billable / ${IQ.fmtHours(r.available)}h available) vs ${target}% target · ${IQ.fmtHours(r.bench)}h unbilled bench time in scope`,
        link: "utilization.html",
      });
    }
    return out;
  }

  function nonBillableFindings(seed, weeks, department) {
    const rows = IQ.rollupConsultants(seed, weeks, department);
    const out = [];
    for (const r of rows) {
      if (r.logged <= 0) continue;
      const share = (r.non_billable / r.logged) * 100;
      if (share < 35) continue;
      out.push({
        type: "Non-billable overload",
        severity: share >= 45 ? "critical" : "risk",
        title: `${r.consultant.name} logging ${share.toFixed(0)}% non-billable`,
        meta: `${r.consultant.department} · ${r.consultant.role}`,
        costImpact: r.non_billable * r.consultant.hourly_rate * 0.5,
        detail: `${IQ.fmtHours(r.non_billable)}h non-billable of ${IQ.fmtHours(r.logged)}h logged in scope, well above the ~20% norm`,
        link: "utilization.html",
      });
    }
    return out;
  }

  function overallocationFindings(seed, department) {
    const consultants = IQ.consultantsInScope(seed, department);
    const idSet = new Set(consultants.map((c) => c.id));
    const consultantMap = IQ.byId(seed.consultants);
    const totals = new Map();
    for (const a of seed.allocations) {
      if (!idSet.has(a.consultant_id)) continue;
      totals.set(a.consultant_id, (totals.get(a.consultant_id) || 0) + a.actual_pct);
    }
    const out = [];
    for (const [cid, pct] of totals.entries()) {
      if (pct <= 100) continue;
      const c = consultantMap.get(cid);
      const overHours = ((pct - 100) / 100) * 40;
      out.push({
        type: "Overallocation",
        severity: pct >= 130 ? "critical" : "risk",
        title: `${c.name} allocated at ${pct}% of capacity`,
        meta: `${c.department} · ${c.role}`,
        costImpact: overHours * c.hourly_rate,
        detail: `Actual allocation across current projects sums to ${pct}% of a standard week (${overHours.toFixed(1)}h/week over capacity) - burnout and margin risk`,
        link: "allocation.html",
      });
    }
    return out;
  }

  function staffingGapFindings(seed, department) {
    const projects = IQ.projectsInScope(seed, department);
    const projectIds = new Set(projects.map((p) => p.id));
    const projectMap = IQ.byId(projects);
    const planned = new Map();
    const actual = new Map();
    const headcount = new Map();
    for (const a of seed.allocations) {
      if (!projectIds.has(a.project_id)) continue;
      planned.set(a.project_id, (planned.get(a.project_id) || 0) + a.planned_pct);
      actual.set(a.project_id, (actual.get(a.project_id) || 0) + a.actual_pct);
      headcount.set(a.project_id, (headcount.get(a.project_id) || 0) + 1);
    }
    const out = [];
    for (const pid of planned.keys()) {
      const p = planned.get(pid);
      const a = actual.get(pid);
      const gap = a - p;
      const tolerance = p * 0.15;
      if (Math.abs(gap) <= tolerance) continue;
      const proj = projectMap.get(pid);
      const gapHours = (Math.abs(gap) / 100) * 40;
      out.push({
        type: gap > 0 ? "Project overstaffed" : "Project understaffed",
        severity: Math.abs(gap) / p > 0.3 ? "critical" : "risk",
        title: `${proj.name} (${proj.client}) ${gap > 0 ? "over" : "under"} plan by ${Math.abs(gap).toFixed(0)}pp`,
        meta: `${proj.department} · ${headcount.get(pid)} assigned`,
        costImpact: gapHours * 175,
        detail: `Actual allocation ${a.toFixed(0)}% vs planned ${p.toFixed(0)}% across ${headcount.get(pid)} consultants (${gapHours.toFixed(1)}h/week gap)`,
        link: "allocation.html",
      });
    }
    return out;
  }

  function billingFindings(seed, weeks, department) {
    const rows = IQ.billingInScope(seed, weeks, department);
    const projectMap = IQ.byId(seed.projects);
    const byProject = new Map();
    for (const r of rows) {
      if (!byProject.has(r.project_id)) byProject.set(r.project_id, { logged: 0, invoiced: 0, loggedHours: 0, invoicedHours: 0 });
      const acc = byProject.get(r.project_id);
      acc.logged += r.logged_amount;
      acc.invoiced += r.invoiced_amount;
      acc.loggedHours += r.logged_billable_hours;
      acc.invoicedHours += r.invoiced_hours;
    }
    const out = [];
    for (const [pid, acc] of byProject.entries()) {
      const variance = acc.logged - acc.invoiced;
      if (Math.abs(variance) < 800) continue;
      const proj = projectMap.get(pid);
      out.push({
        type: variance > 0 ? "Under-billed" : "Over-billed",
        severity: Math.abs(variance) >= 4000 ? "critical" : "risk",
        title: `${proj.client} ${variance > 0 ? "under-billed" : "over-billed"} ${IQ.fmtMoney(Math.abs(variance))}`,
        meta: `${proj.name}`,
        costImpact: Math.abs(variance),
        detail: `${IQ.fmtHours(acc.loggedHours)}h logged billable ($${Math.round(acc.logged).toLocaleString()}) vs ${IQ.fmtHours(acc.invoicedHours)}h invoiced ($${Math.round(acc.invoiced).toLocaleString()}) in scope`,
        link: "reconciliation.html",
      });
    }
    return out;
  }

  function computeAll(seed, weeks, department, target) {
    const all = [
      ...benchFindings(seed, weeks, department, target),
      ...nonBillableFindings(seed, weeks, department),
      ...overallocationFindings(seed, department),
      ...staffingGapFindings(seed, department),
      ...billingFindings(seed, weeks, department),
    ];
    all.sort((a, b) => b.costImpact - a.costImpact);
    return all;
  }

  return { computeAll };
})();
