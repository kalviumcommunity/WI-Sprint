(function () {
  let seedRef;
  let groupBy = "department";
  let latest = [];

  const RANK = { critical: 0, risk: 1, good: 2, neutral: 3 };
  const LABEL = { critical: "Critical", risk: "At risk", good: "On target", neutral: "No data" };

  function build(seed, sc, target) {
    const rows = IQ.rollupConsultants(seed, sc.weeks, sc.department);
    const pmap = IQ.byId(seed.projects);
    const byConsultant = new Map();
    for (const a of seed.allocations) {
      if (!byConsultant.has(a.consultant_id)) byConsultant.set(a.consultant_id, []);
      byConsultant.get(a.consultant_id).push(pmap.get(a.project_id));
    }

    return rows.map((r) => {
      const ps = (byConsultant.get(r.consultant.id) || []).filter(Boolean);
      const projectLabel = ps.length === 0 ? "Unassigned" : ps.length === 1 ? ps[0].name : `${ps.length} projects`;
      // Over 100% means billing past a standard week - flagged, not celebrated.
      const status = IQ.statusForUtilization(r.utilization_pct, target);
      return {
        name: r.consultant.name,
        role: r.consultant.role,
        department: r.consultant.department,
        projectLabel,
        primaryProject: ps[0] ? ps[0].name : "Unassigned",
        billable: r.billable,
        non_billable: r.non_billable,
        available: r.available,
        utilization_pct: r.utilization_pct,
        status,
        statusLabel: r.utilization_pct > 100 ? "Over capacity" : LABEL[status],
        statusRank: RANK[status],
      };
    });
  }

  function rowHtml(r) {
    return `<tr>
      <td>
        <div class="cell-strong">${r.name}</div>
        <div class="cell-sub">${r.role}</div>
      </td>
      <td>${r.department}</td>
      <td>${r.projectLabel}</td>
      <td class="r num">${IQ.fmtHours(r.billable)}</td>
      <td class="r num">${IQ.fmtHours(r.non_billable)}</td>
      <td class="r num">${IQ.fmtHours(r.available)}</td>
      <td class="r">${IQ_CHARTS.splitBar(r.billable, r.non_billable)}</td>
      <td class="r num cell-strong">${IQ.fmtPct(r.utilization_pct)}</td>
      <td class="r"><span class="status status--${r.status}">${r.statusLabel}</span></td>
    </tr>`;
  }

  function renderRows(rows) {
    latest = rows;
    const key = groupBy === "department" ? "department" : "primaryProject";
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r[key])) groups.set(r[key], []);
      groups.get(r[key]).push(r);
    }
    if (!rows.length) {
      document.getElementById("tbody").innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty__title">No consultants in scope</div><div>Try widening the department or period filter.</div></div></td></tr>`;
      return;
    }
    let html = "";
    for (const name of [...groups.keys()].sort()) {
      const g = groups.get(name);
      const totals = g.reduce((a, r) => ({ b: a.b + r.billable, av: a.av + r.available }), { b: 0, av: 0 });
      const avg = totals.av > 0 ? (100 * totals.b) / totals.av : 0;
      html += `<tr class="group-row"><td colspan="9">${name} — ${g.length} consultant${g.length === 1 ? "" : "s"} · ${avg.toFixed(1)}% utilization</td></tr>`;
      html += g.map(rowHtml).join("");
    }
    document.getElementById("tbody").innerHTML = html;
  }

  function render() {
    const seed = seedRef;
    const sc = IQ.getScope(seed);
    const rows = build(seed, sc, seed.target_utilization_pct);
    IQ_TABLE.attachSort(document.querySelector("#tbl thead"), { current: rows }, renderRows, "utilization_pct", "asc");
  }

  IQ_SHELL.init("utilization").then((seed) => {
    seedRef = seed;
    render();

    document.getElementById("group-toggle").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-group]");
      if (!b) return;
      groupBy = b.dataset.group;
      document.querySelectorAll("#group-toggle button").forEach((x) => x.classList.toggle("is-active", x === b));
      render();
    });

    document.getElementById("export").addEventListener("click", () => {
      IQ_TABLE.downloadCsv(
        "utilization-breakdown.csv",
        IQ_TABLE.toCsv(latest, [
          { key: "name", label: "Consultant" },
          { key: "role", label: "Role" },
          { key: "department", label: "Department" },
          { key: "projectLabel", label: "Project" },
          { key: "billable", label: "Billable hours", value: (r) => r.billable.toFixed(1) },
          { key: "non_billable", label: "Non-billable hours", value: (r) => r.non_billable.toFixed(1) },
          { key: "available", label: "Available hours", value: (r) => r.available.toFixed(1) },
          { key: "utilization_pct", label: "Utilization %", value: (r) => (r.utilization_pct === null ? "" : r.utilization_pct.toFixed(1)) },
          { key: "statusLabel", label: "Status" },
        ])
      );
    });

    document.addEventListener("iq:filterschange", render);
  });
})();
