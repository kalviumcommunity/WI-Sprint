"""Generates the realistic, internally-consistent seed dataset for the
UtilizationIQ website (web/assets/data/seed.json).

Everything downstream (KPIs, tables, charts, insights) is computed in the
browser from this one file, so the numbers stay consistent across screens.
Rules enforced here, per the design brief:
  - utilization_pct == billable_hours / available_hours, same row
  - currency values derive from hours x hourly_rate, no round numbers
  - 12 trailing weeks, most recent week = the week containing today
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(7)

OUT = Path(__file__).resolve().parent.parent / "web" / "assets" / "data" / "seed.json"

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
ROLE_WEIGHTS = [0.28, 0.30, 0.22, 0.13, 0.07]

CLIENTS = [
    "Meridian Capital", "Northbridge Retail", "Solace Health", "Vantage Logistics",
    "Cobalt Manufacturing", "Halcyon Insurance", "Ferro Steelworks", "Brightline Telecom",
    "Anchorage Foods",
]

TARGET_UTILIZATION = 75.0
TODAY = date(2026, 8, 21)


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def trailing_weeks(n: int) -> list[date]:
    end = week_start(TODAY)
    return [end - timedelta(weeks=i) for i in range(n - 1, -1, -1)]


WEEKS = trailing_weeks(12)


def build_consultants():
    out = []
    used_names = set()
    for i in range(1, 41):
        while True:
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            if name not in used_names:
                used_names.add(name)
                break
        role = random.choices(list(ROLE_RATE_BANDS), weights=ROLE_WEIGHTS)[0]
        lo, hi = ROLE_RATE_BANDS[role]
        # A slice of consultants run a bench-leaning utilization profile on
        # purpose, so the insights/underutilized views have real signal.
        profile = random.choices(
            ["healthy", "bench_leaning", "overallocated"], weights=[0.62, 0.23, 0.15]
        )[0]
        out.append(
            {
                "id": f"C{i:03d}",
                "name": name,
                "role": role,
                "department": DEPARTMENTS[(i - 1) % 4] if i <= 40 else random.choice(DEPARTMENTS),
                "hourly_rate": random.randint(lo, hi),
                "profile": profile,
            }
        )
    random.shuffle(out)
    for i, c in enumerate(out, start=1):
        c["id"] = f"C{i:03d}"
    return out


def build_projects():
    names_by_client = {
        "Meridian Capital": "Portfolio Ops Modernization",
        "Northbridge Retail": "Store Ops Efficiency",
        "Solace Health": "Care Pathway Redesign",
        "Vantage Logistics": "Network Optimization",
        "Cobalt Manufacturing": "Plant Digitization",
        "Halcyon Insurance": "Claims Automation",
        "Ferro Steelworks": "Supply Chain Resilience",
        "Brightline Telecom": "Customer Experience Overhaul",
        "Anchorage Foods": "Cold Chain Analytics",
    }
    out = []
    for i, (client, name) in enumerate(names_by_client.items(), start=1):
        start = TODAY - timedelta(weeks=random.randint(6, 20))
        end = TODAY + timedelta(weeks=random.randint(4, 16))
        out.append(
            {
                "id": f"P{i:02d}",
                "name": name,
                "client": client,
                "department": DEPARTMENTS[(i - 1) % 4],
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
            }
        )
    return out


def build_allocations(consultants, projects):
    by_dept = {d: [p for p in projects if p["department"] == d] for d in DEPARTMENTS}
    rows = []
    for c in consultants:
        pool = by_dept[c["department"]] or projects
        n = random.choices([1, 2], weights=[0.65, 0.35])[0]
        assigned = random.sample(pool, k=min(n, len(pool)))
        remaining = 100
        for j, proj in enumerate(assigned):
            planned = remaining if j == len(assigned) - 1 else random.randint(30, max(30, remaining - 20))
            planned = max(20, min(planned, 100))
            remaining -= planned

            if c["profile"] == "bench_leaning":
                drift = random.choice([-40, -35, -30, -25, -20])
            elif c["profile"] == "overallocated":
                drift = random.choice([15, 20, 25, 30])
            else:
                drift = random.choice([-10, -5, 0, 0, 5, 10])
            actual = max(0, planned + drift)

            rows.append(
                {
                    "project_id": proj["id"],
                    "consultant_id": c["id"],
                    "planned_pct": planned,
                    "actual_pct": actual,
                    "start_date": proj["start_date"],
                    "end_date": proj["end_date"],
                }
            )
    return rows


def build_weekly_timesheets(consultants, allocations):
    alloc_by_consultant: dict[str, list[dict]] = {}
    for a in allocations:
        alloc_by_consultant.setdefault(a["consultant_id"], []).append(a)

    rows = []
    for c in consultants:
        allocs = alloc_by_consultant.get(c["id"], [])
        if not allocs:
            continue
        total_actual = sum(a["actual_pct"] for a in allocs) or 1
        for wk in WEEKS:
            available = 40.0
            week_jitter = random.uniform(0.9, 1.08)
            for a in allocs:
                share = a["actual_pct"] / total_actual
                target_hours = available * (a["actual_pct"] / 100) * week_jitter
                if c["profile"] == "bench_leaning":
                    non_billable_share = random.uniform(0.30, 0.55)
                else:
                    non_billable_share = random.uniform(0.06, 0.18)
                billable = round(target_hours * (1 - non_billable_share), 1)
                non_billable = round(target_hours * non_billable_share, 1)
                billable = max(0.0, min(billable, available))
                non_billable = max(0.0, min(non_billable, available - billable))
                rows.append(
                    {
                        "consultant_id": c["id"],
                        "project_id": a["project_id"],
                        "week_start": wk.isoformat(),
                        "billable_hours": billable,
                        "non_billable_hours": non_billable,
                        "available_hours": round(available * share, 1),
                    }
                )
    return rows


def build_billing(projects, timesheets, consultants):
    rate_by_consultant = {c["id"]: c["hourly_rate"] for c in consultants}
    consultant_by_project: dict[str, list[str]] = {}
    for t in timesheets:
        consultant_by_project.setdefault(t["project_id"], []).append(t["consultant_id"])

    by_project_week: dict[tuple, float] = {}
    for t in timesheets:
        key = (t["project_id"], t["week_start"])
        by_project_week[key] = by_project_week.get(key, 0.0) + t["billable_hours"]

    rows = []
    for (project_id, wk), billable_hours in by_project_week.items():
        emp_ids = set(consultant_by_project.get(project_id, []))
        avg_rate = sum(rate_by_consultant.get(e, 170) for e in emp_ids) / max(len(emp_ids), 1)
        # Billing rarely matches logged hours exactly, and a handful of
        # projects run a persistent under-billing drift on purpose.
        drift = random.choice([0.86, 0.9, 0.93, 0.97, 1.0, 1.0, 1.02])
        invoiced_hours = round(billable_hours * drift, 1)
        billed_rate = avg_rate * random.uniform(0.95, 1.0)
        rows.append(
            {
                "project_id": project_id,
                "week_start": wk,
                "invoiced_hours": invoiced_hours,
                "invoiced_amount": round(invoiced_hours * billed_rate, 2),
                "logged_billable_hours": round(billable_hours, 1),
                "logged_amount": round(billable_hours * avg_rate, 2),
            }
        )
    return rows


def main():
    consultants = build_consultants()
    projects = build_projects()
    allocations = build_allocations(consultants, projects)
    timesheets = build_weekly_timesheets(consultants, allocations)
    billing = build_billing(projects, timesheets, consultants)

    for c in consultants:
        del c["profile"]

    payload = {
        "generated_at": TODAY.isoformat(),
        "target_utilization_pct": TARGET_UTILIZATION,
        "weeks": [w.isoformat() for w in WEEKS],
        "departments": DEPARTMENTS,
        "consultants": consultants,
        "projects": projects,
        "allocations": allocations,
        "timesheets": timesheets,
        "billing": billing,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=None, separators=(",", ":")), encoding="utf-8")
    print(
        f"consultants={len(consultants)} projects={len(projects)} "
        f"allocations={len(allocations)} timesheets={len(timesheets)} billing={len(billing)}"
    )
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
