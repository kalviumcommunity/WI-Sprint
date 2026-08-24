(function () {
  const statusRank = { critical: 0, risk: 1, good: 2 };

  function buildRows(seed, scope) {
    const rows = IQ.billingInScope(seed, scope.weeks, scope.department);
    const projectMap = IQ.byId(seed.projects);
    const byProject = new Map();
    for (const r of rows) {
      if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
      byProject.get(r.project_id).push(r);
    }

    return [...byProject.entries()].map(([pid, entries]) => {
      const proj = projectMap.get(pid);
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
        project_id: pid,
        client: proj.client,
        project: proj.name,
        loggedHours,
        invoicedHours,
        loggedAmount,
        invoicedAmount,
        variance,
        variancePct,
        status,
        statusLabel,
        statusRank: statusRank[status],
        entries: entries.sort((a, b) => a.week_start.localeCompare(b.week_start)),
      };
    });
  }

  function rowHtml(r) {
    return `
      <tr class="row-expandable" data-id="${r.project_id}">
        <td>${r.client}</td>
        <td>${r.project}</td>
        <td class="is-num tabular">${IQ.fmtHours(r.loggedHours)}</td>
        <td class="is-num tabular">${IQ.fmtHours(r.invoicedHours)}</td>
        <td class="is-num tabular">${IQ.fmtMoney(r.invoicedAmount)}</td>
        <td class="is-num tabular">${IQ.fmtMoney(r.variance)}</td>
        <td class="is-num tabular">${r.variancePct.toFixed(1)}%</td>
        <td class="is-num"><span class="status status--${r.status}">${r.statusLabel}</span></td>
      </tr>
      <tr class="row-detail" id="detail-${r.project_id}">
        <td colspan="8">
          <table class="data-table" style="margin:0;">
            <thead><tr><th data-type="text">Week</th><th class="is-num">Logged billable hrs</th><th class="is-num">Invoiced hrs</th><th class="is-num">Invoiced amount</th></tr></thead>
            <tbody>
              ${r.entries
                .map(
                  (e) =>
                    `<tr><td>${IQ.weekLabel(e.week_start)}</td><td class="is-num tabular">${IQ.fmtHours(e.logged_billable_hours)}</td><td class="is-num tabular">${IQ.fmtHours(e.invoiced_hours)}</td><td class="is-num tabular">${IQ.fmtMoney(e.invoiced_amount)}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </td>
      </tr>`;
  }

  let latestRows = [];

  function renderRows(rows) {
    latestRows = rows;
    const tbody = document.getElementById("recon-tbody");
    tbody.innerHTML = rows.length
      ? rows.map(rowHtml).join("")
      : `<tr><td colspan="8"><div class="empty-state">No billing activity in the current filter scope.</div></td></tr>`;

    tbody.querySelectorAll(".row-expandable").forEach((tr) => {
      tr.addEventListener("click", () => document.getElementById(`detail-${tr.dataset.id}`).classList.toggle("is-open"));
    });

    const totals = rows.reduce(
      (acc, r) => ({
        loggedHours: acc.loggedHours + r.loggedHours,
        invoicedHours: acc.invoicedHours + r.invoicedHours,
        invoicedAmount: acc.invoicedAmount + r.invoicedAmount,
        variance: acc.variance + r.variance,
      }),
      { loggedHours: 0, invoicedHours: 0, invoicedAmount: 0, variance: 0 }
    );
    document.getElementById("recon-tfoot").innerHTML = rows.length
      ? `<tr class="totals-row">
          <td colspan="2">Total</td>
          <td class="is-num tabular">${IQ.fmtHours(totals.loggedHours)}</td>
          <td class="is-num tabular">${IQ.fmtHours(totals.invoicedHours)}</td>
          <td class="is-num tabular">${IQ.fmtMoney(totals.invoicedAmount)}</td>
          <td class="is-num tabular">${IQ.fmtMoney(totals.variance)}</td>
          <td colspan="2"></td>
        </tr>`
      : "";
  }

  function render(seed) {
    const scope = IQ.getScope(seed);
    const rows = buildRows(seed, scope);
    const rowsRef = { current: rows };
    IQ_TABLE.attachSort(document.querySelector("#recon-table thead"), rowsRef, renderRows, "variance", "desc");

    document.getElementById("export-btn").onclick = () => {
      const csv = IQ_TABLE.toCsv(latestRows, [
        { key: "client", label: "Client" },
        { key: "project", label: "Project" },
        { key: "loggedHours", label: "Hours logged" },
        { key: "invoicedHours", label: "Hours billed" },
        { key: "invoicedAmount", label: "Amount invoiced" },
        { key: "variance", label: "Variance ($)" },
        { key: "variancePct", label: "Variance (%)" },
        { key: "statusLabel", label: "Status" },
      ]);
      IQ_TABLE.downloadCsv("billing-reconciliation.csv", csv);
    };
  }

  IQ_SHELL.init("reconciliation").then((seed) => {
    render(seed);
    document.addEventListener("iq:filterschange", () => render(seed));
  });
})();
