"""Cleaning, standardization, and merging of the three raw data sources.

Utilization is computed straight from timesheets: billable_hours / logged_hours
for the selected period. Rows with a missing billable flag are kept out of
that ratio and surfaced separately as "needs review" rather than assumed
one way or the other, per the PRD's missing-value handling rule.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

TRUE_VALUES = {"true", "1", "yes", "billable", "y"}
FALSE_VALUES = {"false", "0", "no", "non-billable", "nonbillable", "n"}


def _clean_identifier(series: pd.Series) -> pd.Series:
    """Normalize identifiers without turning nulls or blanks into join keys."""
    return series.astype("string").str.strip().str.upper().replace("", pd.NA)


def _to_tri_state_bool(series: pd.Series) -> pd.Series:
    """Map a billable column to True/False/pd.NA (NA = needs review)."""

    def _map(val):
        if pd.isna(val):
            return pd.NA
        text = str(val).strip().lower()
        if text in TRUE_VALUES:
            return True
        if text in FALSE_VALUES:
            return False
        return pd.NA

    return series.map(_map)


def clean_timesheets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["employee_id"] = _clean_identifier(df["employee_id"])
    df["project_id"] = _clean_identifier(df["project_id"])
    df["date"] = pd.to_datetime(df["date"], errors="coerce", format="mixed")
    df["hours"] = pd.to_numeric(df["hours"], errors="coerce")
    df["billable"] = _to_tri_state_bool(df["billable"])
    df["needs_review"] = df["billable"].isna()
    if "department" not in df:
        df["department"] = "Unassigned"
    else:
        df["department"] = df["department"].astype("string").str.strip().replace("", pd.NA).fillna("Unassigned")

    df = df.dropna(subset=["employee_id", "project_id", "date", "hours"])
    df = df.drop_duplicates(subset=["employee_id", "project_id", "date", "hours", "billable"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    return df.reset_index(drop=True)


def clean_allocations(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["employee_id"] = _clean_identifier(df["employee_id"])
    df["project_id"] = _clean_identifier(df["project_id"])
    df["start_date"] = pd.to_datetime(df["start_date"], errors="coerce", format="mixed").dt.normalize()
    df["end_date"] = pd.to_datetime(df["end_date"], errors="coerce", format="mixed").dt.normalize()
    df["planned_allocation_pct"] = pd.to_numeric(df["planned_allocation_pct"], errors="coerce")
    df["actual_allocation_pct"] = pd.to_numeric(df["actual_allocation_pct"], errors="coerce")
    df = df.dropna(subset=["employee_id", "project_id", "start_date", "end_date",
                           "planned_allocation_pct", "actual_allocation_pct"])
    df = df[df["end_date"] >= df["start_date"]]
    df = df.drop_duplicates(subset=["employee_id", "project_id", "start_date"])
    return df.reset_index(drop=True)


def clean_billing(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["project_id"] = _clean_identifier(df["project_id"])
    df["month"] = pd.to_datetime(df["month"], errors="coerce", format="mixed")
    df["invoiced_hours"] = pd.to_numeric(df["invoiced_hours"], errors="coerce")
    df["invoiced_amount"] = pd.to_numeric(df["invoiced_amount"], errors="coerce")
    df = df.dropna(subset=["project_id", "month", "invoiced_hours", "invoiced_amount"])
    df["month"] = df["month"].dt.to_period("M").astype(str)
    df = df.drop_duplicates(subset=["client", "project_id", "month"])
    return df.reset_index(drop=True)


def employee_master(timesheets: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in ["employee_id", "employee_name", "department"] if c in timesheets.columns]
    return timesheets[cols].drop_duplicates(subset="employee_id").reset_index(drop=True)


def project_master(allocations: pd.DataFrame, billing: pd.DataFrame | None = None) -> pd.DataFrame:
    cols = [c for c in ["project_id", "project_name", "department"] if c in allocations.columns]
    projects = allocations[cols].drop_duplicates(subset="project_id").reset_index(drop=True)
    if billing is not None and "client" in billing.columns:
        client_map = billing[["project_id", "client"]].drop_duplicates(subset="project_id")
        projects = projects.merge(client_map, on="project_id", how="left")
    return projects


def filter_allocations(
    allocations: pd.DataFrame, employees: pd.DataFrame, *,
    departments=(), projects=(), employee_ids=(), months=(),
) -> pd.DataFrame:
    """Filter people/projects and clip inclusive allocation dates to selected months."""
    filtered = allocations.copy()
    if departments:
        selected = employees.loc[employees["department"].isin(departments), "employee_id"]
        filtered = filtered[filtered["employee_id"].isin(selected)]
    if projects:
        filtered = filtered[filtered["project_id"].isin(projects)]
    if employee_ids:
        filtered = filtered[filtered["employee_id"].isin(employee_ids)]
    if months:
        periods = []
        for month in sorted(set(months)):
            period = pd.Period(month, freq="M")
            start, end = period.start_time, period.end_time.normalize()
            part = filtered[(filtered["start_date"] <= end) & (filtered["end_date"] >= start)].copy()
            part["start_date"] = part["start_date"].clip(lower=start)
            part["end_date"] = part["end_date"].clip(upper=end)
            periods.append(part)
        filtered = pd.concat(periods, ignore_index=True)
    return filtered.reset_index(drop=True)


def utilization_by(timesheets: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    """Billable / (billable + non-billable) hours, grouped by the given columns.

    Rows flagged `needs_review` (missing billable status) are excluded from
    the ratio and reported separately as `review_hours`.
    """
    no_grouping = not group_cols
    cols = group_cols if group_cols else ["_all"]

    totals = timesheets.copy()
    if no_grouping:
        totals["_all"] = 1
    totals["billable_hours"] = totals["hours"].where(totals["billable"].eq(True).fillna(False), 0.0)
    totals["non_billable_hours"] = totals["hours"].where(totals["billable"].eq(False).fillna(False), 0.0)
    totals["review_hours"] = totals["hours"].where(totals["needs_review"], 0.0)
    grouped = totals.groupby(cols, dropna=False)[["billable_hours", "non_billable_hours", "review_hours"]].sum()

    grouped["logged_hours"] = grouped["billable_hours"] + grouped["non_billable_hours"]
    grouped["utilization_pct"] = np.where(
        grouped["logged_hours"] > 0, 100 * grouped["billable_hours"] / grouped["logged_hours"], np.nan
    )
    result = grouped.reset_index()
    if no_grouping:
        result = result.drop(columns=["_all"])
    return result
