"""Generates realistic, internally-consistent sample CSVs for local dev/demo.

Run with: python scripts/generate_sample_data.py
Writes to data/sample/{timesheets,allocations,billing}.csv
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

random.seed(42)

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "sample"

DEPARTMENTS = ["Strategy", "Engineering", "Design", "PMO"]

FIRST_NAMES = [
    "Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Neha", "Karan", "Ishita",
    "Arjun", "Meera", "Siddharth", "Divya", "Rahul", "Sneha", "Aditya", "Kavya",
    "Nikhil", "Pooja", "Varun", "Ritika", "James", "Sarah", "Michael", "Emma",
    "Daniel", "Olivia", "Liam", "Sophia", "Ethan", "Ava", "Noah", "Mia",
    "Lucas", "Grace", "Henry", "Chloe", "Owen", "Zoe", "Leo", "Isla",
]
LAST_NAMES = [
    "Sharma", "Verma", "Iyer", "Nair", "Gupta", "Reddy", "Kapoor", "Bhatt",
    "Malhotra", "Chatterjee", "Mehta", "Rao", "Desai", "Joshi", "Pillai",
    "Bose", "Singh", "Kumar", "Chen", "Patel", "Anderson", "Clark", "Lewis",
    "Walker", "Hall", "Young", "King", "Wright", "Scott", "Baker",
]

ROLE_RATE_BANDS = {
    "Analyst": (120, 140),
    "Consultant": (140, 170),
    "Senior Consultant": (170, 200),
    "Manager": (200, 230),
    "Principal": (230, 260),
}
ROLE_WEIGHTS = [0.30, 0.28, 0.22, 0.13, 0.07]

CLIENTS = [
    "Meridian Capital", "Northbridge Retail", "Solace Health", "Vantage Logistics",
    "Cobalt Manufacturing", "Halcyon Insurance", "Ferro Steelworks", "Brightline Telecom",
    "Anchorage Foods",
]

PERIOD_START = date(2026, 6, 1)
PERIOD_END = date(2026, 8, 31)


def _weekdays(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def build_employees():
    employees = []
    for i in range(1, 41):
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        role = random.choices(list(ROLE_RATE_BANDS), weights=ROLE_WEIGHTS)[0]
        lo, hi = ROLE_RATE_BANDS[role]
        employees.append(
            {
                "employee_id": f"EMP{i:03d}",
                "employee_name": f"{first} {last}",
                "department": random.choice(DEPARTMENTS),
                "role": role,
                "hourly_rate": random.randint(lo, hi),
            }
        )
    return pd.DataFrame(employees)


def build_projects():
    projects = []
    for i in range(1, 10):
        projects.append(
            {
                "project_id": f"PRJ{i:02d}",
                "project_name": f"{random.choice(CLIENTS)} Engagement {i}",
                "client": CLIENTS[(i - 1) % len(CLIENTS)],
                "department": random.choice(DEPARTMENTS),
                "start_date": PERIOD_START - timedelta(days=random.randint(0, 30)),
                "end_date": PERIOD_END + timedelta(days=random.randint(0, 60)),
            }
        )
    return pd.DataFrame(projects)


def build_allocations(employees: pd.DataFrame, projects: pd.DataFrame):
    rows = []
    for _, emp in employees.iterrows():
        n_projects = random.choices([1, 2, 3], weights=[0.5, 0.35, 0.15])[0]
        dept_projects = projects[projects["department"] == emp["department"]]
        pool = dept_projects if len(dept_projects) >= n_projects else projects
        assigned = pool.sample(n=min(n_projects, len(pool)), random_state=random.randint(0, 10_000))
        remaining = 100
        for j, (_, proj) in enumerate(assigned.iterrows()):
            planned = remaining if j == len(assigned) - 1 else random.randint(20, max(20, remaining - 20))
            planned = max(10, min(planned, 100))
            remaining -= planned
            drift = random.choice([-15, -10, -5, 0, 0, 5, 10, 15, 25])
            actual = max(0, planned + drift)
            rows.append(
                {
                    "project_id": proj["project_id"],
                    "project_name": proj["project_name"],
                    "department": proj["department"],
                    "employee_id": emp["employee_id"],
                    "role": emp["role"],
                    "planned_allocation_pct": planned,
                    "actual_allocation_pct": actual,
                    "start_date": proj["start_date"].isoformat(),
                    "end_date": proj["end_date"].isoformat(),
                }
            )
    return pd.DataFrame(rows)


def build_timesheets(employees: pd.DataFrame, allocations: pd.DataFrame):
    rows = []
    emp_projects = allocations.groupby("employee_id")["project_id"].apply(list).to_dict()
    for _, emp in employees.iterrows():
        projects = emp_projects.get(emp["employee_id"], [])
        if not projects:
            continue
        # A handful of employees run under-target on purpose so the
        # "underutilized" insight has something real to surface.
        bench_leaning = random.random() < 0.15
        for d in _weekdays(PERIOD_START, PERIOD_END):
            if random.random() < 0.04:  # PTO / holiday, no entry
                continue
            day_hours = round(random.uniform(5.5, 8.5), 1)
            billable_share = random.uniform(0.35, 0.6) if bench_leaning else random.uniform(0.65, 0.95)
            billable_hours = round(day_hours * billable_share, 1)
            non_billable_hours = round(day_hours - billable_hours, 1)
            proj = random.choice(projects)
            missing_flag = random.random() < 0.02

            if billable_hours > 0:
                rows.append(
                    {
                        "employee_id": emp["employee_id"],
                        "employee_name": emp["employee_name"],
                        "department": emp["department"],
                        "project_id": proj,
                        "date": d.isoformat(),
                        "hours": billable_hours,
                        "billable": None if missing_flag else True,
                    }
                )
            if non_billable_hours > 0:
                rows.append(
                    {
                        "employee_id": emp["employee_id"],
                        "employee_name": emp["employee_name"],
                        "department": emp["department"],
                        "project_id": proj,
                        "date": d.isoformat(),
                        "hours": non_billable_hours,
                        "billable": False,
                    }
                )
    return pd.DataFrame(rows)


def build_billing(timesheets: pd.DataFrame, allocations: pd.DataFrame, employees: pd.DataFrame):
    rate_by_emp = employees.set_index("employee_id")["hourly_rate"].to_dict()
    ts = timesheets.copy()
    ts["month"] = pd.to_datetime(ts["date"]).dt.to_period("M").astype(str)
    billable = ts[ts["billable"] == True]  # noqa: E712
    billable_hours = billable.groupby(["project_id", "month"])["hours"].sum().reset_index()

    client_by_project = (
        allocations[["project_id", "project_name"]]
        .drop_duplicates("project_id")
        .set_index("project_id")["project_name"]
    )
    project_client = {}
    for pid in billable_hours["project_id"].unique():
        emp_ids = allocations.loc[allocations["project_id"] == pid, "employee_id"]
        avg_rate = sum(rate_by_emp.get(e, 160) for e in emp_ids) / max(len(emp_ids), 1)
        project_client[pid] = avg_rate

    rows = []
    for _, r in billable_hours.iterrows():
        avg_rate = project_client.get(r["project_id"], 160)
        # Billing rarely matches logged hours exactly - a few % drift either way.
        invoiced_hours = round(r["hours"] * random.uniform(0.9, 1.05), 1)
        rows.append(
            {
                "client": None,
                "project_id": r["project_id"],
                "month": r["month"],
                "invoiced_hours": invoiced_hours,
                "invoiced_amount": round(invoiced_hours * avg_rate, 2),
            }
        )
    billing = pd.DataFrame(rows)
    return billing


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    employees = build_employees()
    projects = build_projects()
    allocations = build_allocations(employees, projects)
    timesheets = build_timesheets(employees, allocations)
    billing = build_billing(timesheets, allocations, employees)

    client_map = projects.set_index("project_id")["client"]
    billing["client"] = billing["project_id"].map(client_map)

    timesheets.to_csv(OUT_DIR / "timesheets.csv", index=False)
    allocations.to_csv(OUT_DIR / "allocations.csv", index=False)
    billing.to_csv(OUT_DIR / "billing.csv", index=False)

    print(f"Wrote {len(timesheets)} timesheet rows, {len(allocations)} allocation rows, "
          f"{len(billing)} billing rows to {OUT_DIR}")


if __name__ == "__main__":
    main()
