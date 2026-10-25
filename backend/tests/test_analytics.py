"""Analytics correctness against real DB state + officer scoping."""
from tests.conftest import submit_grievance


def test_admin_summary_matches_db(client, admin):
    r = client.get("/api/v1/analytics/summary", headers=admin["headers"])
    assert r.status_code == 200
    s = r.json()
    for key in ("total", "pending", "in_progress", "resolved", "closed", "rejected",
                "critical_open", "overdue", "reopened", "needs_triage",
                "avg_resolution_hours", "median_resolution_hours", "sla_compliance_pct",
                "feedback_count", "by_status"):
        assert key in s
    # internal consistency: status buckets sum to total
    assert sum(s["by_status"].values()) == s["total"]

    # cross-check against the grievances listing total
    r2 = client.get("/api/v1/grievances", headers=admin["headers"], params={"page_size": 1})
    assert r2.json()["total"] == s["total"]


def test_category_distribution(client, admin):
    r = client.get("/api/v1/analytics/categories", headers=admin["headers"])
    assert r.status_code == 200
    rows = r.json()
    assert rows
    assert all("name" in x and "count" in x for x in rows)
    total = sum(x["count"] for x in rows)
    s = client.get("/api/v1/analytics/summary", headers=admin["headers"]).json()
    assert total == s["total"]


def test_department_workload(client, admin):
    r = client.get("/api/v1/analytics/departments", headers=admin["headers"])
    assert r.status_code == 200
    rows = r.json()
    assert all({"name", "total", "open", "overdue"} <= set(x) for x in rows)
    assert sum(x["total"] for x in rows) == client.get(
        "/api/v1/analytics/summary", headers=admin["headers"]).json()["total"]


def test_monthly_trend(client, admin):
    r = client.get("/api/v1/analytics/trends", headers=admin["headers"], params={"months": 6})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 6
    assert all("month" in x and "submitted" in x and "resolved" in x for x in rows)
    assert sum(x["submitted"] for x in rows) > 0  # demo data spans recent months


def test_officer_analytics_scoped_to_department(client, admin, roads_officer):
    sys_total = client.get("/api/v1/analytics/summary", headers=admin["headers"]).json()["total"]
    r = client.get("/api/v1/analytics/summary", headers=roads_officer["headers"])
    assert r.status_code == 200
    dept_total = r.json()["total"]
    assert dept_total <= sys_total
    # officer cannot widen scope by passing another department id
    r2 = client.get("/api/v1/analytics/summary", headers=roads_officer["headers"],
                    params={"department_id": 9999})
    assert r2.json()["total"] == dept_total  # forced back to own department


def test_citizen_my_stats(client, citizen):
    submit_grievance(client, citizen["headers"])
    r = client.get("/api/v1/analytics/my-stats", headers=citizen["headers"])
    assert r.status_code == 200
    s = r.json()
    assert s["total"] >= 1
    assert s["total"] == sum(s["by_status"].values())


def test_filters_applied(client, admin):
    r = client.get("/api/v1/analytics/summary", headers=admin["headers"],
                   params={"priority": "critical"})
    assert r.status_code == 200
    assert r.json()["total"] <= client.get(
        "/api/v1/analytics/summary", headers=admin["headers"]).json()["total"]


def test_csv_export(client, admin):
    r = client.get("/api/v1/grievances/export/csv", headers=admin["headers"])
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("tracking_id,title,status")
    assert len(lines) > 1
