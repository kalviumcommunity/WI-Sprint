"""UtilizationIQ - Employee Utilization Intelligence Dashboard.

Streamlit entry point. Uploads/validates the three raw data sources,
cleans and merges them, then renders KPIs, charts, filters, and the
business-insight flags described in the PRD.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

from src import insights, processing, validation

SAMPLE_DIR = Path(__file__).resolve().parent / "data" / "sample"

st.set_page_config(page_title="UtilizationIQ", layout="wide")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_dataset(dataset_type: str, uploaded_file) -> pd.DataFrame | None:
    """Validate + return a raw dataframe from an upload, or None if invalid."""
    result = validation.validate_file(uploaded_file, uploaded_file.name, dataset_type)
    if not result.is_valid:
        st.error(f"**{dataset_type.title()} upload failed validation.**")
        st.dataframe(result.report(), use_container_width=True)
        return None
    return result.dataframe


@st.cache_data
def _load_sample(name: str) -> pd.DataFrame:
    return pd.read_csv(SAMPLE_DIR / f"{name}.csv")


def load_all_data(use_sample: bool, uploads: dict) -> dict | None:
    raw = {}
    if use_sample:
        raw["timesheets"] = _load_sample("timesheets")
        raw["allocations"] = _load_sample("allocations")
        raw["billing"] = _load_sample("billing")
    else:
        for dataset_type, file in uploads.items():
            if file is None:
                st.info("Upload all three files (timesheets, allocations, billing) to continue.")
                return None
            df = _load_dataset(dataset_type, file)
            if df is None:
                return None
            raw[dataset_type] = df

    return {
        "timesheets": processing.clean_timesheets(raw["timesheets"]),
        "allocations": processing.clean_allocations(raw["allocations"]),
        "billing": processing.clean_billing(raw["billing"]),
    }


# ---------------------------------------------------------------------------
# Sidebar: data source + filters
# ---------------------------------------------------------------------------

st.sidebar.title("UtilizationIQ")
st.sidebar.caption("Employee Utilization Intelligence Dashboard")

data_source = st.sidebar.radio("Data source", ["Use sample data", "Upload files"])

uploads = {}
if data_source == "Upload files":
    uploads["timesheets"] = st.sidebar.file_uploader("Employee timesheets (CSV/JSON)", type=["csv", "json"])
    uploads["allocations"] = st.sidebar.file_uploader("Project allocation records (CSV/JSON)", type=["csv", "json"])
    uploads["billing"] = st.sidebar.file_uploader("Client billing exports (CSV/JSON)", type=["csv", "json"])

data = load_all_data(use_sample=(data_source == "Use sample data"), uploads=uploads)
if data is None:
    st.stop()

timesheets, allocations, billing = data["timesheets"], data["allocations"], data["billing"]
employees = processing.employee_master(timesheets)
projects = processing.project_master(allocations, billing)

st.sidebar.divider()
st.sidebar.subheader("Filters")

dept_options = sorted(timesheets["department"].dropna().unique()) if "department" in timesheets else []
proj_options = sorted(timesheets["project_id"].dropna().unique())
emp_options = sorted(employees["employee_id"].dropna().unique())
month_options = sorted(timesheets["month"].dropna().unique())

f_department = st.sidebar.multiselect("Department", dept_options)
f_project = st.sidebar.multiselect("Project", proj_options)
f_employee = st.sidebar.multiselect("Employee", emp_options)
f_month = st.sidebar.multiselect("Month", month_options)

st.sidebar.divider()
threshold = st.sidebar.slider("Underutilization threshold (%)", min_value=0, max_value=100, value=70, step=5)

filtered = timesheets.copy()
if f_department:
    filtered = filtered[filtered["department"].isin(f_department)]
if f_project:
    filtered = filtered[filtered["project_id"].isin(f_project)]
if f_employee:
    filtered = filtered[filtered["employee_id"].isin(f_employee)]
if f_month:
    filtered = filtered[filtered["month"].isin(f_month)]

filtered_allocations = allocations.copy()
if f_department and "department" in filtered_allocations:
    filtered_allocations = filtered_allocations[filtered_allocations["department"].isin(f_department)]
if f_project:
    filtered_allocations = filtered_allocations[filtered_allocations["project_id"].isin(f_project)]
if f_employee:
    filtered_allocations = filtered_allocations[filtered_allocations["employee_id"].isin(f_employee)]

filtered_billing = billing.copy()
if f_project:
    filtered_billing = filtered_billing[filtered_billing["project_id"].isin(f_project)]
if f_month:
    filtered_billing = filtered_billing[filtered_billing["month"].isin(f_month)]


# ---------------------------------------------------------------------------
# KPI cards
# ---------------------------------------------------------------------------

st.title("Employee Utilization Intelligence Dashboard")

overall = processing.utilization_by(filtered, [])
billable_hours = float(overall["billable_hours"].iloc[0]) if len(overall) else 0.0
non_billable_hours = float(overall["non_billable_hours"].iloc[0]) if len(overall) else 0.0
utilization_pct = float(overall["utilization_pct"].iloc[0]) if len(overall) else 0.0
total_revenue = float(filtered_billing["invoiced_amount"].sum())

k1, k2, k3, k4, k5 = st.columns(5)
k1.metric("Total Employees", f"{filtered['employee_id'].nunique():,}")
k2.metric("Total Billable Hours", f"{billable_hours:,.1f}")
k3.metric("Total Non-Billable Hours", f"{non_billable_hours:,.1f}")
k4.metric("Employee Utilization", f"{utilization_pct:,.1f}%")
k5.metric("Total Revenue", f"${total_revenue:,.0f}")

review_hours = float(filtered.loc[filtered["needs_review"], "hours"].sum())
if review_hours > 0:
    st.caption(
        f"⚠ {review_hours:,.1f} logged hours have a missing/unrecognized billable flag and are "
        "excluded from the utilization figures above — flagged for manual review, not assumed."
    )

st.divider()


# ---------------------------------------------------------------------------
# Visualizations
# ---------------------------------------------------------------------------

col1, col2 = st.columns(2)

with col1:
    st.subheader("Department-wise Utilization")
    dept_util = processing.utilization_by(filtered, ["department"]) if "department" in filtered else pd.DataFrame()
    if len(dept_util):
        fig = px.bar(dept_util, x="department", y="utilization_pct", labels={"utilization_pct": "Utilization %"})
        fig.add_hline(y=threshold, line_dash="dash", line_color="gray", annotation_text=f"Target {threshold}%")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No data for the current filters.")

with col2:
    st.subheader("Billable vs Non-Billable Hours")
    split = pd.DataFrame(
        {"Type": ["Billable", "Non-Billable"], "Hours": [billable_hours, non_billable_hours]}
    )
    fig = px.bar(split, x="Type", y="Hours", color="Type")
    st.plotly_chart(fig, use_container_width=True)

col3, col4 = st.columns(2)

with col3:
    st.subheader("Monthly Utilization Trend")
    trend = insights.monthly_utilization_trend(filtered)
    if len(trend):
        fig = px.line(trend, x="month", y="utilization_pct", markers=True, labels={"utilization_pct": "Utilization %"})
        fig.add_hline(y=threshold, line_dash="dash", line_color="gray", annotation_text=f"Target {threshold}%")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No data for the current filters.")

with col4:
    st.subheader("Top Underutilized Employees")
    under = insights.underutilized_employees(filtered, employees, threshold=float(threshold))
    show_cols = [c for c in ["employee_id", "employee_name", "department", "utilization_pct", "gap_to_threshold_pct"] if c in under.columns]
    if len(under):
        st.dataframe(under[show_cols].head(10), use_container_width=True, hide_index=True)
        st.download_button(
            "Download full list (CSV)",
            under[show_cols].to_csv(index=False).encode("utf-8"),
            file_name="underutilized_employees.csv",
            mime="text/csv",
        )
    else:
        st.success(f"No employees below the {threshold}% utilization threshold.")

st.divider()


# ---------------------------------------------------------------------------
# Business insights
# ---------------------------------------------------------------------------

st.header("Business Insights")

tab1, tab2, tab3, tab4 = st.tabs(
    ["Overallocated Employees", "Project Staffing", "Department Performance", "Billing Discrepancies"]
)

def _export_button(df: pd.DataFrame, filename: str, label: str = "Download CSV") -> None:
    st.download_button(label, df.to_csv(index=False).encode("utf-8"), file_name=filename, mime="text/csv")


with tab1:
    over_emp = insights.overallocated_employees(filtered_allocations)
    if len(over_emp):
        over_emp = over_emp.merge(employees, on="employee_id", how="left")
        st.dataframe(over_emp, use_container_width=True, hide_index=True)
        _export_button(over_emp, "overallocated_employees.csv")
    else:
        st.success("No employees are allocated above 100% capacity.")

with tab2:
    gaps = insights.project_staffing_gaps(filtered_allocations)
    st.dataframe(gaps, use_container_width=True, hide_index=True)
    if len(gaps):
        _export_button(gaps, "project_staffing_gaps.csv")

with tab3:
    dept_perf = insights.department_performance(filtered, employees)
    st.dataframe(dept_perf, use_container_width=True, hide_index=True)
    if len(dept_perf):
        _export_button(dept_perf, "department_performance.csv")

with tab4:
    discrepancies = insights.billing_discrepancies(filtered, filtered_billing)
    if len(discrepancies):
        st.dataframe(discrepancies, use_container_width=True, hide_index=True)
        _export_button(discrepancies, "billing_discrepancies.csv")
    else:
        st.success("Logged billable hours reconcile with client billing within 5%.")
