from app.recommendations import recommendations_for
from app.thermal_engine import risk_category


def test_risk_categories_follow_configured_boundaries():
    assert risk_category(20) == "LOW"
    assert risk_category(20.1) == "CAUTION"
    assert risk_category(40.1) == "HIGH"
    assert risk_category(60.1) == "DANGEROUS"
    assert risk_category(80.1) == "EXTREME"


def test_heat_action_plan_rule_selection_is_separate_from_ui():
    plan = recommendations_for("EXTREME", "K-West", ["WBGT 36.0°C", "19% elderly residents"])
    assert plan["summary"] == "Trigger municipal Heat Action Plan review"
    assert any(task["task_key"] == "cooling-network" for task in plan["actions"])
    assert all({"owner", "trigger", "rationale", "resource_notes"} <= set(task) for task in plan["actions"])
    assert "Disaster management" in plan["audiences"]
    assert plan["drivers"]
