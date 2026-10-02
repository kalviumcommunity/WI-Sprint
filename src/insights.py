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


def _allocation_periods(allocations: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    """Totals for each date interval with a stable set of concurrent allocations.

    Allocation end dates are inclusive. Boundaries avoid expanding long ranges
    into daily records while keeping sequential assignments separate.
    """
    rows = []
    for keys, group in allocations.groupby(group_cols, dropna=False):
        if not isinstance(keys, tuple):
            keys = (keys,)
        boundaries = sorted(set(group["start_date"]) | set(group["end_date"] + pd.Timedelta(days=1)))
        for start, stop in zip(boundaries, boundaries[1:]):
            active = group[(group["start_date"] <= start) & (group["end_date"] >= start)]
            if active.empty:
                continue
            rows.append({
                **dict(zip(group_cols, keys)),
                "start_date": start, "end_date": stop - pd.Timedelta(days=1),
                "planned_total_pct": active["planned_allocation_pct"].sum(),
                "actual_total_pct": active["actual_allocation_pct"].sum(),
                "assigned_headcount": active["employee_id"].nunique(),
            })
    return pd.DataFrame(rows, columns=[*group_cols, "start_date", "end_date",
                                      "planned_total_pct", "actual_total_pct", "assigned_headcount"])


def overallocated_employees(allocations: pd.DataFrame, threshold: float = 100.0) -> pd.DataFrame:
    totals = _allocation_periods(allocations, ["employee_id"])
    totals = totals.rename(columns={"actual_total_pct": "total_actual_allocation_pct"})
    totals = totals.drop(columns=["planned_total_pct", "assigned_headcount"])
    flagged = totals[totals["total_actual_allocation_pct"] > threshold].copy()
    flagged["over_by_pct"] = flagged["total_actual_allocation_pct"] - threshold
    return flagged.sort_values("total_actual_allocation_pct", ascending=False).reset_index(drop=True)


def project_staffing_gaps(allocations: pd.DataFrame, tolerance_pct: float = 10.0) -> pd.DataFrame:
    cols = [c for c in ["project_id", "project_name"] if c in allocations.columns]
    totals = _allocation_periods(allocations, cols)
    totals["gap_pct"] = totals["actual_total_pct"] - totals["planned_total_pct"]
    tol = totals["planned_total_pct"] * (tolerance_pct / 100)

    totals["status"] = "On plan"
    totals.loc[totals["gap_pct"] > tol, "status"] = "Overstaffed"
    totals.loc[totals["gap_pct"] < -tol, "status"] = "Understaffed"
    return totals.sort_values("gap_pct").reset_index(drop=True)


def department_performance(timesheets: pd.DataFrame, employees: pd.DataFrame) -> pd.DataFrame:
    merged = timesheets.copy()
    if "department" not in merged:
        if "department" in employees:
            merged = merged.merge(employees[["employee_id", "department"]], on="employee_id", how="left")
        else:
            merged["department"] = "Unassigned"
    merged["department"] = merged["department"].fillna("Unassigned")
    util = utilization_by(merged, ["department"])
    return util.sort_values("utilization_pct", ascending=False).reset_index(drop=True)


def billing_discrepancies(
    timesheets: pd.DataFrame, billing: pd.DataFrame, variance_threshold_pct: float = 5.0
) -> pd.DataFrame:
    logged = utilization_by(timesheets, ["project_id", "month"])[
        ["project_id", "month", "billable_hours"]
    ]
    merged = billing.merge(logged, on=["project_id", "month"], how="outer")
    numeric = ["invoiced_hours", "invoiced_amount", "billable_hours"]
    merged[numeric] = merged[numeric].fillna(0.0)
    merged["variance_hours"] = merged["invoiced_hours"] - merged["billable_hours"]
    # A nonzero invoice with no matching hours has unbounded relative variance.
    merged["variance_pct"] = 100 * merged["variance_hours"] / merged["billable_hours"]
    both_zero = merged["invoiced_hours"].eq(0) & merged["billable_hours"].eq(0)
    merged.loc[both_zero, "variance_pct"] = 0.0
    flagged = merged[merged["variance_pct"].abs() > variance_threshold_pct]
    return flagged.sort_values("variance_pct", key=abs, ascending=False).reset_index(drop=True)


def monthly_utilization_trend(timesheets: pd.DataFrame) -> pd.DataFrame:
    return utilization_by(timesheets, ["month"]).sort_values("month").reset_index(drop=True)
