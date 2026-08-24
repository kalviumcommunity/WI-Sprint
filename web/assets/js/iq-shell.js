/* Shared chrome: left nav, sticky topbar (period + department + theme),
   command palette, mobile nav. Rendered into every page so the six screens
   stay in lockstep. */

(function () {
  const NAV = [
    { key: "overview", label: "Dashboard", href: "index.html" },
    { key: "utilization", label: "Utilization", href: "utilization.html" },
    { key: "allocation", label: "Allocation", href: "allocation.html" },
    { key: "insights", label: "Insights", href: "insights.html" },
    { key: "reconciliation", label: "Reconciliation", href: "reconciliation.html" },
    { key: "reports", label: "Reports", href: "reports.html" },
  ];

  const ICON = {
    overview:
      '<svg class="nav__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.3"/><rect x="8.75" y="1.75" width="5.5" height="8.5" rx="1.2" stroke="currentColor" stroke-width="1.3"/><rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.3"/><rect x="8.75" y="11.75" width="5.5" height="2.5" rx="1.2" stroke="currentColor" stroke-width="1.3"/></svg>',
    utilization:
      '<svg class="nav__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.25 13.25V9M6.25 13.25V4.5M10.25 13.25V7M14.25 13.25V2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    allocation:
      '<svg class="nav__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="5.5" cy="4.75" r="2.25" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="4.75" r="2.25" stroke="currentColor" stroke-width="1.3"/><path d="M1.9 13.4c.35-2.3 1.9-3.5 3.6-3.5s3.25 1.2 3.6 3.5M7.9 13.4c.35-2.3 1.9-3.5 3.6-3.5s3.25 1.2 3.6 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    insights:
      '<svg class="nav__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.9v2.3M8 11.8v2.3M14.1 8h-2.3M4.2 8H1.9M12.3 3.7l-1.6 1.6M5.3 10.7l-1.6 1.6M12.3 12.3l-1.6-1.6M5.3 5.3 3.7 3.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="8" r="2.1" stroke="currentColor" stroke-width="1.3"/></svg>',
    reconciliation:
      '<svg class="nav__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4.25h7M2 8h7M2 11.75h4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11.5 2.5v11M11.5 2.5 14 5M11.5 13.5 14 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reports:
      '<svg class="nav__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.25 1.9h5.4L12.75 6v8.1a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1V2.9a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8.4 2v3.3a.7.7 0 0 0 .7.7h3.4M5 9.6h6M5 11.9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  };

  const SUN =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.1" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3 3.2 3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const MOON =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.9 5.9 0 1 0 7.1 7.1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const AUTO =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.1" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.9v12.2A6.1 6.1 0 0 0 8 1.9Z" fill="currentColor"/></svg>';

  const THEME_KEY = "iq.theme.v1";
  const THEME_CYCLE = ["system", "light", "dark"];
  const THEME_ICON = { system: AUTO, light: SUN, dark: MOON };
  const THEME_LABEL = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

  function readTheme() {
    const t = localStorage.getItem(THEME_KEY);
    return THEME_CYCLE.includes(t) ? t : "system";
  }

  function applyTheme(theme) {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    document.dispatchEvent(new CustomEvent("iq:themechange", { detail: theme }));
  }

  function renderNav(activeKey) {
    const el = document.getElementById("nav");
    el.className = "nav";
    el.innerHTML = `
      <div class="nav__brand">
        <span class="nav__mark" aria-hidden="true">U</span>
        <span class="nav__wordmark">UtilizationIQ</span>
      </div>
      <nav class="nav__list" aria-label="Primary">
        <div class="nav__label">Operations</div>
        ${NAV.slice(0, 4)
          .map(
            (i) =>
              `<a class="nav__link${i.key === activeKey ? " is-active" : ""}" href="${i.href}"${i.key === activeKey ? ' aria-current="page"' : ""}>${ICON[i.key]}${i.label}</a>`
          )
          .join("")}
        <div class="nav__label">Finance</div>
        ${NAV.slice(4)
          .map(
            (i) =>
              `<a class="nav__link${i.key === activeKey ? " is-active" : ""}" href="${i.href}"${i.key === activeKey ? ' aria-current="page"' : ""}>${ICON[i.key]}${i.label}</a>`
          )
          .join("")}
      </nav>
      <div class="nav__foot">
        Meridian &amp; Co.<br />Consulting Operations
      </div>`;
  }

  function renderTopbar(seed) {
    const el = document.getElementById("topbar");
    const st = IQ.getState();
    const theme = readTheme();
    const periods = [
      { key: "week", label: "Week" },
      { key: "month", label: "Month" },
      { key: "quarter", label: "Quarter" },
      { key: "custom", label: "Custom" },
    ];
    const dirty = st.department || st.period !== "quarter";

    el.className = "topbar";
    el.innerHTML = `
      <div class="topbar__group">
        <button class="icon-btn nav-toggle" id="nav-toggle" aria-label="Open navigation">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <div class="seg" id="seg-period" role="group" aria-label="Date range">
          ${periods.map((p) => `<button type="button" data-period="${p.key}" class="${p.key === st.period ? "is-active" : ""}" ${p.key === st.period ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${p.label}</button>`).join("")}
        </div>
        <span id="custom-range" style="display:${st.period === "custom" ? "inline-flex" : "none"}; gap:6px; align-items:center;">
          <select class="select" id="cr-from" aria-label="Range start"></select>
          <span style="color:var(--ink-tertiary); font-size:12px;">to</span>
          <select class="select" id="cr-to" aria-label="Range end"></select>
        </span>
        <select class="select" id="dept" aria-label="Department filter">
          <option value="">All departments</option>
          ${seed.departments.map((d) => `<option value="${d}" ${d === st.department ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <button class="clear-btn ${dirty ? "is-visible" : ""}" id="clear" type="button">Reset</button>
      </div>
      <div class="topbar__group">
        <span class="stamp">As of ${new Date(seed.generated_at + "T00:00:00").toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
        <button class="icon-btn" id="cmdk-open" aria-label="Open command palette" title="Search (Ctrl K)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7.2" cy="7.2" r="4.6" stroke="currentColor" stroke-width="1.5"/><path d="m11 11 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="icon-btn" id="theme-btn" aria-label="${THEME_LABEL[theme]}" title="${THEME_LABEL[theme]}">${THEME_ICON[theme]}</button>
      </div>`;

    const from = document.getElementById("cr-from");
    const to = document.getElementById("cr-to");
    seed.weeks.forEach((w) => {
      const label = IQ.weekLabel(w);
      from.insertAdjacentHTML("beforeend", `<option value="${w}" ${w === st.customFrom ? "selected" : ""}>${label}</option>`);
      to.insertAdjacentHTML("beforeend", `<option value="${w}" ${w === st.customTo ? "selected" : ""}>${label}</option>`);
    });
    if (!st.customFrom) from.value = seed.weeks[seed.weeks.length - 4];
    if (!st.customTo) to.value = seed.weeks[seed.weeks.length - 1];

    document.getElementById("seg-period").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-period]");
      if (!b) return;
      IQ.setState({ period: b.dataset.period });
      renderTopbar(seed);
    });
    from.addEventListener("change", () => IQ.setState({ customFrom: from.value }));
    to.addEventListener("change", () => IQ.setState({ customTo: to.value }));
    document.getElementById("dept").addEventListener("change", (e) => {
      IQ.setState({ department: e.target.value });
      renderTopbar(seed);
    });
    document.getElementById("clear").addEventListener("click", () => {
      IQ.setState(IQ.defaultState());
      renderTopbar(seed);
    });
    document.getElementById("theme-btn").addEventListener("click", () => {
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(readTheme()) + 1) % THEME_CYCLE.length];
      applyTheme(next);
      renderTopbar(seed);
    });
    document.getElementById("cmdk-open").addEventListener("click", openPalette);
    document.getElementById("nav-toggle").addEventListener("click", () => {
      document.getElementById("nav").classList.toggle("is-open");
    });
  }

  /* ------------------------------------------------------ command palette */

  function paletteCommands(seed) {
    const nav = NAV.map((i) => ({ label: `Go to ${i.label}`, run: () => (window.location.href = i.href) }));
    const depts = seed.departments.map((d) => ({
      label: `Filter: ${d}`,
      run: () => {
        IQ.setState({ department: d });
        renderTopbar(seed);
      },
    }));
    return [
      ...nav,
      ...depts,
      { label: "Filter: all departments", run: () => { IQ.setState({ department: "" }); renderTopbar(seed); } },
      { label: "Period: this week", run: () => { IQ.setState({ period: "week" }); renderTopbar(seed); } },
      { label: "Period: this month", run: () => { IQ.setState({ period: "month" }); renderTopbar(seed); } },
      { label: "Period: this quarter", run: () => { IQ.setState({ period: "quarter" }); renderTopbar(seed); } },
      { label: "Toggle light / dark theme", run: () => { applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); renderTopbar(seedRef); } },
    ];
  }

  let seedRef = null;
  let cmds = [];
  let filtered = [];
  let cursor = 0;

  function mountPalette() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="cmdk-backdrop" id="cmdk-backdrop"></div>
       <div class="cmdk" id="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
         <input id="cmdk-input" type="text" placeholder="Jump to a screen, filter, or setting…" autocomplete="off" />
         <div class="cmdk__list" id="cmdk-list"></div>
         <div class="cmdk__hint"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> select</span><span><kbd>esc</kbd> close</span></div>
       </div>`
    );
    document.getElementById("cmdk-backdrop").addEventListener("click", closePalette);
    const input = document.getElementById("cmdk-input");
    input.addEventListener("input", () => {
      renderPaletteList(input.value);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); cursor = Math.min(cursor + 1, filtered.length - 1); paintCursor(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cursor = Math.max(cursor - 1, 0); paintCursor(); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[cursor]) { closePalette(); filtered[cursor].run(); } }
      else if (e.key === "Escape") { closePalette(); }
    });
  }

  function renderPaletteList(q) {
    const needle = (q || "").toLowerCase();
    filtered = cmds.filter((c) => c.label.toLowerCase().includes(needle));
    cursor = 0;
    document.getElementById("cmdk-list").innerHTML = filtered.length
      ? filtered.map((c, i) => `<div class="cmdk__item${i === 0 ? " is-active" : ""}" data-i="${i}">${c.label}</div>`).join("")
      : `<div class="cmdk__item" style="cursor:default;">No matches</div>`;
    document.querySelectorAll(".cmdk__item[data-i]").forEach((el) => {
      el.addEventListener("click", () => { closePalette(); filtered[Number(el.dataset.i)].run(); });
    });
  }

  function paintCursor() {
    document.querySelectorAll(".cmdk__item[data-i]").forEach((el, i) => {
      el.classList.toggle("is-active", i === cursor);
      if (i === cursor) el.scrollIntoView({ block: "nearest" });
    });
  }

  function openPalette() {
    cmds = paletteCommands(seedRef);
    document.getElementById("cmdk-backdrop").classList.add("is-open");
    document.getElementById("cmdk").classList.add("is-open");
    const input = document.getElementById("cmdk-input");
    input.value = "";
    renderPaletteList("");
    input.focus();
  }

  function closePalette() {
    document.getElementById("cmdk-backdrop").classList.remove("is-open");
    document.getElementById("cmdk").classList.remove("is-open");
  }

  window.IQ_SHELL = {
    init(activeKey) {
      renderNav(activeKey);
      return IQ.loadSeed().then((seed) => {
        seedRef = seed;
        renderTopbar(seed);
        mountPalette();
        document.addEventListener("keydown", (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openPalette();
          }
        });
        return seed;
      });
    },
  };
})();
