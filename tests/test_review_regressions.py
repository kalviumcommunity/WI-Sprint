"""Regressions for valid uploads, unknown billing status and allocation periods."""

from io import StringIO

import pandas as pd
import pytest

from src import insights, processing, validation


def raw_frame(dataset):
    rows = {
        "timesheets": {
            "employee_id": "E1", "project_id": "P1", "date": "2026-01-12",
            "hours": 8, "billable": True,
        },
        "allocations": {
            "employee_id": "E1", "project_id": "P1", "role": "Consultant",
            "planned_allocation_pct": 100, "actual_allocation_pct": 100,
            "start_date": "2026-01-01", "end_date": "2026-01-31",
        },
        "billing": {
            "client": "Client", "project_id": "P1", "month": "2026-01",
            "invoiced_hours": 8, "invoiced_amount": 800,
        },
    }
    return pd.DataFrame([rows[dataset]])


def validate(frame, dataset):
    return validation.validate_file(StringIO(frame.to_csv(index=False)), "upload.csv", dataset)


@pytest.mark.parametrize("dataset,column", [
    ("timesheets", "employee_id"), ("timesheets", "project_id"),
    ("allocations", "employee_id"), ("allocations", "project_id"),
    ("billing", "project_id"),
])
@pytest.mark.parametrize("missing", [None, "", "  "])
def test_missing_identifiers_are_rejected_and_never_become_records(dataset, column, missing):
    frame = raw_frame(dataset)
    frame[column] = missing
    result = validate(frame, dataset)
    assert not result.is_valid
    assert column in result.report()["column"].tolist()
    assert getattr(processing, f"clean_{dataset}")(frame).empty


@pytest.mark.parametrize("dataset,column", [
    ("timesheets", "hours"), ("allocations", "planned_allocation_pct"),
    ("allocations", "actual_allocation_pct"), ("billing", "invoiced_hours"),
    ("billing", "invoiced_amount"),
])
def test_required_numeric_values_cannot_be_null(dataset, column):
    frame = raw_frame(dataset)
    frame[column] = None
    result = validate(frame, dataset)
    assert not result.is_valid
    assert column in result.report()["column"].tolist()


@pytest.mark.parametrize("month", [None, "", "not-a-month", "2026-13"])
def test_invalid_billing_months_are_rejected_and_excluded(month):
    frame = raw_frame("billing")
    frame["month"] = month
    assert not validate(frame, "billing").is_valid
    assert processing.clean_billing(frame).empty


def test_missing_department_is_a_valid_unassigned_group():
    raw = raw_frame("timesheets")
    assert validate(raw, "timesheets").is_valid
    timesheets = processing.clean_timesheets(raw)
    result = insights.department_performance(timesheets, processing.employee_master(timesheets))
    assert result["department"].tolist() == ["Unassigned"]
    assert result["billable_hours"].tolist() == [8]


@pytest.mark.parametrize("groups", [[], ["employee_id"], ["project_id", "month"]])
def test_review_only_groups_keep_their_hours(groups):
    raw = raw_frame("timesheets")
    raw["billable"] = None
    result = processing.utilization_by(processing.clean_timesheets(raw), groups)
    assert len(result) == 1
    assert result["review_hours"].tolist() == [8]
    assert result["logged_hours"].tolist() == [0]
    assert result["utilization_pct"].isna().all()


def test_review_only_employee_is_not_lost_among_rated_employees():
    raw = raw_frame("timesheets")
    other = raw.assign(employee_id="E2", billable=None)
    result = processing.utilization_by(processing.clean_timesheets(pd.concat([raw, other])), ["employee_id"])
    assert set(result["employee_id"]) == {"E1", "E2"}
    assert result.set_index("employee_id").loc["E2", "review_hours"] == 8


@pytest.mark.parametrize("empty_timesheets", [True, False])
def test_invoice_without_billable_hours_is_a_discrepancy(empty_timesheets):
    timesheets = processing.clean_timesheets(raw_frame("timesheets").assign(billable=False))
    if empty_timesheets:
        timesheets = timesheets.iloc[:0]
    result = insights.billing_discrepancies(timesheets, processing.clean_billing(raw_frame("billing")))
    assert len(result) == 1
    assert result.iloc[0]["variance_hours"] == 8
    assert result.iloc[0]["variance_pct"] > 5


