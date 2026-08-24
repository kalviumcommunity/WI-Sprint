/* Generic sortable-table wiring shared by every data table on the site. */

const IQ_TABLE = (() => {
  function attachSort(theadEl, rowsRef, renderFn, initialKey, initialDir) {
    let sortKey = initialKey;
    let sortDir = initialDir || "desc";

    function apply() {
      const rows = [...rowsRef.current];
      rows.sort((a, b) => {
        let av = a[sortKey];
        let bv = b[sortKey];
        if (typeof av === "string" || typeof bv === "string") {
          av = av ?? "";
          bv = bv ?? "";
          return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        }
        av = av === null || av === undefined ? -Infinity : av;
        bv = bv === null || bv === undefined ? -Infinity : bv;
        return sortDir === "asc" ? av - bv : bv - av;
      });
      renderFn(rows);
      theadEl.querySelectorAll("th[data-key]").forEach((th) => {
        const active = th.dataset.key === sortKey;
        th.classList.toggle("is-sorted", active);
        th.dataset.dir = active ? (sortDir === "asc" ? "▲" : "▼") : "";
      });
    }

    theadEl.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = th.dataset.type === "text" ? "asc" : "desc";
        }
        apply();
      });
    });

    apply();
    return { refresh: apply };
  }

  function toCsv(rows, columns) {
    const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
    const lines = rows.map((r) =>
      columns
        .map((c) => {
          const v = typeof c.value === "function" ? c.value(r) : r[c.key];
          return `"${String(v ?? "").replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    return [header, ...lines].join("\n");
  }

  function downloadCsv(filename, csvText) {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { attachSort, toCsv, downloadCsv };
})();
