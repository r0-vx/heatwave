import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["ward_count"] == 24


def test_dashboard_and_ward_flow(client):
    summary = client.get("/api/dashboard/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["city"] == "Mumbai"
    assert len(body["wards"]) == 24
    assert all("geometry" not in ward for ward in body["wards"])
    ward_id = body["metrics"]["highest_risk_ward_id"]
    boundaries = client.get("/api/map/wards")
    assert boundaries.status_code == 200
    assert len(boundaries.json()["features"]) == 24
    assert {feature["geometry"]["type"] for feature in boundaries.json()["features"]} == {"MultiPolygon"}
    detail = client.get(f"/api/wards/{ward_id}")
    assert detail.status_code == 200
    assert detail.json()["geometry"]["type"] == "MultiPolygon"
    assert detail.json()["data_flags"]["geometry_demo"] is False
    assert detail.json()["data_flags"]["health_outcomes_validated"] is False
    assert len(client.get(f"/api/wards/{ward_id}/forecast").json()) == 6


def test_calculation_endpoint(client):
    response = client.post("/api/calculate/thermal-stress", json={"temperature": 41, "humidity": 70, "wind_speed": 1, "solar_radiation": 800})
    assert response.status_code == 200
    assert response.json()["htsi"] > 0


def test_alert_simulation_is_local(client):
    ward_id = client.get("/api/wards").json()[0]["id"]
    response = client.post("/api/alerts/simulate", json={"ward_id": ward_id, "audience": "Citizen", "channel": "SMS", "forecast_day": 1})
    assert response.status_code == 200
    assert response.json()["simulated"] is True
    assert "no external message sent" in response.json()["status"].lower()


def test_alert_previews_are_audience_specific_and_read_only(client):
    ward = client.get("/api/wards").json()[0]
    audiences = client.get("/api/alerts/audiences").json()
    assert len(audiences) == 7
    before = len(client.get("/api/alerts").json())
    messages = {}
    for audience in audiences:
        response = client.post("/api/alerts/preview", json={
            "ward_id": ward["id"],
            "audience": audience["id"],
            "channel": "SMS",
            "forecast_day": 1,
        })
        assert response.status_code == 200
        selected = response.json()["previews"]["Selected Preview"]
        assert selected["audience"] == audience["label"]
        assert ward["name"] in selected["message"]
        messages[audience["id"]] = selected["message"]
    assert len(set(messages.values())) == 7
    assert "WBGT:" in messages["outdoor_workers"]
    assert "ambulance readiness" in messages["ambulance"]
    assert "HTSI:" in messages["bmc"]
    assert "triage" in messages["hospitals"]
    assert len(client.get("/api/alerts").json()) == before


def test_provider_registry_and_test_sms_gate(client):
    sources = client.get("/api/sources")
    assert sources.status_code == 200
    rows = {row["id"]: row for row in sources.json()["sources"]}
    assert rows["bmc-boundaries"]["status"] == "CONNECTED"
    assert rows["imd-weather"]["status"] in {"MISSING_CREDENTIALS", "CONFIGURED"}
    provider = client.get("/api/alerts/provider").json()
    if not provider["configured"]:
        ward_id = client.get("/api/wards").json()[0]["id"]
        response = client.post("/api/alerts/send-test", json={
            "ward_id": ward_id,
            "audience": "Citizens",
            "channel": "SMS",
            "forecast_day": 1,
            "recipient": "919999999999",
            "confirm": True,
            "confirmation_text": "SEND TEST SMS",
        })
        assert response.status_code == 409


def test_action_plan_has_operational_fields(client):
    ward_id = client.get("/api/wards").json()[0]["id"]
    response = client.get(f"/api/action-plan/{ward_id}")
    assert response.status_code == 200
    task = response.json()["actions"][0]
    assert {"task_key", "title", "severity", "owner", "trigger", "rationale", "resource_notes", "status"} <= set(task)
