(function () {
  const STATUS_KEY = "iq.findingStatus.v1";
  const STATUS_ORDER = { new: 0, acknowledged: 1, resolved: 2 };
  const STATUS_LABEL = { new: "New", acknowledged: "Acknowledged", resolved: "Resolved" };

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function getStatusMap() {
    try {
      return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function setStatus(id, status) {
    const map = getStatusMap();
    map[id] = status;
    localStorage.setItem(STATUS_KEY, JSON.stringify(map));
  }

  function enrich(findings, today) {
    const statusMap = getStatusMap();
    return findings.map((f) => {
      const id = `${f.type}::${f.title}`;
      const h = hash(id);
      const offsetDays = h % 13;
      const d = new Date(today);
      d.setDate(d.getDate() - offsetDays);
      const status = statusMap[id] || "new";
      return { ...f, id, detectedDate: d.toISOString().slice(0, 10), status, statusOrder: STATUS_ORDER[status] };
    });
  }

  function rowHtml(f) {
    return `
      <tr class="row-expandable" data-id="${btoa(unescape(encodeURIComponent(f.id)))}">
        <td>${f.type}</td>
        <td>
          <div style="font-weight:600;">${f.title}</div>
          <div style="color:var(--color-text-secondary); font-size:12px;">${f.meta}</div>
        </td>
        <td class="is-num tabular">${IQ.fmtMoney(f.costImpact)}</td>
        <td>${f.detectedDate}</td>
        <td class="is-num"><span class="status status--${f.status === "resolved" ? "good" : f.status === "acknowledged" ? "risk" : "critical"}">${STATUS_LABEL[f.status]}</span></td>
      </tr>
      <tr class="row-detail" id="detail-${btoa(unescape(encodeURIComponent(f.id)))}">
        <td colspan="5">
          <div style="margin-bottom:10px;">${f.detail}</div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn--secondary" data-action="new">Mark new</button>
            <button class="btn btn--secondary" data-action="acknowledged">Acknowledge</button>
            <button class="btn btn--secondary" data-action="resolved">Mark resolved</button>
            <a class="btn btn--tertiary" href="${f.link}">Open in ${f.link.replace(".html", "")} &rarr;</a>
          </div>
        </td>
      </tr>`;
  }

  let currentFindings = [];

  function renderRows(rows) {
    currentFindings = rows;
    const tbody = document.getElementById("insights-tbody");
    if (!rows.length) {
      tbody.innerHTML = `
        <tr><td colspan="5">
          <div class="empty-state">
            <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div class="empty-state__title">No issues detected this week</div>
            <div>Nothing in the current filter scope crosses a threshold.</div>
          </div>
        </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(rowHtml).join("");

    tbody.querySelectorAll(".row-expandable").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        document.getElementById(`detail-${tr.dataset.id}`).classList.toggle("is-open");
      });
    });
    tbody.querySelectorAll(".row-detail button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr").previousElementSibling;
        const encodedId = tr.dataset.id;
        const id = decodeURIComponent(escape(atob(encodedId)));
        setStatus(id, btn.dataset.action);
        rowsRefGlobal.current = enrich(baseFindings, todayGlobal);
        sortController.refresh();
      });
    });
  }

  let rowsRefGlobal, sortController, baseFindings, todayGlobal;

  function render(seed) {
    const scope = IQ.getScope(seed);
    baseFindings = IQ_FINDINGS.computeAll(seed, scope.weeks, scope.department, seed.target_utilization_pct);
    todayGlobal = seed.generated_at;
    const rows = enrich(baseFindings, todayGlobal);
    rowsRefGlobal = { current: rows };
    sortController = IQ_TABLE.attachSort(document.querySelector("#insights-table thead"), rowsRefGlobal, renderRows, "costImpact", "desc");
  }

  IQ_SHELL.init("insights").then((seed) => {
    render(seed);
    document.addEventListener("iq:filterschange", () => render(seed));
  });
})();
