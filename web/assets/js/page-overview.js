(function () {
  function deltaHtml(current, previous, higherIsBetter, formatFn, isPercentagePoint) {
    if (previous === null || previous === undefined || !isFinite(previous)) {
      return `<span class="kpi-card__delta delta-flat">No prior-period data</span>`;
    }
    const diff = current - previous;
    if (Math.abs(diff) < 0.05) return `<span class="kpi-card__delta delta-flat">Flat vs prior period</span>`;
    const good = higherIsBetter ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? "&uarr;" : "&darr;";
    const cls = good ? "delta-up" : "delta-down";
    const magnitude = isPercentagePoint ? `${Math.abs(diff).toFixed(1)}pp` : formatFn(Math.abs(diff));
    return `<span class="kpi-card__delta ${cls}">${arrow} ${magnitude} vs prior period</span>`;
  }

  function kpiCard(label, help, value, deltaHtmlStr) {
    return `
      <div class="kpi-card">
        <div class="kpi-card__label">${label} <span class="kpi-card__help" title="${help}">?</span></div>
        <div class="kpi-card__value tabular">${value}</div>
        ${deltaHtmlStr}
      </div>`;
  }

  function render(seed) {
    const scope = IQ.getScope(seed);
    const target = seed.target_utilization_pct;

    const rows = IQ.rollupConsultants(seed, scope.weeks, scope.department);
    const totals = IQ.rollupTotals(rows);
    const prevRows = IQ.rollupConsultants(seed, scope.prevWeeks, scope.department);
    const prevTotals = scope.prevWeeks.length ? IQ.rollupTotals(prevRows) : null;

    const bench = IQ.benchCost(seed, scope.weeks, scope.department);
    const prevBench = scope.prevWeeks.length ? IQ.benchCost(seed, scope.prevWeeks, scope.department) : null;

    const variance = IQ.unbilledVariance(seed, scope.weeks, scope.department);
    const prevVariance = scope.prevWeeks.length ? IQ.unbilledVariance(seed, scope.prevWeeks, scope.department) : null;

    document.getElementById("kpi-grid").innerHTML =
      kpiCard(
        "Overall utilization vs target",
        "Billable hours ÷ available hours for the selected period.",
        IQ.fmtPct(totals.utilization_pct),
        deltaHtml(totals.utilization_pct, prevTotals ? prevTotals.utilization_pct : null, true, null, true)
      ) +
      kpiCard(
        "Billable hours this period",
        "Total billable hours logged across the selected scope.",
        IQ.fmtHours(totals.billable),
        deltaHtml(totals.billable, prevTotals ? prevTotals.billable : null, true, (v) => `${v.toFixed(1)}h`)
      ) +
      kpiCard(
        "Bench cost this period",
        "Unbilled available time (available − billable − non-billable) × hourly rate.",
        IQ.fmtMoney(bench),
        deltaHtml(bench, prevBench, false, IQ.fmtMoney)
      ) +
      kpiCard(
        "Unbilled variance",
        "Billable hours × hourly rate minus client-invoiced amount for the same projects.",
        IQ.fmtMoney(variance),
        deltaHtml(variance, prevVariance, false, IQ.fmtMoney)
      );

    // Trend: fixed trailing 12 weeks (independent of the period filter), department-scoped.
    const trendWeeks = seed.weeks.slice(-12);
    const trendValues = trendWeeks.map((w) => {
      const r = IQ.rollupConsultants(seed, [w], scope.department);
      return IQ.rollupTotals(r).utilization_pct;
    });
    IQ_CHARTS.lineChart(document.getElementById("trend-chart"), {
      labels: trendWeeks.map(IQ.weekLabel),
      values: trendValues,
      target,
    });

    const findings = IQ_FINDINGS.computeAll(seed, scope.weeks, scope.department, target).slice(0, 5);
    const list = document.getElementById("attention-list");
    if (!findings.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="empty-state__title">No issues detected this week</div>
          <div>Every consultant and project in scope is within target.</div>
        </div>`;
      return;
    }
    list.innerHTML = findings
      .map(
        (f) => `
      <li>
        <span class="attention-list__dot" style="background:var(--color-${f.severity === "critical" ? "red" : "amber"})"></span>
        <div class="attention-list__body">
          <div class="attention-list__title"><a href="${f.link}">${f.title}</a></div>
          <div class="attention-list__meta">${f.type} &middot; ${f.meta}</div>
        </div>
        <div class="attention-list__value tabular">${IQ.fmtMoney(f.costImpact)}</div>
      </li>`
      )
      .join("");
  }

  IQ_SHELL.init("overview").then((seed) => {
    render(seed);
    document.addEventListener("iq:filterschange", () => render(seed));
  });
})();
