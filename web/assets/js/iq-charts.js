/* Inline SVG charts. No library, no canvas - every stroke inherits theme
   tokens from CSS, so light/dark switching is free and instant. */

const IQ_CHARTS = (() => {
  const NS_ESCAPE = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function lineChart(el, { labels, values, target, height = 210 }) {
    const width = Math.max(el.clientWidth || 560, 280);
    const padL = 38, padR = 14, padT = 18, padB = 26;
    const iw = width - padL - padR;
    const ih = height - padT - padB;

    const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    if (!nums.length) {
      el.innerHTML = `<div class="empty" style="padding:32px 0;">No data in range.</div>`;
      return;
    }

    const hi = Math.max(target, ...nums);
    const lo = Math.min(target, ...nums);
    const pad = (hi - lo) * 0.18 || 5;
    const maxV = hi + pad;
    const minV = Math.max(0, lo - pad);
    const span = maxV - minV || 1;

    const yFor = (v) => padT + ih - ((v - minV) / span) * ih;
    const xFor = (i) => padL + (values.length > 1 ? (i / (values.length - 1)) * iw : iw / 2);

    const steps = 4;
    const grid = Array.from({ length: steps + 1 }, (_, i) => {
      const v = minV + (span * i) / steps;
      const y = yFor(v);
      return `<line class="grid-line" x1="${padL}" x2="${width - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>
              <text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
    }).join("");

    const pts = values.map((v, i) => ({ x: xFor(i), y: yFor(v), v })).filter((p) => p.v !== null && !Number.isNaN(p.v));
    const line = "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${(padT + ih).toFixed(1)} L${pts[0].x.toFixed(1)} ${(padT + ih).toFixed(1)} Z`;

    const step = Math.ceil(labels.length / 6);
    const xLabels = labels
      .map((l, i) => (i % step === 0 || i === labels.length - 1 ? `<text x="${xFor(i).toFixed(1)}" y="${height - 6}" text-anchor="middle">${NS_ESCAPE(l)}</text>` : ""))
      .join("");

    const ty = yFor(target);
    const last = pts[pts.length - 1];

    el.innerHTML = `
      <svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Utilization trend over ${labels.length} weeks against a ${target}% target">
        ${grid}
        <path class="area" d="${area}"/>
        <line class="target-line" x1="${padL}" x2="${width - padR}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}"/>
        <text x="${width - padR}" y="${(ty - 6).toFixed(1)}" text-anchor="end">Target ${target}%</text>
        <path class="line" d="${line}"/>
        <circle class="dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.2"/>
        <text class="lbl-strong" x="${last.x.toFixed(1)}" y="${(last.y - 10).toFixed(1)}" text-anchor="end">${last.v.toFixed(1)}%</text>
        ${xLabels}
      </svg>`;
  }

  function barChart(el, { labels, values, target, height = 230, unit = "%" }) {
    const width = Math.max(el.clientWidth || 420, 260);
    const padL = 38, padR = 14, padT = 20, padB = 30;
    const iw = width - padL - padR;
    const ih = height - padT - padB;
    if (!values.length) {
      el.innerHTML = `<div class="empty" style="padding:32px 0;">No data in range.</div>`;
      return;
    }
    const maxV = Math.max(target, ...values) * 1.12;
    const yFor = (v) => padT + ih - (v / maxV) * ih;
    const slot = iw / values.length;
    const bw = Math.min(46, slot * 0.5);

    const steps = 4;
    const grid = Array.from({ length: steps + 1 }, (_, i) => {
      const v = (maxV * i) / steps;
      const y = yFor(v);
      return `<line class="grid-line" x1="${padL}" x2="${width - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>
              <text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
    }).join("");

    const bars = values
      .map((v, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        const y = yFor(v);
        const fill = v >= target ? "var(--good)" : v >= target - 15 ? "var(--warn)" : "var(--bad)";
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(padT + ih - y).toFixed(1)}" rx="3" fill="${fill}"/>
                <text class="lbl-strong" x="${(x + bw / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle">${v.toFixed(1)}${unit}</text>
                <text x="${(x + bw / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle">${NS_ESCAPE(labels[i])}</text>`;
      })
      .join("");

    const ty = yFor(target);
    el.innerHTML = `
      <svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Utilization by department against a ${target}% target">
        ${grid}
        <line class="target-line" x1="${padL}" x2="${width - padR}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}"/>
        ${bars}
      </svg>`;
  }

  /** Tiny trend line for KPI cards - no axes, no labels, pure shape. */
  function sparkline(values, { width = 78, height = 26 } = {}) {
    const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    if (nums.length < 2) return "";
    const hi = Math.max(...nums);
    const lo = Math.min(...nums);
    const span = hi - lo || 1;
    const pts = nums.map((v, i) => {
      const x = (i / (nums.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((v - lo) / span) * (height - 6);
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    const d = "M" + pts.join(" L");
    const lastX = (width - 2).toFixed(1);
    const lastY = (height - 3 - ((nums[nums.length - 1] - lo) / span) * (height - 6)).toFixed(1);
    return `<svg class="kpi__spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" aria-hidden="true">
      <path d="${d}" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastX}" cy="${lastY}" r="2" fill="var(--accent)"/>
    </svg>`;
  }

  /** Two-tone bar showing billable vs non-billable proportion in a table cell. */
  function splitBar(billable, nonBillable) {
    const total = billable + nonBillable;
    const pct = total > 0 ? (billable / total) * 100 : 0;
    const label = `${pct.toFixed(0)}% billable`;
    return `<span class="split" role="img" aria-label="${label}" title="${label}">
      <span class="split__b" style="width:${pct.toFixed(1)}%"></span>
      <span class="split__n" style="width:${(100 - pct).toFixed(1)}%"></span>
    </span>`;
  }

  /* Charts are sized off clientWidth, so re-draw when the container resizes
     or the theme flips (stroke colors are CSS vars, but geometry is not). */
  function autoRedraw(fn) {
    let t;
    const run = () => { clearTimeout(t); t = setTimeout(fn, 120); };
    window.addEventListener("resize", run);
    document.addEventListener("iq:themechange", run);
  }

  return { lineChart, barChart, sparkline, splitBar, autoRedraw };
})();
