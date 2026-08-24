(function () {
  const HIST_KEY = "iq.reportHistory.v1";
  const METRICS = [
    { key: "billable", label: "Billable hours", on: true },
    { key: "non_billable", label: "Non-billable hours", on: true },
    { key: "available", label: "Available hours", on: false },
    { key: "utilization_pct", label: "Utilization %", on: true },
    { key: "bench_cost", label: "Bench cost", on: true },
  ];
  const PERIOD = { week: "This week", month: "This month", quarter: "This quarter", custom: "Custom range" };

  let seedRef;
  let lastRows = [];
  let lastMetrics = [];

  function buildScopes(seed) {
    const clients = [...new Set(seed.projects.map((p) => p.client))].sort();
    document.getElementById("scope").innerHTML =
      `<option value="all">Firm-wide</option>` +
      `<optgroup label="Department">${seed.departments.map((d) => `<option value="department:${d}">${d}</option>`).join("")}</optgroup>` +
      `<optgroup label="Project">${seed.projects.map((p) => `<option value="project:${p.id}">${p.name}</option>`).join("")}</optgroup>` +
      `<optgroup label="Client">${clients.map((c) => `<option value="client:${c}">${c}</option>`).join("")}</optgroup>`;
  }

  function buildMetrics() {
    document.getElementById("metrics").innerHTML = METRICS.map(
      (m) => `<label class="check"><input type="checkbox" data-m="${m.key}" ${m.on ? "checked" : ""}/> ${m.label}</label>`
    ).join("");
  }

  const chosenMetrics = () => METRICS.filter((m) => document.querySelector(`[data-m="${m.key}"]`).checked);

  function scopeSelection(seed, scopeVal, department) {
    let consultants = IQ.consultantsInScope(seed, department);
    let projectFilter = null;

    if (scopeVal.startsWith("department:")) {
      const d = scopeVal.slice(11);
      consultants = seed.consultants.filter((c) => c.department === d);
    } else if (scopeVal.startsWith("project:")) {
      projectFilter = scopeVal.slice(8);
      const ids = new Set(seed.allocations.filter((a) => a.project_id === projectFilter).map((a) => a.consultant_id));
      consultants = seed.consultants.filter((c) => ids.has(c.id));
    } else if (scopeVal.startsWith("client:")) {
      const client = scopeVal.slice(7);
      const pids = new Set(seed.projects.filter((p) => p.client === client).map((p) => p.id));
      const ids = new Set(seed.allocations.filter((a) => pids.has(a.project_id)).map((a) => a.consultant_id));
      consultants = seed.consultants.filter((c) => ids.has(c.id));
    }
    return { consultants, projectFilter };
  }

  function rollup(seed, weeks, consultants, projectFilter) {
    const weekSet = new Set(weeks);
    const ids = new Set(consultants.map((c) => c.id));
    const pmap = IQ.byId(seed.projects);
    const primary = new Map();
    for (const a of seed.allocations) if (!primary.has(a.consultant_id)) primary.set(a.consultant_id, pmap.get(a.project_id));

    const acc = new Map();
    for (const c of consultants) acc.set(c.id, { c, billable: 0, non_billable: 0, available: 0 });
    for (const t of seed.timesheets) {
      if (!weekSet.has(t.week_start) || !ids.has(t.consultant_id)) continue;
      if (projectFilter && t.project_id !== projectFilter) continue;
      const r = acc.get(t.consultant_id);
      r.billable += t.billable_hours;
      r.non_billable += t.non_billable_hours;
      r.available += t.available_hours;
    }

    return [...acc.values()].map((r) => ({
      name: r.c.name,
      role: r.c.role,
      department: r.c.department,
      project: (primary.get(r.c.id) || {}).name || "Unassigned",
      billable: r.billable,
      non_billable: r.non_billable,
      available: r.available,
      utilization_pct: r.available > 0 ? (100 * r.billable) / r.available : null,
      bench_cost: Math.max(0, r.available - r.billable - r.non_billable) * r.c.hourly_rate,
    }));
  }

  function cell(row, key) {
    if (key === "utilization_pct") return IQ.fmtPct(row[key]);
    if (key === "bench_cost") return IQ.fmtMoney(row[key]);
    return IQ.fmtHours(row[key]);
  }

  function renderPreview(rows, metrics, label, periodLabel) {
    document.getElementById("preview-title").textContent = label;
    document.getElementById("preview-note").textContent = `${periodLabel} · ${rows.length} consultant${rows.length === 1 ? "" : "s"}`;
    document.getElementById("thead-row").innerHTML =
      `<th>Consultant</th><th>Department</th><th>Project</th>` + metrics.map((m) => `<th class="r">${m.label}</th>`).join("");

    if (!rows.length) {
      document.getElementById("tbody").innerHTML = `<tr><td colspan="${3 + metrics.length}"><div class="empty"><div class="empty__title">Nothing in this scope</div><div>Pick a broader scope or period.</div></div></td></tr>`;
      document.getElementById("tfoot").innerHTML = "";
      return;
    }

    document.getElementById("tbody").innerHTML = rows
      .map(
        (r) =>
          `<tr><td><div class="cell-strong">${r.name}</div><div class="cell-sub">${r.role}</div></td><td>${r.department}</td><td>${r.project}</td>` +
          metrics.map((m) => `<td class="r num">${cell(r, m.key)}</td>`).join("") +
          `</tr>`
      )
      .join("");

    const totals = {
      billable: rows.reduce((s, r) => s + r.billable, 0),
      non_billable: rows.reduce((s, r) => s + r.non_billable, 0),
      available: rows.reduce((s, r) => s + r.available, 0),
      bench_cost: rows.reduce((s, r) => s + r.bench_cost, 0),
    };
    totals.utilization_pct = totals.available > 0 ? (100 * totals.billable) / totals.available : null;

    document.getElementById("tfoot").innerHTML =
      `<tr class="total-row"><td colspan="3">Total</td>` +
      metrics.map((m) => `<td class="r num">${cell(totals, m.key)}</td>`).join("") +
      `</tr>`;
  }

  const history = () => {
    try {
      return JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
    } catch (e) {
      return [];
    }
  };

  function renderHistory() {
    const h = history();
    document.getElementById("recent").innerHTML = h.length
      ? h
          .map(
            (x) => `<li>
              <div class="attn__body">
                <div class="attn__title">${x.scopeLabel}</div>
                <div class="attn__meta">${x.periodLabel} · ${x.rowCount} rows · ${new Date(x.ts).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}</div>
              </div></li>`
          )
          .join("")
      : `<li style="border:none;"><span style="color:var(--ink-tertiary); font-size:12px;">Nothing generated yet.</span></li>`;
  }

  function pushHistory(entry) {
    localStorage.setItem(HIST_KEY, JSON.stringify([entry, ...history()].slice(0, 6)));
    renderHistory();
  }

  function generate(recordHistory) {
    const seed = seedRef;
    const sc = IQ.getScope(seed);
    const periodLabel = `${PERIOD[sc.state.period]}${sc.department ? " · " + sc.department : ""}`;
    document.getElementById("period-readout").textContent = periodLabel;

    const scopeSel = document.getElementById("scope");
    const scopeVal = scopeSel.value;
    const scopeLabel = scopeSel.options[scopeSel.selectedIndex].text;
    const { consultants, projectFilter } = scopeSelection(seed, scopeVal, sc.department);

    const rows = rollup(seed, sc.weeks, consultants, projectFilter).sort((a, b) => (a.utilization_pct ?? 0) - (b.utilization_pct ?? 0));
    const metrics = chosenMetrics();

    renderPreview(rows, metrics, scopeLabel, periodLabel);
    lastRows = rows;
    lastMetrics = metrics;

    if (recordHistory) pushHistory({ ts: Date.now(), scopeLabel, periodLabel, rowCount: rows.length });
  }

  IQ_SHELL.init("reports").then((seed) => {
    seedRef = seed;
    buildScopes(seed);
    buildMetrics();
    renderHistory();
    generate(false);

    document.getElementById("generate").addEventListener("click", () => generate(true));
    document.getElementById("scope").addEventListener("change", () => generate(false));
    document.getElementById("metrics").addEventListener("change", () => generate(false));
    document.getElementById("pdf").addEventListener("click", () => window.print());
    document.getElementById("csv").addEventListener("click", () => {
      IQ_TABLE.downloadCsv(
        "utilizationiq-report.csv",
        IQ_TABLE.toCsv(lastRows, [
          { key: "name", label: "Consultant" },
          { key: "role", label: "Role" },
          { key: "department", label: "Department" },
          { key: "project", label: "Project" },
          ...lastMetrics.map((m) => ({ key: m.key, label: m.label, value: (r) => cell(r, m.key) })),
        ])
      );
    });

    document.addEventListener("iq:filterschange", () => generate(false));
  });
})();
