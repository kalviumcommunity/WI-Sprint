/* Sortable-table wiring + CSV export, shared by every table on the site. */

const IQ_TABLE = (() => {
  function attachSort(thead, rowsRef, renderFn, initialKey, initialDir) {
    let key = initialKey;
    let dir = initialDir || "desc";

    function apply() {
      const rows = [...rowsRef.current];
      rows.sort((a, b) => {
        let av = a[key];
        let bv = b[key];
        if (typeof av === "string" || typeof bv === "string") {
          return dir === "asc"
            ? String(av ?? "").localeCompare(String(bv ?? ""))
            : String(bv ?? "").localeCompare(String(av ?? ""));
        }
        av = av === null || av === undefined || Number.isNaN(av) ? -Infinity : av;
        bv = bv === null || bv === undefined || Number.isNaN(bv) ? -Infinity : bv;
        return dir === "asc" ? av - bv : bv - av;
      });
      renderFn(rows);
      thead.querySelectorAll("th[data-key]").forEach((th) => {
        const active = th.dataset.key === key;
        th.classList.toggle("is-sorted", active);
        th.setAttribute("aria-sort", active ? (dir === "asc" ? "ascending" : "descending") : "none");
        const caret = th.querySelector(".sort-caret");
        if (caret) caret.remove();
        if (active) th.insertAdjacentHTML("beforeend", `<span class="sort-caret">${dir === "asc" ? "▲" : "▼"}</span>`);
      });
    }

    thead.querySelectorAll("th[data-key]").forEach((th) => {
      th.setAttribute("tabindex", "0");
      th.setAttribute("role", "columnheader");
      const activate = () => {
        if (key === th.dataset.key) dir = dir === "asc" ? "desc" : "asc";
        else {
          key = th.dataset.key;
          dir = th.dataset.type === "text" ? "asc" : "desc";
        }
        apply();
      };
      th.addEventListener("click", activate);
      th.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });

    apply();
    return { refresh: apply };
  }

  function toCsv(rows, columns) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = columns.map((c) => esc(c.label)).join(",");
    const body = rows.map((r) =>
      columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.key])).join(",")
    );
    return [head, ...body].join("\r\n");
  }

  function downloadCsv(filename, csv) {
    // BOM so Excel opens UTF-8 correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { attachSort, toCsv, downloadCsv };
})();
