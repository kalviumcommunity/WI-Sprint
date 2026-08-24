(function () {
  const HISTORY_KEY = "iq.reportHistory.v1";
  const METRICS = [
    { key: "billable", label: "Billable hours", default: true },
    { key: "non_billable", label: "Non-billable hours", default: true },
    { key: "available", label: "Available hours", default: false },
    { key: "utilization_pct", label: "Utilization %", default: true },
    { key: "bench_cost", label: "Bench cost", default: true },
  ];
  const PERIOD_LABEL = { week: "This week", month: "This month", quarter: "This quarter", custom: "Custom range" };

  let seedRef;

  function buildScopeOptions(seed) {
    const sel = document.getElementById("scope-select");
    const clients = [...new Set(seed.projects.map((p) => p.client))].sort();
    sel.innerHTML =
      `<option value="all">Firm-wide</option>` +
      `<optgroup label="Department">${seed.departments.map((d) => `<option value="department:${d}">${d}</option>`).join("")}</optgroup>` +
      `<optgroup label="Project">${seed.projects.map((p) => `<option value="project:${p.id}">${p.name}</option>`).join("")}</optgroup>` +
      `<optgroup label="Client">${clients.map((c) => `<option value="client:${c}">${c}</option>`).join("")}</optgroup>`;
  }

  function buildMetricChecks() {
    const el = document.getElementById("metric-checks");
    el.innerHTML = METRICS.map(
      (m) => `<label class="checkbox-row"><input type="checkbox" data-metric="${m.key}" ${m.default ? "checked" : ""}/> ${m.label}</label>`
    ).join("");
  }

  function selectedMetrics() {
    return METRICS.filter((m) => document.querySelector(`[data-metric="${m.key}"]`).checked);
  }

  function scopedConsultantsAndProject(seed, scopeVal, department) {
    let consultants = IQ.consultantsInScope(seed, department);
    let projectFilter = null;

    if (scopeVal.startsWith("department:")) {
      const dep = scopeVal.split(":")[1];
      consultants = seed.consultants.filter((c) => c.department === dep);
    } else if (scopeVal.startsWith("project:")) {
      const pid = scopeVal.split(":")[1];
      projectFilter = pid;
      const ids = new Set(seed.allocations.filter((a) => a.project_id === pid).map((a) => a.consultant_id));
      consultants = seed.consultants.filter((c) => ids.has(c.id));
    } else if (scopeVal.startsWith("client:")) {
      const client = scopeVal.split(":")[1];
      const pids = new Set(seed.projects.filter((p) => p.client === client).map((p) => p.id));
      const ids = new Set(seed.allocations.filter((a) => pids.has(a.project_id)).map((a) => a.consultant_id));
      consultants = seed.consultants.filter((c) => ids.has(c.id));
    }
    return { consultants, projectFilter };
  }

  function rollupForReport(seed, weeks, consultants, projectFilter) {
    const weekSet = new Set(weeks);
    const idSet = new Set(consultants.map((c) => c.id));
    const projectMap = IQ.byId(seed.projects);
    const primaryProject = new Map();
    for (const a of seed.allocations) {
      if (!primaryProject.has(a.consultant_id)) primaryProject.set(a.consultant_id, projectMap.get(a.project_id));
    }

    const map = new Map();
    for (const c of consultants) map.set(c.id, { consultant: c, billable: 0, non_billable: 0, available: 0 });
    for (const t of seed.timesheets) {
      if (!weekSet.has(t.week_start) || !idSet.has(t.consultant_id)) continue;
      if (projectFilter && t.project_id !== projectFilter) continue;
      const row = map.get(t.consultant_id);
      row.billable += t.billable_hours;
      row.non_billable += t.non_billable_hours;
      row.available += t.available_hours;
    }
    return [...map.values()].map((r) => ({
      name: r.consultant.name,
      role: r.consultant.role,
      department: r.consultant.department,
      project: (primaryProject.get(r.consultant.id) || {}).name || "Unassigned",
      billable: r.billable,
      non_billable: r.non_billable,
      available: r.available,
      utilization_pct: r.available > 0 ? (100 * r.billable) / r.available : null,
      bench_cost: Math.max(0, r.available - r.billable - r.non_billable) * r.consultant.hourly_rate,
    }));
  }

  function metricCell(row, key) {
    if (key === "utilization_pct") return IQ.fmtPct(row[key]);
    if (key === "bench_cost") return IQ.fmtMoney(row[key]);
    return IQ.fmtHours(row[key]);
  }

  function renderPreview(rows, metrics, scopeLabel) {
    document.getElementById("preview-title").textContent = `Preview - ${scopeLabel}`;
    document.getElementById("report-thead-row").innerHTML =
      `<th data-type="text">Name</th><th data-type="text">Role</th><th data-type="text">Department</th><th data-type="text">Project</th>` +
      metrics.map((m) => `<th class="is-num">${m.label}</th>`).join("");

    document.getElementById("report-tbody").innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<tr><td>${r.name}</td><td>${r.role}</td><td>${r.department}</td><td>${r.project}</td>` +
              metrics.map((m) => `<td class="is-num tabular">${metricCell(r, m.key)}</td>`).join("") +
              `</tr>`
          )
          .join("")
      : `<tr><td colspan="${4 + metrics.length}"><div class="empty-state">No consultants match this scope.</div></td></tr>`;

    document.getElementById("report-tfoot").innerHTML = "";
  }

  function scopeLabelFor(seed, scopeVal) {
    const sel = document.getElementById("scope-select");
    return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : scopeVal;
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveHistory(entry) {
    const hist = [entry, ...loadHistory()].slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
  }
  function renderHistory() {
    const hist = loadHistory();
    const el = document.getElementById("recent-list");
    el.innerHTML = hist.length
      ? hist
          .map(
            (h) => `
        <li>
          <div class="attention-list__body">
            <div class="attention-list__title">${h.scopeLabel}</div>
            <div class="attention-list__meta">${h.periodLabel} &middot; ${h.rowCount} rows &middot; ${new Date(h.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          </div>
        </li>`
          )
          .join("")
      : `<li><span style="color:var(--color-text-tertiary); font-size:12px;">No reports generated yet this session.</span></li>`;
  }

  let lastRows = [];
  let lastMetrics = [];

  function generate() {
    const seed = seedRef;
    const scope = IQ.getScope(seed);
    document.getElementById("period-readout").textContent = `${PERIOD_LABEL[scope.state.period]}${scope.state.department ? " · " + scope.state.department : ""}`;

    const scopeVal = document.getElementById("scope-select").value;
    const { consultants, projectFilter } = scopedConsultantsAndProject(seed, scopeVal, scope.department);
    const rows = rollupForReport(seed, scope.weeks, consultants, projectFilter);
    const metrics = selectedMetrics();
    const scopeLabel = scopeLabelFor(seed, scopeVal);

    renderPreview(rows, metrics, scopeLabel);
    lastRows = rows;
    lastMetrics = metrics;

    saveHistory({ timestamp: Date.now(), scopeLabel, periodLabel: PERIOD_LABEL[scope.state.period], rowCount: rows.length });
  }

  function exportCsv() {
    const columns = [
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "department", label: "Department" },
      { key: "project", label: "Project" },
      ...lastMetrics.map((m) => ({ key: m.key, label: m.label, value: (r) => metricCell(r, m.key) })),
    ];
    IQ_TABLE.downloadCsv("utilizationiq-report.csv", IQ_TABLE.toCsv(lastRows, columns));
  }

  IQ_SHELL.init("reports").then((seed) => {
    seedRef = seed;
    buildScopeOptions(seed);
    buildMetricChecks();
    renderHistory();
    generate();

    document.getElementById("generate-btn").addEventListener("click", generate);
    document.getElementById("csv-btn").addEventListener("click", exportCsv);
    document.getElementById("pdf-btn").addEventListener("click", () => window.print());
    document.addEventListener("iq:filterschange", generate);
  });
})();
