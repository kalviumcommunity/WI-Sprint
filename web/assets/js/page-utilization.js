(function () {
  let groupBy = "department";
  const statusRank = { critical: 0, risk: 1, good: 2, neutral: 3 };
  const statusText = { critical: "Critical", risk: "At risk", good: "On target", neutral: "No data" };

  function buildRows(seed, scope, target) {
    const rows = IQ.rollupConsultants(seed, scope.weeks, scope.department);
    const projectMap = IQ.byId(seed.projects);
    const projectsByConsultant = new Map();
    for (const a of seed.allocations) {
      if (!projectsByConsultant.has(a.consultant_id)) projectsByConsultant.set(a.consultant_id, []);
      projectsByConsultant.get(a.consultant_id).push(projectMap.get(a.project_id));
    }

    return rows.map((r) => {
      const projects = (projectsByConsultant.get(r.consultant.id) || []).filter(Boolean);
      const projectLabel = projects.length === 0 ? "Unassigned" : projects.length === 1 ? projects[0].name : `${projects.length} projects`;
      const status = IQ.statusForUtilization(r.utilization_pct, target);
      return {
        id: r.consultant.id,
        name: r.consultant.name,
        role: r.consultant.role,
        department: r.consultant.department,
        projectLabel,
        primaryProject: projects[0] ? projects[0].name : "Unassigned",
        billable: r.billable,
        non_billable: r.non_billable,
        available: r.available,
        utilization_pct: r.utilization_pct,
        status,
        statusRank: statusRank[status],
      };
    });
  }

  function rowHtml(r) {
    return `
      <tr>
        <td>${r.name}</td>
        <td>${r.role}</td>
        <td>${r.department}</td>
        <td>${r.projectLabel}</td>
        <td class="is-num tabular">${IQ.fmtHours(r.billable)}</td>
        <td class="is-num tabular">${IQ.fmtHours(r.non_billable)}</td>
        <td class="is-num tabular">${IQ.fmtHours(r.available)}</td>
        <td class="is-num">${IQ_CHARTS.splitBarHtml(r.billable, r.non_billable)}</td>
        <td class="is-num tabular">${IQ.fmtPct(r.utilization_pct)}</td>
        <td class="is-num"><span class="status status--${r.status}">${statusText[r.status]}</span></td>
      </tr>`;
  }

  function renderGrouped(rows) {
    const groupKey = groupBy === "department" ? "department" : "primaryProject";
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r[groupKey])) groups.set(r[groupKey], []);
      groups.get(r[groupKey]).push(r);
    }
    const sortedGroupNames = [...groups.keys()].sort();
    let html = "";
    for (const name of sortedGroupNames) {
      const groupRows = groups.get(name);
      const avgUtil = groupRows.reduce((s, r) => s + (r.utilization_pct || 0), 0) / groupRows.length;
      html += `<tr><td colspan="10" style="background:var(--color-bg); font-weight:600; color:var(--color-text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.03em;">${name} &middot; ${groupRows.length} consultants &middot; avg ${avgUtil.toFixed(1)}%</td></tr>`;
      html += groupRows.map(rowHtml).join("");
    }
    document.getElementById("util-tbody").innerHTML = html || `<tr><td colspan="10"><div class="empty-state">No consultants match the current filters.</div></td></tr>`;
  }

  function render(seed) {
    const scope = IQ.getScope(seed);
    const target = seed.target_utilization_pct;
    const rows = buildRows(seed, scope, target);
    const rowsRef = { current: rows };

    IQ_TABLE.attachSort(document.querySelector("#util-table thead"), rowsRef, renderGrouped, "utilization_pct", "asc");

    document.getElementById("export-btn").onclick = () => {
      const csv = IQ_TABLE.toCsv(rows, [
        { key: "name", label: "Name" },
        { key: "role", label: "Role" },
        { key: "department", label: "Department" },
        { key: "projectLabel", label: "Project" },
        { key: "billable", label: "Billable hrs" },
        { key: "non_billable", label: "Non-billable hrs" },
        { key: "available", label: "Available hrs" },
        { key: "utilization_pct", label: "Utilization %" },
        { key: "status", label: "Status" },
      ]);
      IQ_TABLE.downloadCsv("utilization-breakdown.csv", csv);
    };
  }

  IQ_SHELL.init("utilization").then((seed) => {
    render(seed);
    document.getElementById("group-toggle").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-group]");
      if (!btn) return;
      groupBy = btn.dataset.group;
      document.querySelectorAll("#group-toggle button").forEach((b) => b.classList.toggle("is-active", b === btn));
      render(seed);
    });
    document.addEventListener("iq:filterschange", () => render(seed));
  });
})();
