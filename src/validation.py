"""Dataset validation for the three raw input sources.

Checks file type / encoding and required columns before anything is
allowed into the processing pipeline, and produces a row/column level
report when a file fails so the uploader knows exactly what to fix.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

SUPPORTED_EXTENSIONS = {".csv", ".json"}

REQUIRED_COLUMNS = {
    "timesheets": ["employee_id", "date", "project_id", "hours", "billable"],
    "allocations": [
        "project_id",
        "employee_id",
        "role",
        "planned_allocation_pct",
        "actual_allocation_pct",
        "start_date",
        "end_date",
    ],
    "billing": ["client", "project_id", "month", "invoiced_hours", "invoiced_amount"],
}


@dataclass
class ValidationResult:
    is_valid: bool
    dataset_type: str
    dataframe: pd.DataFrame | None = None
    errors: list[dict] = field(default_factory=list)

    def report(self) -> pd.DataFrame:
        """Row/column error report for display or re-download."""
        if not self.errors:
            return pd.DataFrame(columns=["row", "column", "message"])
        return pd.DataFrame(self.errors)


def _read_raw(file, extension: str) -> pd.DataFrame:
    if extension == ".csv":
        return pd.read_csv(file, encoding="utf-8")
    return pd.read_json(file, encoding="utf-8")


def validate_file(file, filename: str, dataset_type: str) -> ValidationResult:
    """Validate an uploaded file (path or file-like object) before processing.

    `filename` is used only to determine the extension, since Streamlit's
    uploaded-file objects don't have a filesystem path.
    """
    errors: list[dict] = []
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        errors.append(
            {
                "row": "-",
                "column": "-",
                "message": f"Unsupported file type '{extension or 'unknown'}'. "
                f"Supported formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}.",
            }
        )
        return ValidationResult(False, dataset_type, None, errors)

    try:
        df = _read_raw(file, extension)
    except UnicodeDecodeError:
        errors.append(
            {
                "row": "-",
                "column": "-",
                "message": "File is not readable as UTF-8. Re-save/export it as UTF-8 and re-upload.",
            }
        )
        return ValidationResult(False, dataset_type, None, errors)
    except Exception as exc:  # malformed CSV/JSON
        errors.append({"row": "-", "column": "-", "message": f"Could not parse file: {exc}"})
        return ValidationResult(False, dataset_type, None, errors)

    required = REQUIRED_COLUMNS[dataset_type]
    missing = [c for c in required if c not in df.columns]
    if missing:
        errors.append(
            {
                "row": "-",
                "column": ", ".join(missing),
                "message": f"Missing required column(s): {', '.join(missing)}.",
            }
        )
        return ValidationResult(False, dataset_type, None, errors)

    if dataset_type == "timesheets":
        errors.extend(_check_numeric(df, "hours"))
        errors.extend(_check_dates(df, "date"))
    elif dataset_type == "allocations":
        errors.extend(_check_numeric(df, "planned_allocation_pct"))
        errors.extend(_check_numeric(df, "actual_allocation_pct"))
        errors.extend(_check_dates(df, "start_date"))
        errors.extend(_check_dates(df, "end_date"))
    elif dataset_type == "billing":
        errors.extend(_check_numeric(df, "invoiced_hours"))
        errors.extend(_check_numeric(df, "invoiced_amount"))

    return ValidationResult(is_valid=len(errors) == 0, dataset_type=dataset_type, dataframe=df, errors=errors)


def _check_numeric(df: pd.DataFrame, column: str) -> list[dict]:
    bad_rows = df[pd.to_numeric(df[column], errors="coerce").isna() & df[column].notna()]
    return [
        {"row": idx, "column": column, "message": f"Value '{val}' is not numeric."}
        for idx, val in bad_rows[column].items()
    ]


def _check_dates(df: pd.DataFrame, column: str) -> list[dict]:
    parsed = pd.to_datetime(df[column], errors="coerce")
    bad_rows = df[parsed.isna() & df[column].notna()]
    return [
        {"row": idx, "column": column, "message": f"Value '{val}' is not a recognizable date."}
        for idx, val in bad_rows[column].items()
    ]
