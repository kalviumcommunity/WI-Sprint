/* Small, quiet inline-SVG charts. No dependency, visible axis values,
   never a full-width hero chart - per the design brief. */

const IQ_CHARTS = (() => {
  function lineChart(el, { labels, values, target, height = 200 }) {
    const width = el.clientWidth || 560;
    const padL = 34, padR = 12, padT = 16, padB = 24;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const nums = values.filter((v) => v !== null && v !== undefined);
    const maxV = Math.max(target, ...nums, 10);
    const minV = Math.min(target, ...nums, 0);
    const range = maxV - minV || 1;
    const yFor = (v) => padT + innerH - ((v - minV) / range) * innerH;
    const xFor = (i) => padL + (values.length > 1 ? (i / (values.length - 1)) * innerW : innerW / 2);

    const gridSteps = 4;
    const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
      const v = minV + (range * i) / gridSteps;
      const y = yFor(v);
      return `<line class="axis-line" x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}" />
              <text x="${padL - 8}" y="${y + 3}" text-anchor="end">${Math.round(v)}</text>`;
    }).join("");

    const points = values.map((v, i) => `${xFor(i)},${v === null ? "" : yFor(v)}`).filter((p) => !p.endsWith(","));
    const pathD = points.length ? "M" + points.map((p) => p.replace(",", " ")).join(" L") : "";

    const dots = values
      .map((v, i) => (v === null ? "" : `<circle class="series-dot" cx="${xFor(i)}" cy="${yFor(v)}" r="2.5" />`))
      .join("");

    const labelStep = Math.ceil(labels.length / 6);
    const xLabels = labels
      .map((l, i) => (i % labelStep === 0 || i === labels.length - 1 ? `<text x="${xFor(i)}" y="${height - 4}" text-anchor="middle">${l}</text>` : ""))
      .join("");

    const targetY = yFor(target);

    el.innerHTML = `
      <svg class="svg-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
        ${gridLines}
        <line class="target-line" x1="${padL}" x2="${width - padR}" y1="${targetY}" y2="${targetY}" />
        <text x="${width - padR}" y="${targetY - 5}" text-anchor="end" fill="var(--color-text-tertiary)">Target ${target}%</text>
        <path class="series-line" d="${pathD}" />
        ${dots}
        ${xLabels}
      </svg>`;
  }

  function barChart(el, { labels, values, target, height = 220, unit = "%" }) {
    const width = el.clientWidth || 400;
    const padL = 34, padR = 12, padT = 16, padB = 28;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const maxV = Math.max(target, ...values, 10) * 1.05;
    const yFor = (v) => padT + innerH - (v / maxV) * innerH;
    const barW = Math.min(48, (innerW / values.length) * 0.55);
    const step = innerW / values.length;

    const gridSteps = 4;
    const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
      const v = (maxV * i) / gridSteps;
      const y = yFor(v);
      return `<line class="axis-line" x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}" />
              <text x="${padL - 8}" y="${y + 3}" text-anchor="end">${Math.round(v)}</text>`;
    }).join("");

    const bars = values
      .map((v, i) => {
        const x = padL + step * i + (step - barW) / 2;
        const y = yFor(v);
        const barColor = v >= target ? "var(--color-green)" : v >= target - 15 ? "var(--color-amber)" : "var(--color-red)";
        return `<rect class="bar" x="${x}" y="${y}" width="${barW}" height="${padT + innerH - y}" rx="2" style="fill:${barColor}" />
                <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" style="fill:var(--color-text-primary); font-weight:600;">${v.toFixed(1)}${unit}</text>
                <text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle">${labels[i]}</text>`;
      })
      .join("");

    const targetY = yFor(target);

    el.innerHTML = `
      <svg class="svg-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
        ${gridLines}
        <line class="target-line" x1="${padL}" x2="${width - padR}" y1="${targetY}" y2="${targetY}" />
        ${bars}
      </svg>`;
  }

  /** Tiny inline bar+track used inside table cells for billable/non-billable split. */
  function splitBarHtml(billable, nonBillable) {
    const total = billable + nonBillable;
    const pct = total > 0 ? (billable / total) * 100 : 0;
    return `<span class="split-bar"><span class="split-bar__fill" style="width:${pct.toFixed(0)}%"></span></span>`;
  }

  return { lineChart, barChart, splitBarHtml };
})();
