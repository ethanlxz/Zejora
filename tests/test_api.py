from datetime import UTC, datetime, timedelta


def make_task(client, subject_id, **overrides):
    payload = {
        "title": "Graph algorithms worksheet",
        "description": "Complete questions 1 through 5",
        "subject_id": subject_id,
        "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        "priority": "high",
    }
    payload.update(overrides)
    return client.post("/api/tasks", json=payload)


def test_health_and_pages(client):
    assert client.get("/api/health").json() == {
        "status": "healthy",
        "product": "Zejora",
    }
    assert client.get("/").status_code == 200
    assert "Zejora" in client.get("/dashboard").text


def test_subject_crud_and_case_insensitive_uniqueness(client):
    created = client.post(
        "/api/subjects", json={"name": "Mathematics", "color": "#C9C3E6"}
    )
    assert created.status_code == 201
    subject_id = created.json()["id"]

    duplicate = client.post(
        "/api/subjects", json={"name": "mathematics", "color": "#FFB7B2"}
    )
    assert duplicate.status_code == 409

    updated = client.patch(
        f"/api/subjects/{subject_id}", json={"name": "Discrete Mathematics"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Discrete Mathematics"

    assert client.delete(f"/api/subjects/{subject_id}").status_code == 204
    assert client.get(f"/api/subjects/{subject_id}").status_code == 404


def test_task_crud_and_completion_transition(client, subject):
    created = make_task(client, subject["id"])
    assert created.status_code == 201
    task = created.json()
    assert task["state"] == "pending"
    assert task["subject"]["name"] == "Data Structures"

    completed = client.patch(f"/api/tasks/{task['id']}", json={"completed": True})
    assert completed.status_code == 200
    assert completed.json()["state"] == "completed"
    assert completed.json()["completed_at"] is not None

    reopened = client.patch(f"/api/tasks/{task['id']}", json={"completed": False})
    assert reopened.json()["completed_at"] is None

    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_deadline_states_and_validation(client, subject):
    overdue = make_task(
        client,
        subject["id"],
        title="Late essay",
        due_at=(datetime.now(UTC) - timedelta(minutes=2)).isoformat(),
    )
    assert overdue.json()["state"] == "overdue"
    assert overdue.json()["is_overdue"] is True

    urgent = make_task(
        client,
        subject["id"],
        title="Quiz preparation",
        due_at=(datetime.now(UTC) + timedelta(hours=23)).isoformat(),
    )
    assert urgent.json()["state"] == "urgent"
    assert urgent.json()["is_urgent"] is True

    invalid_date = make_task(client, subject["id"], due_at="2026-06-12T12:00:00")
    assert invalid_date.status_code == 422
    assert make_task(client, 9999).status_code == 404
    assert make_task(client, subject["id"], priority="critical").status_code == 422


def test_due_collections_and_timezone_validation(client, subject):
    now = datetime.now(UTC)
    make_task(
        client,
        subject["id"],
        title="Due now",
        due_at=(now + timedelta(minutes=5)).isoformat(),
    )
    make_task(
        client,
        subject["id"],
        title="Due tomorrow",
        due_at=(now + timedelta(days=1, hours=1)).isoformat(),
    )
    make_task(
        client,
        subject["id"],
        title="Already late",
        due_at=(now - timedelta(days=1)).isoformat(),
    )

    assert client.get("/api/tasks/due/today?timezone=UTC").status_code == 200
    assert client.get("/api/tasks/due/upcoming?timezone=UTC").status_code == 200
    overdue = client.get("/api/tasks/due/overdue").json()
    assert [task["title"] for task in overdue] == ["Already late"]
    assert client.get("/api/tasks/due/today?timezone=Not/AZone").status_code == 400


def test_subject_delete_requires_explicit_cascade(client, subject):
    make_task(client, subject["id"])
    blocked = client.delete(f"/api/subjects/{subject['id']}")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["task_count"] == 1

    deleted = client.delete(f"/api/subjects/{subject['id']}?cascade=true")
    assert deleted.status_code == 204
    assert client.get("/api/tasks").json() == []


def test_dashboard_analytics(client, subject):
    now = datetime.now(UTC)
    first = make_task(client, subject["id"], title="Completed work").json()
    client.patch(f"/api/tasks/{first['id']}", json={"completed": True})
    make_task(
        client,
        subject["id"],
        title="Late work",
        due_at=(now - timedelta(hours=2)).isoformat(),
    )
    make_task(
        client,
        subject["id"],
        title="Urgent work",
        due_at=(now + timedelta(hours=2)).isoformat(),
    )

    response = client.get("/api/analytics/dashboard?timezone=UTC")
    assert response.status_code == 200
    analytics = response.json()
    assert analytics["summary"]["total"] == 3
    assert analytics["summary"]["completed"] == 1
    assert analytics["summary"]["overdue"] == 1
    assert analytics["summary"]["urgent"] == 1
    assert analytics["summary"]["completion_rate"] == 33.3
    assert analytics["subject_workload"][0]["task_count"] == 3
    assert len(analytics["weekly_completion"]) == 8
    assert sum(point["completed"] for point in analytics["weekly_completion"]) == 1

