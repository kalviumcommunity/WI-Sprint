(function () {
  let seedRef;
  const RANK = { critical: 0, risk: 1, good: 2 };

  function build(seed, department) {
    const projects = IQ.projectsInScope(seed, department);
    const ids = new Set(projects.map((p) => p.id));
    const cmap = IQ.byId(seed.consultants);
    const byProject = new Map();
    for (const a of seed.allocations) {
      if (!ids.has(a.project_id)) continue;
      if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
      byProject.get(a.project_id).push(a);
    }

    return projects.map((p) => {
      const allocs = byProject.get(p.id) || [];
      const planned = allocs.reduce((s, a) => s + a.planned_pct, 0);
      const actual = allocs.reduce((s, a) => s + a.actual_pct, 0);
      const gap = actual - planned;
      const tol = planned * 0.15;
      let status = "good";
      let statusLabel = "On plan";
      if (gap > tol) {
        status = Math.abs(gap) / (planned || 1) > 0.3 ? "critical" : "risk";
        statusLabel = "Overstaffed";
      } else if (gap < -tol) {
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
        statusRank: RANK[status],
        end_date: p.end_date,
        people: allocs.map((a) => ({ ...a, consultant: cmap.get(a.consultant_id) })).sort((x, y) => y.actual_pct - x.actual_pct),
      };
    });
  }

  function rowHtml(r) {
    const gap = `${r.gap > 0 ? "+" : ""}${r.gap.toFixed(0)}pp`;
    return `<tr class="expandable" data-id="${r.id}" tabindex="0" aria-expanded="false">
        <td><span class="chev" aria-hidden="true"></span><span class="cell-strong">${r.name}</span></td>
        <td>${r.client}</td>
        <td>${r.department}</td>
        <td class="r num">${r.headcount}</td>
        <td class="r num">${r.planned.toFixed(0)}%</td>
        <td class="r num">${r.actual.toFixed(0)}%</td>
        <td class="r num cell-strong">${gap}</td>
        <td class="r"><span class="status status--${r.status}">${r.statusLabel}</span></td>
        <td class="r num">${new Date(r.end_date + "T00:00:00").toLocaleDateString("en-US", { day: "2-digit", month: "short" })}</td>
      </tr>
      <tr class="detail" id="d-${r.id}">
        <td colspan="9">
          <table class="tbl tbl--nested">
            <thead><tr><th>Consultant</th><th>Role</th><th class="r">Planned</th><th class="r">Actual</th><th class="r">Flag</th></tr></thead>
            <tbody>
              ${r.people
                .map((p) => {
                  const flag =
                    p.actual_pct === 0
                      ? '<span class="tag tag--warn">Bench</span>'
                      : p.actual_pct > 100
                        ? '<span class="tag tag--bad">Over capacity</span>'
                        : '<span class="tag tag--mute">—</span>';
                  return `<tr><td>${p.consultant.name}</td><td>${p.consultant.role}</td><td class="r num">${p.planned_pct}%</td><td class="r num">${p.actual_pct}%</td><td class="r">${flag}</td></tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </td>
      </tr>`;
  }

  function renderRows(rows) {
    const tb = document.getElementById("tbody");
    tb.innerHTML = rows.length
      ? rows.map(rowHtml).join("")
      : `<tr><td colspan="9"><div class="empty"><div class="empty__title">No projects in scope</div><div>Try clearing the department filter.</div></div></td></tr>`;

    tb.querySelectorAll("tr.expandable").forEach((tr) => {
      const toggle = () => {
        const open = document.getElementById(`d-${tr.dataset.id}`).classList.toggle("is-open");
        tr.classList.toggle("is-open", open);
        tr.setAttribute("aria-expanded", String(open));
      };
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  function renderSideTables(seed, department) {
    const consultants = IQ.consultantsInScope(seed, department);
    const totals = new Map();
    for (const a of seed.allocations) totals.set(a.consultant_id, (totals.get(a.consultant_id) || 0) + a.actual_pct);

    const over = consultants
      .map((c) => ({ c, pct: totals.get(c.id) || 0 }))
      .filter((x) => x.pct > 100)
      .sort((a, b) => b.pct - a.pct);
    document.getElementById("over-tbody").innerHTML = over.length
      ? over
          .map(
            (x) =>
              `<tr><td><div class="cell-strong">${x.c.name}</div><div class="cell-sub">${x.c.role}</div></td><td>${x.c.department}</td><td class="r num">${x.pct}%</td><td class="r num" style="color:var(--bad)">+${(x.pct - 100).toFixed(0)}pp</td></tr>`
          )
          .join("")
      : `<tr><td colspan="4"><div class="empty" style="padding:28px 0;"><div class="empty__title">Nobody over capacity</div></div></td></tr>`;

    const bench = consultants.filter((c) => (totals.get(c.id) || 0) === 0);
    document.getElementById("bench-tbody").innerHTML = bench.length
      ? bench
          .map((c) => `<tr><td><div class="cell-strong">${c.name}</div><div class="cell-sub">${c.role}</div></td><td>${c.department}</td><td class="r num">$${c.hourly_rate}</td></tr>`)
          .join("")
      : `<tr><td colspan="3"><div class="empty" style="padding:28px 0;"><div class="empty__title">Nobody unstaffed</div></div></td></tr>`;
  }

  function render() {
    const seed = seedRef;
    const sc = IQ.getScope(seed);
    IQ_TABLE.attachSort(document.querySelector("#tbl thead"), { current: build(seed, sc.department) }, renderRows, "gap", "asc");
    renderSideTables(seed, sc.department);
  }

  IQ_SHELL.init("allocation").then((seed) => {
    seedRef = seed;
    render();
    document.addEventListener("iq:filterschange", render);
  });
})();
