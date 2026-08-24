"""Business-insight flags surfaced on the dashboard.

Each function returns a plain DataFrame of the flagged rows plus the
numbers that triggered the flag, so a manager can see the evidence rather
than a bare "at risk" label.
"""

from __future__ import annotations

import pandas as pd

from src.processing import utilization_by


def underutilized_employees(
    timesheets: pd.DataFrame, employees: pd.DataFrame, threshold: float = 70.0
) -> pd.DataFrame:
    util = utilization_by(timesheets, ["employee_id"])
    util = util.merge(employees, on="employee_id", how="left")
    flagged = util[util["utilization_pct"] < threshold].copy()
    flagged["gap_to_threshold_pct"] = threshold - flagged["utilization_pct"]
    return flagged.sort_values("utilization_pct").reset_index(drop=True)


def overallocated_employees(allocations: pd.DataFrame, threshold: float = 100.0) -> pd.DataFrame:
    totals = (
        allocations.groupby("employee_id")["actual_allocation_pct"]
        .sum()
        .reset_index(name="total_actual_allocation_pct")
    )
    flagged = totals[totals["total_actual_allocation_pct"] > threshold].copy()
    flagged["over_by_pct"] = flagged["total_actual_allocation_pct"] - threshold
    return flagged.sort_values("total_actual_allocation_pct", ascending=False).reset_index(drop=True)


def project_staffing_gaps(allocations: pd.DataFrame, tolerance_pct: float = 10.0) -> pd.DataFrame:
    cols = [c for c in ["project_id", "project_name"] if c in allocations.columns]
    totals = allocations.groupby(cols).agg(
        planned_total_pct=("planned_allocation_pct", "sum"),
        actual_total_pct=("actual_allocation_pct", "sum"),
        assigned_headcount=("employee_id", "nunique"),
    ).reset_index()
    totals["gap_pct"] = totals["actual_total_pct"] - totals["planned_total_pct"]
    tol = totals["planned_total_pct"] * (tolerance_pct / 100)

    def _status(row):
        if row["gap_pct"] > tol[row.name]:
            return "Overstaffed"
        if row["gap_pct"] < -tol[row.name]:
            return "Understaffed"
        return "On plan"

    totals["status"] = totals.apply(_status, axis=1)
    return totals.sort_values("gap_pct").reset_index(drop=True)


def department_performance(timesheets: pd.DataFrame, employees: pd.DataFrame) -> pd.DataFrame:
    util = utilization_by(timesheets, ["department"]) if "department" in timesheets.columns else None
    if util is None:
        merged = timesheets.merge(employees, on="employee_id", how="left")
        util = utilization_by(merged, ["department"])
    return util.sort_values("utilization_pct", ascending=False).reset_index(drop=True)


def billing_discrepancies(
    timesheets: pd.DataFrame, billing: pd.DataFrame, variance_threshold_pct: float = 5.0
) -> pd.DataFrame:
    logged = utilization_by(timesheets, ["project_id", "month"])[
        ["project_id", "month", "billable_hours"]
    ]
    merged = billing.merge(logged, on=["project_id", "month"], how="outer").fillna(0.0)
    merged["variance_hours"] = merged["invoiced_hours"] - merged["billable_hours"]
    merged["variance_pct"] = merged.apply(
        lambda r: 100 * r["variance_hours"] / r["billable_hours"] if r["billable_hours"] else 0.0,
        axis=1,
    )
    flagged = merged[merged["variance_pct"].abs() > variance_threshold_pct]
    return flagged.sort_values("variance_pct", key=abs, ascending=False).reset_index(drop=True)


def monthly_utilization_trend(timesheets: pd.DataFrame) -> pd.DataFrame:
    return utilization_by(timesheets, ["month"]).sort_values("month").reset_index(drop=True)
