from __future__ import annotations

from datetime import datetime
from typing import Any


def _period(risk_category: str) -> str:
    return "12 PM–4 PM" if risk_category in {"DANGEROUS", "EXTREME"} else "12 PM–3 PM"


def build_alert_previews(
    *, ward_name: str, ward_id: str, risk_category: str, htsi: float, health_risk: float, forecast_duration: int, vulnerability_reasons: list[str], forecast_label: str = "the selected forecast period",
) -> dict[str, Any]:
    category = risk_category.upper()
    citizen_title = f"{category} HEAT ALERT"
    citizen_message = (
        f"{citizen_title}\n\n{ward_name} is expected to experience {category.lower()} human thermal stress during {forecast_label}, with peak concern around {_period(category)}.\n\n"
        "People above 65, children and outdoor workers are at elevated risk. Avoid strenuous outdoor activity, stay hydrated, and seek shaded or cooled environments."
    )
    admin_message = (
        "HEAT ACTION PLAN TRIGGER\n\n"
        f"{ward_name}\nHTSI: {htsi:.0f}/100\nPrototype health risk: {health_risk:.0f}/100\nForecast duration: {forecast_duration} day(s)\n\n"
        "Recommended:\n- Activate cooling centres\n- Restrict strenuous outdoor work during peak hours\n- Increase hospital preparedness\n- Issue targeted public communication"
    )
    hospital_message = (
        f"Hospital preparedness notice: {ward_name} is at {category} heat-health risk.\n"
        f"Prototype HTSI {htsi:.0f}; prepare emergency capacity and monitor heat-related presentations."
    )
    return {
        "ward_id": ward_id,
        "ward_name": ward_name,
        "risk_category": category,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "simulated": True,
        "status": "SIMULATED — no external message sent",
        "provider": "local_simulation",
        "recipient": None,
        "previews": {
            "SMS Preview": {"audience": "Citizen", "message": citizen_message},
            "WhatsApp Preview": {"audience": "Outdoor Workers", "message": citizen_message},
            "Admin Alert Preview": {"audience": "Municipal Corporation / Disaster Management Authority", "message": admin_message},
            "Hospital Alert Preview": {"audience": "Hospital", "message": hospital_message},
        },
        "drivers": vulnerability_reasons,
    }
