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
    df["employee_id"] = df["employee_id"].astype(str).str.strip().str.upper()
    df["project_id"] = df["project_id"].astype(str).str.strip().str.upper()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["hours"] = pd.to_numeric(df["hours"], errors="coerce")
    df["billable"] = _to_tri_state_bool(df["billable"])
    df["needs_review"] = df["billable"].isna()

    df = df.dropna(subset=["employee_id", "project_id", "date", "hours"])
    df = df.drop_duplicates(subset=["employee_id", "project_id", "date", "hours", "billable"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    return df.reset_index(drop=True)


def clean_allocations(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["employee_id"] = df["employee_id"].astype(str).str.strip().str.upper()
    df["project_id"] = df["project_id"].astype(str).str.strip().str.upper()
    df["start_date"] = pd.to_datetime(df["start_date"], errors="coerce")
    df["end_date"] = pd.to_datetime(df["end_date"], errors="coerce")
    df["planned_allocation_pct"] = pd.to_numeric(df["planned_allocation_pct"], errors="coerce")
    df["actual_allocation_pct"] = pd.to_numeric(df["actual_allocation_pct"], errors="coerce")
    df = df.drop_duplicates(subset=["employee_id", "project_id", "start_date"])
    return df.reset_index(drop=True)


def clean_billing(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["project_id"] = df["project_id"].astype(str).str.strip().str.upper()
    df["month"] = pd.to_datetime(df["month"], errors="coerce").dt.to_period("M").astype(str)
    df["invoiced_hours"] = pd.to_numeric(df["invoiced_hours"], errors="coerce")
    df["invoiced_amount"] = pd.to_numeric(df["invoiced_amount"], errors="coerce")
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


def utilization_by(timesheets: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    """Billable / (billable + non-billable) hours, grouped by the given columns.

    Rows flagged `needs_review` (missing billable status) are excluded from
    the ratio and reported separately as `review_hours`.
    """
    no_grouping = not group_cols
    cols = group_cols if group_cols else ["_all"]

    rated = timesheets[~timesheets["needs_review"]].copy()
    review = timesheets[timesheets["needs_review"]].copy()
    if no_grouping:
        rated["_all"] = 1
        review["_all"] = 1

    grouped = rated.pivot_table(index=cols, columns="billable", values="hours", aggfunc="sum", fill_value=0.0)
    grouped = grouped.rename(columns={True: "billable_hours", False: "non_billable_hours"})
    for col in ("billable_hours", "non_billable_hours"):
        if col not in grouped.columns:
            grouped[col] = 0.0

    review_sum = review.groupby(cols)["hours"].sum()
    grouped["review_hours"] = review_sum.reindex(grouped.index, fill_value=0.0)

    grouped["logged_hours"] = grouped["billable_hours"] + grouped["non_billable_hours"]
    grouped["utilization_pct"] = np.where(
        grouped["logged_hours"] > 0, 100 * grouped["billable_hours"] / grouped["logged_hours"], np.nan
    )
    result = grouped.reset_index()
    if no_grouping:
        result = result.drop(columns=["_all"])
    return result
