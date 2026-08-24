(function () {
  let seedRef;

  function delta(cur, prev, higherIsBetter, fmt, isPP) {
    if (prev === null || prev === undefined || !isFinite(prev)) {
      return `<span class="kpi__delta delta-flat">No prior period</span>`;
    }
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return `<span class="kpi__delta delta-flat">Flat vs prior</span>`;
    const good = higherIsBetter ? d > 0 : d < 0;
    const mag = isPP ? `${Math.abs(d).toFixed(1)}pp` : fmt(Math.abs(d));
    return `<span class="kpi__delta ${good ? "delta-up" : "delta-down"}">${d > 0 ? "↑" : "↓"} ${mag}</span>`;
  }

  function kpi(label, help, value, deltaHtml, spark) {
    return `
      <article class="kpi">
        <div class="kpi__label">${label}<span class="kpi__info" title="${help}" aria-label="${help}">i</span></div>
        <div class="kpi__value">${value}</div>
        <div class="kpi__foot">${deltaHtml}${spark || ""}</div>
      </article>`;
  }

  function weeklySeries(seed, weeks, dept, fn) {
    return weeks.map((w) => fn(seed, [w], dept));
  }

  function render() {
    const seed = seedRef;
    const sc = IQ.getScope(seed);
    const target = seed.target_utilization_pct;

    const rows = IQ.rollupConsultants(seed, sc.weeks, sc.department);
    const now = IQ.rollupTotals(rows);
    const prev = sc.prevWeeks.length ? IQ.rollupTotals(IQ.rollupConsultants(seed, sc.prevWeeks, sc.department)) : null;

    const bench = IQ.benchCost(seed, sc.weeks, sc.department);
    const prevBench = sc.prevWeeks.length ? IQ.benchCost(seed, sc.prevWeeks, sc.department) : null;

    const variance = IQ.unbilledVariance(seed, sc.weeks, sc.department);
    const prevVar = sc.prevWeeks.length ? IQ.unbilledVariance(seed, sc.prevWeeks, sc.department) : null;

    const sparkWeeks = seed.weeks.slice(-12);
    const utilSeries = weeklySeries(seed, sparkWeeks, sc.department, (s, w, d) => IQ.rollupTotals(IQ.rollupConsultants(s, w, d)).utilization_pct);
    const billSeries = weeklySeries(seed, sparkWeeks, sc.department, (s, w, d) => IQ.rollupTotals(IQ.rollupConsultants(s, w, d)).billable);
    const benchSeries = weeklySeries(seed, sparkWeeks, sc.department, (s, w, d) => IQ.benchCost(s, w, d));
    const varSeries = weeklySeries(seed, sparkWeeks, sc.department, (s, w, d) => IQ.unbilledVariance(s, w, d));

    document.getElementById("kpis").innerHTML =
      kpi("Utilization vs target", `Billable hours divided by available hours. Target is ${target}%.`,
        IQ.fmtPct(now.utilization_pct), delta(now.utilization_pct, prev && prev.utilization_pct, true, null, true), IQ_CHARTS.sparkline(utilSeries)) +
      kpi("Billable hours", "Total billable hours logged in the selected period and department.",
        `<span class="num">${IQ.fmtHours(now.billable)}</span>`, delta(now.billable, prev && prev.billable, true, (v) => `${v.toFixed(0)}h`), IQ_CHARTS.sparkline(billSeries)) +
      kpi("Bench cost", "Available time that was never logged, priced at each consultant's rate.",
        `<span class="num">${IQ.fmtMoney(bench)}</span>`, delta(bench, prevBench, false, IQ.fmtMoney), IQ_CHARTS.sparkline(benchSeries)) +
      kpi("Unbilled variance", "Billable hours × rate, minus what was actually invoiced to the client.",
        `<span class="num">${IQ.fmtMoney(variance)}</span>`, delta(variance, prevVar, false, IQ.fmtMoney), IQ_CHARTS.sparkline(varSeries));

    IQ_CHARTS.lineChart(document.getElementById("trend"), {
      labels: sparkWeeks.map(IQ.weekLabel),
      values: utilSeries,
      target,
    });

    const dept = IQ.rollupByDepartment(seed, sc.weeks, sc.department).sort((a, b) => b.utilization_pct - a.utilization_pct);
    IQ_CHARTS.barChart(document.getElementById("dept-chart"), {
      labels: dept.map((d) => d.department),
      values: dept.map((d) => d.utilization_pct || 0),
      target,
    });

    const findings = IQ_FINDINGS.computeAll(seed, sc.weeks, sc.department, target).slice(0, 5);
    const list = document.getElementById("attn");
    if (!findings.length) {
      list.innerHTML = `<li style="border:none; padding:0;">
        <div class="empty">
          <svg class="empty__icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="empty__title">Nothing needs attention</div>
          <div>Everything in scope is inside its threshold.</div>
        </div></li>`;
    } else {
      list.innerHTML = findings
        .map(
          (f, i) => `<li>
            <span class="attn__rank num">${String(i + 1).padStart(2, "0")}</span>
            <div class="attn__body">
              <div class="attn__title"><a href="${f.link}">${f.title}</a></div>
              <div class="attn__meta">${f.type} · ${f.meta}</div>
            </div>
            <span class="attn__val">${IQ.fmtMoney(f.costImpact)}</span>
          </li>`
        )
        .join("");
    }
  }

  IQ_SHELL.init("overview").then((seed) => {
    seedRef = seed;
    render();
    document.addEventListener("iq:filterschange", render);
    IQ_CHARTS.autoRedraw(render);
  });
})();
