(function () {
  const statusRank = { critical: 0, risk: 1, good: 2 };

  function projectRows(seed, department) {
    const projects = IQ.projectsInScope(seed, department);
    const projectIds = new Set(projects.map((p) => p.id));
    const consultantMap = IQ.byId(seed.consultants);
    const byProject = new Map();
    for (const a of seed.allocations) {
      if (!projectIds.has(a.project_id)) continue;
      if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
      byProject.get(a.project_id).push(a);
    }

    return projects.map((p) => {
      const allocs = byProject.get(p.id) || [];
      const planned = allocs.reduce((s, a) => s + a.planned_pct, 0);
      const actual = allocs.reduce((s, a) => s + a.actual_pct, 0);
      const gap = actual - planned;
      const tolerance = planned * 0.15;
      let status = "good";
      let statusLabel = "On plan";
      if (gap > tolerance) {
        status = Math.abs(gap) / (planned || 1) > 0.3 ? "critical" : "risk";
        statusLabel = "Overstaffed";
      } else if (gap < -tolerance) {
        status = Math.abs(gap) / (planned || 1) > 0.3 ? "critical" : "risk";
        statusLabel = "Understaffed";
      }
      return {
        id: p.id,
        name: p.name,
        client: p.client,
        department: p.department,
        headcount: allocs.length,
        planned,
        actual,
        gap,
        status,
        statusLabel,
        statusRank: statusRank[status],
        start_date: p.start_date,
        end_date: p.end_date,
        people: allocs.map((a) => ({ ...a, consultant: consultantMap.get(a.consultant_id) })),
      };
    });
  }

  function rowHtml(r) {
    const gapLabel = `${r.gap > 0 ? "+" : ""}${r.gap.toFixed(0)}pp`;
    return `
      <tr class="row-expandable" data-project="${r.id}">
        <td>${r.name}</td>
        <td>${r.client}</td>
        <td>${r.department}</td>
        <td class="is-num tabular">${r.headcount}</td>
        <td class="is-num tabular">${r.planned.toFixed(0)}%</td>
        <td class="is-num tabular">${r.actual.toFixed(0)}%</td>
        <td class="is-num tabular">${gapLabel}</td>
        <td class="is-num"><span class="status status--${r.status}">${r.statusLabel}</span></td>
        <td>${r.start_date}</td>
        <td>${r.end_date}</td>
      </tr>
      <tr class="row-detail" id="detail-${r.id}">
        <td colspan="10">
          <table class="data-table" style="margin:0;">
            <thead><tr><th data-type="text">Consultant</th><th data-type="text">Role</th><th class="is-num">Planned %</th><th class="is-num">Actual %</th><th class="is-num">Flag</th></tr></thead>
            <tbody>
              ${r.people
                .map((p) => {
                  const flag = p.actual_pct === 0 ? '<span class="pill pill--under">Bench</span>' : p.actual_pct > 100 ? '<span class="pill pill--over">Over 100%</span>' : "";
                  return `<tr><td>${p.consultant.name}</td><td>${p.consultant.role}</td><td class="is-num tabular">${p.planned_pct}%</td><td class="is-num tabular">${p.actual_pct}%</td><td class="is-num">${flag}</td></tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </td>
      </tr>`;
  }

  function renderRows(rows) {
    document.getElementById("alloc-tbody").innerHTML = rows.length
      ? rows.map(rowHtml).join("")
      : `<tr><td colspan="10"><div class="empty-state">No projects match the current filters.</div></td></tr>`;

    document.querySelectorAll("#alloc-tbody .row-expandable").forEach((tr) => {
      tr.addEventListener("click", () => {
        document.getElementById(`detail-${tr.dataset.project}`).classList.toggle("is-open");
      });
    });
  }

  function renderBench(seed, department) {
    const consultants = IQ.consultantsInScope(seed, department);
    const totals = new Map();
    for (const a of seed.allocations) totals.set(a.consultant_id, (totals.get(a.consultant_id) || 0) + a.actual_pct);
    const bench = consultants.filter((c) => (totals.get(c.id) || 0) === 0);
    const tbody = document.getElementById("bench-tbody");
    tbody.innerHTML = bench.length
      ? bench
          .map((c) => `<tr><td>${c.name}</td><td>${c.role}</td><td>${c.department}</td><td class="is-num tabular">$${c.hourly_rate}</td></tr>`)
          .join("")
      : `<tr><td colspan="4"><div class="empty-state" style="padding:24px 0;">No one is fully unstaffed right now.</div></td></tr>`;
  }

  function render(seed) {
    const scope = IQ.getScope(seed);
    const rows = projectRows(seed, scope.department);
    const rowsRef = { current: rows };
    IQ_TABLE.attachSort(document.querySelector("#alloc-table thead"), rowsRef, renderRows, "gap", "desc");
    renderBench(seed, scope.department);
  }

  IQ_SHELL.init("allocation").then((seed) => {
    render(seed);
    document.addEventListener("iq:filterschange", () => render(seed));
  });
})();
