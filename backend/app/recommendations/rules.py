from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


GUIDANCE_SOURCE = "NCDC/MoHFW and NDMA-aligned deterministic response rules (local prototype)"
GUIDANCE_URL = "https://ncdc.mohfw.gov.in/uploads/pdf/1.%20Heat%20wave%20advisory%20for%20State%20Health%20department_2026.pdf"


def _task(
    key: str,
    title: str,
    action: str,
    severity: str,
    owner: str,
    trigger: str,
    rationale: str,
    resource_notes: str,
) -> dict[str, str]:
    return {
        "task_key": key,
        "title": title,
        "action": action,
        "severity": severity,
        "owner": owner,
        "trigger": trigger,
        "rationale": rationale,
        "resource_notes": resource_notes,
        "status": "PENDING",
    }


ACTION_RULES: dict[str, dict[str, Any]] = {
    "LOW": {
        "summary": "Routine surveillance",
        "audiences": ["Ward control room", "Public health desk"],
        "actions": [
            _task("monitor-sources", "Verify daily source status", "Review weather/provider freshness and preserve the audit note.", "ROUTINE", "Ward control room", "Prototype HTSI remains LOW", "Early detection depends on knowing whether the primary feed is current.", "No deployment; operator review only."),
            _task("baseline-advice", "Maintain baseline public guidance", "Keep hydration and symptom-recognition material available.", "ROUTINE", "Public health desk", "Routine seasonal preparedness", "Heat-health impacts are preventable when guidance is available before escalation.", "Use approved NCDC/MoHFW material."),
        ],
    },
    "CAUTION": {
        "summary": "Preparedness advisory",
        "audiences": ["Ward officer", "Public health desk", "Cooling-facility coordinator"],
        "actions": [
            _task("readiness-check", "Complete ward readiness check", "Confirm drinking-water points, shade and candidate cooling spaces.", "ADVISORY", "Assistant Municipal Commissioner / ward officer", "Prototype HTSI enters CAUTION", "Pre-positioning reduces delay if the forecast intensifies.", "Record capacity and opening constraints; do not claim a facility is active until verified."),
            _task("vulnerable-outreach", "Prepare targeted outreach list", "Prepare communication for older people, children, outdoor workers and caregivers.", "ADVISORY", "Public health desk", "Caution plus elevated PVI drivers", "NCDC guidance prioritizes vulnerable populations and early warning dissemination.", "Use consented municipal contact lists only; this prototype stores none."),
        ],
    },
    "HIGH": {
        "summary": "Enhanced heat-health monitoring",
        "audiences": ["Ward officer", "Hospitals", "Outdoor-work supervisors", "Public health desk"],
        "actions": [
            _task("hospital-readiness", "Request hospital readiness acknowledgement", "Ask linked facilities to verify heat-illness triage, cooling supplies and surge contacts.", "HIGH", "Ward medical officer", "Prototype HTSI enters HIGH", "NCDC advises health-facility and ambulance preparedness before peak exposure.", "No facility status is inferred; acknowledgement must be entered by an operator."),
            _task("work-window", "Issue peak-work advisory for review", "Recommend rescheduling strenuous outdoor work away from the peak exposure window.", "HIGH", "Labour / engineering coordination desk", "High thermal stress during forecast peak", "Reducing exertion and direct sun exposure lowers occupational heat load.", "Operational restrictions require competent municipal authorization."),
            _task("public-brief", "Draft ward public brief", "Prepare a ward-specific message with risk period, symptoms and protective actions.", "HIGH", "Public information officer", "High risk persists in selected forecast layer", "Messages are more actionable when they identify time, place and protective behaviour.", "Simulation by default; external delivery remains separately controlled."),
        ],
    },
    "DANGEROUS": {
        "summary": "Activate ward heat preparedness",
        "audiences": ["Municipal control room", "Hospitals", "Disaster management", "Outdoor-work supervisors", "Citizens"],
        "actions": [
            _task("cooling-activation", "Prepare verified cooling-facility activation", "Confirm site, staffing, water, power and opening time before publishing availability.", "CRITICAL", "Ward officer / disaster management", "Prototype HTSI enters DANGEROUS", "Accessible cooling and drinking water reduce exposure for people without adequate indoor cooling.", "Never publish a centre as open without a named operator verification."),
            _task("ems-posture", "Escalate emergency medical posture", "Verify ambulance cooling supplies, referral pathways and emergency department contacts.", "CRITICAL", "Ward medical officer", "Dangerous thermal load with elevated health-risk estimate", "The 2026 NCDC advisory calls for ambulance and facility preparedness, including cooling supplies.", "Track acknowledgements; no patient data belongs in this prototype."),
            _task("outdoor-controls", "Prepare peak-hour exposure controls", "Route a work-rest and rescheduling instruction for competent approval.", "CRITICAL", "Municipal incident commander", "Dangerous forecast during peak hours", "Avoiding strenuous exposure is a primary preventive control.", "Approval and labour-policy ownership remain external to HeatShield."),
        ],
    },
    "EXTREME": {
        "summary": "Trigger municipal Heat Action Plan review",
        "audiences": ["Municipal incident command", "Hospitals", "Disaster management", "Ward teams", "Citizens"],
        "actions": [
            _task("incident-activation", "Open an incident-command decision log", "Convene authorized leads and record the activation decision, forecast basis and review time.", "EMERGENCY", "Municipal incident commander", "Prototype HTSI enters EXTREME", "Cross-agency coordination is required when severe heat threatens multiple services.", "HeatShield recommends review; it does not issue an official activation order."),
            _task("cooling-network", "Activate verified cooling and water network", "Open only verified sites and publish capacity, hours and access instructions.", "EMERGENCY", "Ward officer / disaster management", "Extreme thermal load", "Rapid access to cooling and safe drinking water is a core preventive intervention.", "Each site needs staffing, water safety, power and accessibility confirmation."),
            _task("medical-surge", "Initiate medical surge readiness", "Confirm emergency cooling, staffing escalation, ambulances and referral coordination.", "EMERGENCY", "Ward medical officer", "Extreme risk or multi-day dangerous forecast", "Severe heat-related illness requires rapid recognition and cooling.", "Use official clinical protocols; do not use prototype scores for diagnosis."),
            _task("targeted-alert", "Approve targeted public warning", "Review and release an approved ward-specific warning through authorized channels.", "EMERGENCY", "Public information officer", "Extreme risk plus verified source freshness", "Early warning should identify timing, vulnerable groups and protective actions.", "Test SMS is restricted to one allow-listed number; production broadcast is not implemented."),
        ],
    },
}


def recommendations_for(category: str, ward_name: str, drivers: list[str] | None = None) -> dict[str, Any]:
    normalized = category.upper()
    rule = ACTION_RULES.get(normalized, ACTION_RULES["CAUTION"])
    return {
        "ward": ward_name,
        "risk_category": normalized,
        "summary": rule["summary"],
        "actions": [dict(task) for task in rule["actions"]],
        "audiences": list(rule["audiences"]),
        "drivers": drivers or [],
        "source": GUIDANCE_SOURCE,
        "source_url": GUIDANCE_URL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