def test_zero_invoice_and_zero_billable_hours_reconcile():
    timesheets = processing.clean_timesheets(raw_frame("timesheets").assign(billable=False))
    billing = processing.clean_billing(raw_frame("billing").assign(invoiced_hours=0))
    assert insights.billing_discrepancies(timesheets, billing).empty


def allocations_with_second_period(start, end, employee="E1"):
    first = raw_frame("allocations")
    second = first.assign(start_date=start, end_date=end, employee_id=employee)
    return processing.clean_allocations(pd.concat([first, second]))


def test_sequential_allocations_do_not_add_capacity():
    allocations = allocations_with_second_period("2026-02-01", "2026-02-28")
    assert insights.overallocated_employees(allocations).empty
    staffing = insights.project_staffing_gaps(allocations)
    assert staffing["planned_total_pct"].max() == 100
    assert staffing["actual_total_pct"].max() == 100


def test_overlapping_allocations_report_only_the_concurrent_period():
    allocations = allocations_with_second_period("2026-01-20", "2026-02-28")
    result = insights.overallocated_employees(allocations)
    assert result["total_actual_allocation_pct"].tolist() == [200]
    assert result["start_date"].tolist() == [pd.Timestamp("2026-01-20")]
    assert result["end_date"].tolist() == [pd.Timestamp("2026-01-31")]


def test_department_and_noncontiguous_month_filters_apply_to_allocations():
    allocations = allocations_with_second_period("2026-01-01", "2026-05-31", employee="E2")
    employees = pd.DataFrame({"employee_id": ["E1", "E2"], "department": ["Sales", "Engineering"]})
    result = processing.filter_allocations(
        allocations, employees, departments=["Engineering"], months=["2026-02", "2026-04"]
    )
    assert result["employee_id"].tolist() == ["E2", "E2"]
    assert result["start_date"].tolist() == [pd.Timestamp("2026-02-01"), pd.Timestamp("2026-04-01")]
    assert result["end_date"].tolist() == [pd.Timestamp("2026-02-28"), pd.Timestamp("2026-04-30")]


def test_department_filter_uses_employee_department_not_optional_project_department():
    allocations = raw_frame("allocations").assign(department="Project Department")
    employees = pd.DataFrame({"employee_id": ["E1"], "department": ["Consulting"]})
    result = processing.filter_allocations(
        processing.clean_allocations(allocations), employees, departments=["Consulting"]
    )
    assert result["employee_id"].tolist() == ["E1"]


def test_empty_filtered_inputs_keep_result_schemas():
    timesheets = processing.clean_timesheets(raw_frame("timesheets")).iloc[:0]
    allocations = processing.clean_allocations(raw_frame("allocations")).iloc[:0]
    assert processing.utilization_by(timesheets, ["employee_id"]).empty
    assert insights.overallocated_employees(allocations).empty
    assert insights.project_staffing_gaps(allocations).empty


@pytest.mark.parametrize("dataset,column", [
    ("timesheets", "date"), ("allocations", "start_date"), ("allocations", "end_date"),
])
def test_required_dates_cannot_be_missing(dataset, column):
    frame = raw_frame(dataset)
    frame[column] = None
    assert not validate(frame, dataset).is_valid


def test_allocation_end_cannot_precede_start():
    frame = raw_frame("allocations").assign(end_date="2025-12-31")
    assert not validate(frame, "allocations").is_valid
    assert processing.clean_allocations(frame).empty


def test_allocation_end_dates_are_inclusive():
    allocations = allocations_with_second_period("2026-01-31", "2026-02-28")
    result = insights.overallocated_employees(allocations)
    assert result["start_date"].tolist() == [pd.Timestamp("2026-01-31")]
    assert result["end_date"].tolist() == [pd.Timestamp("2026-01-31")]


def test_month_filter_removes_an_overlap_outside_the_selected_month():
    allocations = allocations_with_second_period("2026-01-20", "2026-02-28")
    employees = pd.DataFrame({"employee_id": ["E1"], "department": ["Consulting"]})
    february = processing.filter_allocations(allocations, employees, months=["2026-02"])
    assert insights.overallocated_employees(february).empty


def test_opposite_staffing_gaps_in_sequential_periods_do_not_cancel():
    allocations = allocations_with_second_period("2026-02-01", "2026-02-28")
    allocations["actual_allocation_pct"] = [50, 150]
    result = insights.project_staffing_gaps(allocations)
    assert set(result["status"]) == {"Understaffed", "Overstaffed"}
    assert set(result["actual_total_pct"]) == {50, 150}
