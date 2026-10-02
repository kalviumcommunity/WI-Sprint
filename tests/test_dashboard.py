"""Exercise user-visible filter and missing-data behavior in Streamlit."""

from pathlib import Path

import pandas as pd
import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

APP = Path(__file__).resolve().parents[1] / "app.py"


@pytest.fixture(autouse=True)
def clear_sample_cache():
    st.cache_data.clear()
    yield
    st.cache_data.clear()


@pytest.mark.parametrize("label", ["Department", "Employee"])
def test_people_filters_disable_unattributable_billing(label):
    app = AppTest.from_file(str(APP)).run(timeout=30)
    assert not app.exception
    control = next(item for item in app.multiselect if item.label == label)
    control.set_value([control.options[0]]).run(timeout=30)
    assert not app.exception
    revenue = next(item for item in app.metric if item.label == "Total Revenue")
    assert revenue.value == "Unavailable"
    assert any("Clear the employee and department filters" in item.value for item in app.info)
    assert not any("reconcile with client billing" in item.value for item in app.success)


def test_review_only_upload_without_department_renders_visible_review_hours(monkeypatch):
    frames = {
        "timesheets": pd.DataFrame([{
            "employee_id": "E1", "project_id": "P1", "date": "2026-01-12",
            "hours": 8, "billable": None,
        }]),
        "allocations": pd.DataFrame([{
            "employee_id": "E1", "project_id": "P1", "role": "Consultant",
            "planned_allocation_pct": 100, "actual_allocation_pct": 100,
            "start_date": "2026-01-01", "end_date": "2026-01-31",
        }]),
        "billing": pd.DataFrame([{
            "client": "Client", "project_id": "P1", "month": "2026-01",
            "invoiced_hours": 8, "invoiced_amount": 800,
        }]),
    }
    monkeypatch.setattr(pd, "read_csv", lambda path: frames[Path(path).stem].copy())
    app = AppTest.from_file(str(APP)).run(timeout=30)
    assert not app.exception
    metrics = {item.label: item.value for item in app.metric}
    assert metrics["Hours Needing Review"] == "8.0"
    assert metrics["Employee Utilization"] == "Not rated"
    assert any(item.label == "Hours needing review" for item in app.expander)
    assert not any("reconcile with client billing" in item.value for item in app.success)


def test_project_with_only_an_invoice_can_be_selected(monkeypatch):
    original = pd.read_csv

    def with_extra_invoice(path):
        frame = original(path)
        if Path(path).stem == "billing":
            extra = frame.iloc[[0]].assign(project_id="INVOICE_ONLY")
            return pd.concat([frame, extra], ignore_index=True)
        return frame

    monkeypatch.setattr(pd, "read_csv", with_extra_invoice)
    app = AppTest.from_file(str(APP)).run(timeout=30)
    project = next(item for item in app.multiselect if item.label == "Project")
    assert "INVOICE_ONLY" in project.options
    project.set_value(["INVOICE_ONLY"]).run(timeout=30)
    assert not app.exception
    assert not any("reconcile with client billing" in item.value for item in app.success)
