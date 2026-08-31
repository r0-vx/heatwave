from __future__ import annotations

from datetime import datetime
from typing import Any

from .audiences import AudienceDefinition, resolve_audience


def _period(risk_category: str) -> tuple[str, int]:
    if risk_category == "EXTREME":
        return "12 PM–5 PM", 5
    if risk_category == "DANGEROUS":
        return "12 PM–4 PM", 4
    if risk_category == "HIGH":
        return "12 PM–4 PM", 4
    return "12 PM–3 PM", 3


def _display_risk(category: str) -> str:
    return category.replace("_", " ").title()


def _vulnerability_level(value: float) -> str:
    return "High" if value >= 65 else "Moderate" if value >= 40 else "Lower"


def _action_lines(recommendations: list[str], defaults: list[str], limit: int = 4) -> list[str]:
    combined = [*defaults, *recommendations]
    return list(dict.fromkeys(item.strip() for item in combined if item.strip()))[:limit]


def _bullets(items: list[str]) -> str:
    return "\n".join(f"• {item}" for item in items)


def _citizen_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"{context['risk']} heat-health risk is expected {context['forecast_label']} between {context['period']}.\n\n"
        "Avoid strenuous outdoor activity, drink water regularly, and stay in shaded or cooled areas.\n\n"
        "Children, elderly residents and outdoor workers should take extra precautions."
    )


def _hospital_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"{context['risk']} heat-health risk is forecast {context['forecast_label']} between {context['period']}. "
        f"HTSI: {context['htsi']:.0f}.\n\n"
        "Expected concerns:\n"
        f"{_bullets(['heat exhaustion', 'dehydration', 'heat stroke', 'increased vulnerable-patient load'])}\n\n"
        "Recommended preparedness:\n"
        f"{_bullets(_action_lines(context['recommendations'], ['review emergency capacity', 'ensure cooling and hydration supplies', 'monitor elderly and high-risk patients', 'prepare heat-related triage protocols']))}"
    )


def _ambulance_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"{context['risk']} heat-health conditions are forecast {context['forecast_label']} from {context['period']}. "
        "A rise in heat-related emergency calls is possible.\n\n"
        "Recommended readiness:\n"
        f"{_bullets(_action_lines(context['recommendations'], ['maintain ambulance readiness near high-risk zones', 'prioritize heat-stroke and dehydration response capability', 'monitor high-density and outdoor-worker areas', 'coordinate with nearby healthcare facilities']))}"
    )


def _bmc_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    population = f"{context['population_at_risk']:,}" if context["population_at_risk"] is not None else "Unavailable"
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"Risk Level: {context['risk']}\n"
        f"HTSI: {context['htsi']:.0f}\n"
        f"WBGT: {context['wbgt']:.1f}°C\n"
        f"Forecast Window: {context['period']} {context['forecast_label']}\n"
        f"Population Vulnerability: {_vulnerability_level(context['vulnerability_index'])} (PVI {context['vulnerability_index']:.0f})\n"
        f"Population at Risk: {population}\n\n"
        "Recommended actions:\n"
        f"{_bullets(_action_lines(context['recommendations'], ['activate verified cooling facilities', 'issue a targeted public advisory', 'adjust strenuous outdoor municipal work', 'increase healthcare preparedness']))}"
    )


def _disaster_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    drivers = context["drivers"][:3] or [context["major_vulnerable_group"]]
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"{context['ward_name']} is forecast at {context['risk']} heat-health risk for approximately "
        f"{context['duration_hours']} hours {context['forecast_label']}.\n"
        f"Escalation trend: {context['escalation_trend']}.\n\n"
        "Priority groups and drivers:\n"
        f"{_bullets(drivers)}\n\n"
        "Recommended response:\n"
        f"{_bullets(_action_lines(context['recommendations'], ['initiate coordinated heat-response measures', 'monitor escalation across ward services', 'confirm medical and cooling-resource readiness'], 3))}"
    )


def _outdoor_worker_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"{context['risk']} occupational heat stress is expected {context['forecast_label']} between {context['period']}.\n\n"
        f"WBGT: {context['wbgt']:.1f}°C\n\n"
        "Recommended controls:\n"
        f"{_bullets(['shift heavy work outside peak heat hours', 'increase water and rest breaks', 'provide shaded recovery areas', 'monitor workers for heat-illness symptoms'])}"
    )


def _vulnerable_support_message(audience: AudienceDefinition, context: dict[str, Any]) -> str:
    return (
        f"{audience.title} — {context['ward_name']}\n\n"
        f"{context['risk']} heat conditions are expected {context['forecast_label']} between {context['period']}.\n\n"
        "Older adults and people with existing health vulnerabilities face increased risk.\n\n"
        "Recommended support:\n"
        f"{_bullets(['remain in a cool environment where possible', 'maintain regular hydration', 'avoid afternoon outdoor exposure', 'caregivers should check vulnerable residents regularly'])}"
    )


_RENDERERS = {
    "citizens": _citizen_message,
    "hospitals": _hospital_message,
    "ambulance": _ambulance_message,
    "bmc": _bmc_message,
    "disaster_management": _disaster_message,
    "outdoor_workers": _outdoor_worker_message,
    "vulnerable_support": _vulnerable_support_message,
}


def build_alert_previews(
    *,
    ward_name: str,
    ward_id: str,
    risk_category: str,
    htsi: float,
    health_risk: float,
    wbgt: float,
    vulnerability_index: float,
    audience: str,
    vulnerability_reasons: list[str],
    forecast_label: str = "during the selected forecast period",
    population_at_risk: int | None = None,
    escalation_trend: str = "Stable",
    major_vulnerable_group: str = "Elderly residents and outdoor workers",
    recommendations: list[str] | None = None,
) -> dict[str, Any]:
    category = risk_category.upper()
    audience_definition = resolve_audience(audience)
    period, duration_hours = _period(category)
    context = {
        "ward_name": ward_name,
        "risk": _display_risk(category),
        "htsi": htsi,
        "health_risk": health_risk,
        "wbgt": wbgt,
        "vulnerability_index": vulnerability_index,
        "population_at_risk": population_at_risk,
        "drivers": vulnerability_reasons,
        "forecast_label": forecast_label,
        "period": period,
        "duration_hours": duration_hours,
        "escalation_trend": escalation_trend,
        "major_vulnerable_group": major_vulnerable_group,
        "recommendations": recommendations or [],
    }
    message = _RENDERERS[audience_definition.id](audience_definition, context)
    selected_preview = {"audience": audience_definition.label, "message": message}
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
            "Selected Preview": selected_preview,
            "SMS Preview": selected_preview,
        },
        "drivers": vulnerability_reasons,
    }
