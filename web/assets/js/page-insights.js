(function () {
  const KEY = "iq.findingStatus.v1";
  const ORDER = { new: 0, acknowledged: 1, resolved: 2 };
  const LABEL = { new: "New", acknowledged: "Acknowledged", resolved: "Resolved" };
  const TONE = { new: "critical", acknowledged: "risk", resolved: "good" };

  let seedRef;
  let base = [];
  let rowsRef = { current: [] };
  let sorter = null;
  let filterMode = "open";
  let latest = [];

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  const readStatuses = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (e) {
      return {};
    }
  };

  function writeStatus(id, status) {
    const m = readStatuses();
    m[id] = status;
    localStorage.setItem(KEY, JSON.stringify(m));
  }

  const slug = (s) => "f" + hash(s).toString(36);

  function enrich(findings, today) {
    const statuses = readStatuses();
    return findings.map((f) => {
      const id = `${f.type}::${f.title}`;
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() - (hash(id) % 13));
      const status = statuses[id] || "new";
      return { ...f, id, key: slug(id), detectedDate: d.toISOString().slice(0, 10), status, statusOrder: ORDER[status] };
    });
  }

  function renderSummary(all) {
    const open = all.filter((f) => f.status !== "resolved");
    const critical = open.filter((f) => f.severity === "critical");
    const exposure = open.reduce((s, f) => s + f.costImpact, 0);
    document.getElementById("summary").innerHTML = `
      <article class="card">
        <div class="kpi__label">Open findings</div>
        <div class="kpi__value" style="margin-top:8px;">${open.length}</div>
      </article>
      <article class="card">
        <div class="kpi__label">Critical</div>
        <div class="kpi__value" style="margin-top:8px; color:${critical.length ? "var(--bad)" : "inherit"}">${critical.length}</div>
      </article>
      <article class="card">
        <div class="kpi__label">Total exposure</div>
        <div class="kpi__value num" style="margin-top:8px; font-size:26px;">${IQ.fmtMoney(exposure)}</div>
      </article>`;
  }

  function rowHtml(f) {
    return `<tr class="expandable" data-key="${f.key}" tabindex="0" aria-expanded="false">
        <td><span class="chev" aria-hidden="true"></span>${f.type}</td>
        <td>
          <div class="cell-strong">${f.title}</div>
          <div class="cell-sub">${f.meta}</div>
        </td>
        <td class="r num cell-strong">${IQ.fmtMoney(f.costImpact)}</td>
        <td class="r num">${new Date(f.detectedDate + "T00:00:00").toLocaleDateString("en-US", { day: "2-digit", month: "short" })}</td>
        <td class="r"><span class="status status--${TONE[f.status]}">${LABEL[f.status]}</span></td>
      </tr>
      <tr class="detail" id="d-${f.key}">
        <td colspan="5">
          <div style="font-size:13px; margin-bottom:14px; max-width:80ch;">${f.detail}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <button class="btn btn--ghost" data-act="new" data-id="${f.key}">Reopen</button>
            <button class="btn btn--ghost" data-act="acknowledged" data-id="${f.key}">Acknowledge</button>
            <button class="btn btn--primary" data-act="resolved" data-id="${f.key}">Resolve</button>
            <a class="btn btn--text" href="${f.link}">Open ${f.link.replace(".html", "")} →</a>
          </div>
        </td>
      </tr>`;
  }

  function renderRows(rows) {
    const visible = filterMode === "open" ? rows.filter((f) => f.status !== "resolved") : rows;
    latest = visible;
    const tb = document.getElementById("tbody");

    if (!visible.length) {
      tb.innerHTML = `<tr><td colspan="5">
        <div class="empty">
          <svg class="empty__icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="empty__title">${filterMode === "open" ? "No open findings" : "No findings in scope"}</div>
          <div>${filterMode === "open" ? "Everything detected has been resolved." : "Nothing crosses a threshold for these filters."}</div>
        </div></td></tr>`;
      return;
    }

    tb.innerHTML = visible.map(rowHtml).join("");

    tb.querySelectorAll("tr.expandable").forEach((tr) => {
      const toggle = (e) => {
        if (e && e.target.closest("button, a")) return;
        const open = document.getElementById(`d-${tr.dataset.key}`).classList.toggle("is-open");
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

    tb.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = rowsRef.current.find((x) => x.key === btn.dataset.id);
        if (!f) return;
        writeStatus(f.id, btn.dataset.act);
        rowsRef.current = enrich(base, seedRef.generated_at);
        renderSummary(rowsRef.current);
        sorter.refresh();
      });
    });
  }

  function render() {
    const seed = seedRef;
    const sc = IQ.getScope(seed);
    base = IQ_FINDINGS.computeAll(seed, sc.weeks, sc.department, seed.target_utilization_pct);
    rowsRef = { current: enrich(base, seed.generated_at) };
    renderSummary(rowsRef.current);
    sorter = IQ_TABLE.attachSort(document.querySelector("#tbl thead"), rowsRef, renderRows, "costImpact", "desc");
  }

  IQ_SHELL.init("insights").then((seed) => {
    seedRef = seed;
    render();

    document.getElementById("filter-toggle").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-filter]");
      if (!b) return;
      filterMode = b.dataset.filter;
      document.querySelectorAll("#filter-toggle button").forEach((x) => x.classList.toggle("is-active", x === b));
      sorter.refresh();
    });

    document.getElementById("export").addEventListener("click", () => {
      IQ_TABLE.downloadCsv(
        "inefficiency-findings.csv",
        IQ_TABLE.toCsv(latest, [
          { key: "type", label: "Type" },
          { key: "title", label: "Finding" },
          { key: "meta", label: "Context" },
          { key: "costImpact", label: "Cost impact (USD)", value: (r) => r.costImpact.toFixed(2) },
          { key: "detectedDate", label: "Detected" },
          { key: "status", label: "Status", value: (r) => LABEL[r.status] },
          { key: "detail", label: "Evidence" },
        ])
      );
    });

    document.addEventListener("iq:filterschange", render);
  });
})();
