(function () {
  let seedRef;
  let latest = [];
  const RANK = { critical: 0, risk: 1, good: 2 };

  function build(seed, sc) {
    const rows = IQ.billingInScope(seed, sc.weeks, sc.department);
    const pmap = IQ.byId(seed.projects);
    const byProject = new Map();
    for (const r of rows) {
      if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
      byProject.get(r.project_id).push(r);
    }

    return [...byProject.entries()].map(([pid, entries]) => {
      const p = pmap.get(pid);
      const loggedHours = entries.reduce((s, e) => s + e.logged_billable_hours, 0);
      const invoicedHours = entries.reduce((s, e) => s + e.invoiced_hours, 0);
      const loggedAmount = entries.reduce((s, e) => s + e.logged_amount, 0);
      const invoicedAmount = entries.reduce((s, e) => s + e.invoiced_amount, 0);
      const variance = loggedAmount - invoicedAmount;
      const variancePct = loggedAmount ? (variance / loggedAmount) * 100 : 0;

      let status = "good";
      let statusLabel = "Reconciled";
      if (Math.abs(variancePct) > 8) {
        status = Math.abs(variancePct) > 15 ? "critical" : "risk";
        statusLabel = variance > 0 ? "Under-billed" : "Over-billed";
      }
      return {
        id: pid,
        client: p.client,
        project: p.name,
        loggedHours,
        invoicedHours,
        loggedAmount,
        invoicedAmount,
        variance,
        variancePct,
        status,
        statusLabel,
        statusRank: RANK[status],
        entries: [...entries].sort((a, b) => a.week_start.localeCompare(b.week_start)),
      };
    });
  }

  function rowHtml(r) {
    return `<tr class="expandable" data-id="${r.id}" tabindex="0" aria-expanded="false">
        <td><span class="chev" aria-hidden="true"></span><span class="cell-strong">${r.client}</span></td>
        <td>${r.project}</td>
        <td class="r num">${IQ.fmtHours(r.loggedHours)}</td>
        <td class="r num">${IQ.fmtHours(r.invoicedHours)}</td>
        <td class="r num">${IQ.fmtMoney(r.invoicedAmount)}</td>
        <td class="r num cell-strong" style="color:${Math.abs(r.variancePct) > 8 ? "var(--bad)" : "inherit"}">${IQ.fmtMoney(r.variance)}</td>
        <td class="r num">${r.variancePct.toFixed(1)}%</td>
        <td class="r"><span class="status status--${r.status}">${r.statusLabel}</span></td>
      </tr>
      <tr class="detail" id="d-${r.id}">
        <td colspan="8">
          <table class="tbl tbl--nested">
            <thead><tr><th>Week of</th><th class="r">Logged billable</th><th class="r">Invoiced hrs</th><th class="r">Delta hrs</th><th class="r">Invoiced</th></tr></thead>
            <tbody>
              ${r.entries
                .map((e) => {
                  const d = e.invoiced_hours - e.logged_billable_hours;
                  return `<tr><td class="num">${IQ.weekLabel(e.week_start)}</td><td class="r num">${IQ.fmtHours(e.logged_billable_hours)}</td><td class="r num">${IQ.fmtHours(e.invoiced_hours)}</td><td class="r num" style="color:${Math.abs(d) > 0.05 ? "var(--warn)" : "var(--ink-tertiary)"}">${d >= 0 ? "+" : ""}${d.toFixed(1)}</td><td class="r num">${IQ.fmtMoney(e.invoiced_amount)}</td></tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </td>
      </tr>`;
  }

  function renderRows(rows) {
    latest = rows;
    const tb = document.getElementById("tbody");
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty__title">No billing activity</div><div>Nothing was invoiced in this scope.</div></div></td></tr>`;
      document.getElementById("tfoot").innerHTML = "";
      return;
    }
    tb.innerHTML = rows.map(rowHtml).join("");

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

    const t = rows.reduce(
      (a, r) => ({
        lh: a.lh + r.loggedHours,
        ih: a.ih + r.invoicedHours,
        ia: a.ia + r.invoicedAmount,
        v: a.v + r.variance,
      }),
      { lh: 0, ih: 0, ia: 0, v: 0 }
    );
    document.getElementById("tfoot").innerHTML = `<tr class="total-row">
        <td colspan="2">Total · ${rows.length} project${rows.length === 1 ? "" : "s"}</td>
        <td class="r num">${IQ.fmtHours(t.lh)}</td>
        <td class="r num">${IQ.fmtHours(t.ih)}</td>
        <td class="r num">${IQ.fmtMoney(t.ia)}</td>
        <td class="r num">${IQ.fmtMoney(t.v)}</td>
        <td class="r num">${t.ia ? ((t.v / (t.ia + t.v)) * 100).toFixed(1) : "0.0"}%</td>
        <td></td>
      </tr>`;
  }

  function render() {
    const seed = seedRef;
    const sc = IQ.getScope(seed);
    IQ_TABLE.attachSort(document.querySelector("#tbl thead"), { current: build(seed, sc) }, renderRows, "variance", "desc");
  }

  IQ_SHELL.init("reconciliation").then((seed) => {
    seedRef = seed;
    render();

    document.getElementById("export").addEventListener("click", () => {
      IQ_TABLE.downloadCsv(
        "billing-reconciliation.csv",
        IQ_TABLE.toCsv(latest, [
          { key: "client", label: "Client" },
          { key: "project", label: "Project" },
          { key: "loggedHours", label: "Hours logged", value: (r) => r.loggedHours.toFixed(1) },
          { key: "invoicedHours", label: "Hours billed", value: (r) => r.invoicedHours.toFixed(1) },
          { key: "invoicedAmount", label: "Amount invoiced (USD)", value: (r) => r.invoicedAmount.toFixed(2) },
          { key: "variance", label: "Variance (USD)", value: (r) => r.variance.toFixed(2) },
          { key: "variancePct", label: "Variance %", value: (r) => r.variancePct.toFixed(1) },
          { key: "statusLabel", label: "Status" },
        ])
      );
    });

    document.addEventListener("iq:filterschange", render);
  });
})();
