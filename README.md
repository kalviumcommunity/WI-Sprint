# UtilizationIQ

Employee Utilization Intelligence Dashboard — turns timesheets, project
allocation records, and client billing exports into one validated view of
who's billable, who's on the bench, and where billing doesn't reconcile.

## Run it

```bash
pip install -r requirements.txt
python scripts/generate_sample_data.py   # only needed once, to seed data/sample
streamlit run app.py
```

The app defaults to the generated sample data. Switch to "Upload files" in
the sidebar to run it against real CSV/JSON exports — timesheets,
allocation records, and billing, each validated for encoding and required
columns before anything is processed.

## Layout

- `src/validation.py` — file type/encoding/column checks, row-level error report
- `src/processing.py` — dedup, missing-value handling, standardization, merging
- `src/insights.py` — underutilization, overallocation, staffing gaps, billing variance
- `app.py` — Streamlit dashboard (KPIs, charts, filters, insights)
- `scripts/generate_sample_data.py` — synthetic demo data (40 consultants, 9 projects)

## Utilization definition

`utilization % = billable_hours / (billable_hours + non_billable_hours)` for
the selected period. Timesheet rows with a missing billable flag aren't
counted either way — they show up as "needs review" instead of being
silently assumed billable or not.
