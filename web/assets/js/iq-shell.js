/* Renders the shared left nav + top bar (date range, department filter)
   into every page, and keeps filter state in sync via localStorage. */

(function () {
  const NAV_ITEMS = [
    { key: "overview", label: "Dashboard", href: "index.html" },
    { key: "utilization", label: "Utilization", href: "utilization.html" },
    { key: "allocation", label: "Allocation", href: "allocation.html" },
    { key: "insights", label: "Insights", href: "insights.html" },
    { key: "reconciliation", label: "Reconciliation", href: "reconciliation.html" },
    { key: "reports", label: "Reports", href: "reports.html" },
  ];

  const ICONS = {
    overview:
      '<svg class="sidenav__icon" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="8.5" y="1.5" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="1.5" y="9.5" width="6" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/></svg>',
    utilization:
      '<svg class="sidenav__icon" viewBox="0 0 16 16" fill="none"><path d="M2 13V8.5M6.3 13V3M10.6 13v6.5M10.6 13V6M14 13V4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" transform="translate(0,-2)"/></svg>',
    allocation:
      '<svg class="sidenav__icon" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="5" r="2.3" stroke="currentColor" stroke-width="1.3"/><circle cx="11" cy="5" r="2.3" stroke="currentColor" stroke-width="1.3"/><path d="M1.6 14c.5-2.4 2.2-3.8 3.4-3.8s2.9 1.4 3.4 3.8M7.6 14c.5-2.4 2.2-3.8 3.4-3.8s2.9 1.4 3.4 3.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    insights:
      '<svg class="sidenav__icon" viewBox="0 0 16 16" fill="none"><path d="M8 1.5 9.7 5l3.8.5-2.8 2.6.7 3.8L8 10l-3.4 1.9.7-3.8L2.5 5.5 6.3 5 8 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    reconciliation:
      '<svg class="sidenav__icon" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2" width="9" height="12" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 5.5h4M4 8h4M4 10.5h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M10.5 5 14 5v8a1 1 0 0 1-1 1h-2.5" stroke="currentColor" stroke-width="1.2"/></svg>',
    reports:
      '<svg class="sidenav__icon" viewBox="0 0 16 16" fill="none"><path d="M3 1.8h6.2L13 5.6V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.8V5a.8.8 0 0 0 .8.8H13M5 9h6M5 11h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  };

  function renderNav(activeKey) {
    const el = document.getElementById("sidenav");
    if (!el) return;
    el.className = "sidenav";
    el.innerHTML = `
      <div class="sidenav__brand">
        <span class="sidenav__mark"></span>
        UtilizationIQ
      </div>
      <nav class="sidenav__nav">
        ${NAV_ITEMS.map(
          (item) => `
          <a class="sidenav__link${item.key === activeKey ? " is-active" : ""}" href="${item.href}">
            ${ICONS[item.key]}
            ${item.label}
          </a>`
        ).join("")}
      </nav>
      <div class="sidenav__footer">Meridian &amp; Co. &middot; Consulting Ops</div>
    `;
  }

  function renderTopbar(seed) {
    const el = document.getElementById("topbar");
    if (!el) return;
    const state = IQ.getState();
    const periods = [
      { key: "week", label: "This week" },
      { key: "month", label: "This month" },
      { key: "quarter", label: "This quarter" },
      { key: "custom", label: "Custom" },
    ];

    el.className = "topbar";
    el.innerHTML = `
      <div class="topbar__filters">
        <div class="segmented" id="period-segmented">
          ${periods
            .map(
              (p) =>
                `<button type="button" data-period="${p.key}" class="${p.key === state.period ? "is-active" : ""}">${p.label}</button>`
            )
            .join("")}
        </div>
        <div id="custom-range" style="display:${state.period === "custom" ? "inline-flex" : "none"}; gap:6px; align-items:center;">
          <select class="select" id="custom-from"></select>
          <span style="color:var(--color-text-tertiary); font-size:12px;">to</span>
          <select class="select" id="custom-to"></select>
        </div>
        <select class="select" id="department-select">
          <option value="">All departments</option>
          ${seed.departments.map((d) => `<option value="${d}" ${d === state.department ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <button class="clear-filters ${state.department || state.period !== "quarter" ? "is-visible" : ""}" id="clear-filters" type="button">Clear filters</button>
      </div>
      <div style="font-size:12px; color:var(--color-text-tertiary);">Data as of ${new Date(seed.generated_at + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
    `;

    const fromSel = document.getElementById("custom-from");
    const toSel = document.getElementById("custom-to");
    seed.weeks.forEach((w) => {
      const label = `Week of ${IQ.weekLabel(w)}`;
      fromSel.innerHTML += `<option value="${w}" ${w === state.customFrom ? "selected" : ""}>${label}</option>`;
      toSel.innerHTML += `<option value="${w}" ${w === state.customTo ? "selected" : ""}>${label}</option>`;
    });
    if (!state.customFrom) fromSel.value = seed.weeks[seed.weeks.length - 4];
    if (!state.customTo) toSel.value = seed.weeks[seed.weeks.length - 1];

    document.getElementById("period-segmented").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-period]");
      if (!btn) return;
      const period = btn.dataset.period;
      document.getElementById("custom-range").style.display = period === "custom" ? "inline-flex" : "none";
      IQ.setState({ period });
      renderTopbar(seed);
    });

    fromSel.addEventListener("change", () => IQ.setState({ customFrom: fromSel.value }));
    toSel.addEventListener("change", () => IQ.setState({ customTo: toSel.value }));

    document.getElementById("department-select").addEventListener("change", (e) => {
      IQ.setState({ department: e.target.value });
    });

    document.getElementById("clear-filters").addEventListener("click", () => {
      IQ.setState(IQ.defaultState());
      renderTopbar(seed);
    });
  }

  window.IQ_SHELL = {
    init(activeKey) {
      renderNav(activeKey);
      return IQ.loadSeed().then((seed) => {
        renderTopbar(seed);
        return seed;
      });
    },
    refreshTopbar(seed) {
      renderTopbar(seed);
    },
  };
})();
