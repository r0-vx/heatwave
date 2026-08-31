from __future__ import annotations

from typing import Any


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def _band(score: float) -> str:
    if score < 25:
        return "Low"
    if score < 50:
        return "Moderate"
    if score < 75:
        return "High"
    return "Severe"


def calculate_health_risk(
    *,
    temperature: float,
    humidity: float,
    heat_index: float,
    wbgt: float,
    utci: float,
    htsi: float,
    vulnerability_index: float,
    population_density: float | None = None,
    elderly_pct: float | None = None,
    outdoor_worker_pct: float | None = None,
    historical_hospitalization_rate: float | None = None,
    historical_mortality_rate: float | None = None,
) -> dict[str, Any]:
    """Prototype risk model; not a medical or mortality prediction.

    HTSI is the dominant signal. PVI and modest historical-context terms make
    the result human-centric without implying that synthetic rates are causal.
    """

    wbgt_signal = _clamp((wbgt - 22.0) / 14.0 * 100.0)
    utci_signal = _clamp((utci - 20.0) / 28.0 * 100.0)
    history_signal = _clamp((historical_hospitalization_rate or 0.0) / 120.0 * 100.0)
    mortality_signal = _clamp((historical_mortality_rate or 0.0) / 20.0 * 100.0)
    health_risk = _clamp(0.58 * htsi + 0.27 * vulnerability_index + 0.08 * wbgt_signal + 0.07 * history_signal)
    mortality_score = _clamp(0.48 * htsi + 0.40 * vulnerability_index + 0.07 * mortality_signal + 0.05 * utci_signal)

    completeness_values = [population_density, elderly_pct, outdoor_worker_pct, historical_hospitalization_rate, historical_mortality_rate]
    completeness = sum(value is not None for value in completeness_values) / len(completeness_values)
    confidence = round(_clamp(28.0 + 27.0 * completeness), 1)

    drivers = []
    if htsi >= 61:
        drivers.append(f"HTSI {htsi:.0f}/100")
    if vulnerability_index >= 61:
        drivers.append(f"population vulnerability {vulnerability_index:.0f}/100")
    if wbgt >= 31:
        drivers.append(f"WBGT {wbgt:.1f}°C")
    if elderly_pct is not None and elderly_pct >= 15:
        drivers.append(f"{elderly_pct:.0f}% elderly population")
    if outdoor_worker_pct is not None and outdoor_worker_pct >= 25:
        drivers.append(f"{outdoor_worker_pct:.0f}% outdoor workers")
    if not drivers:
        drivers.append("thermal and vulnerability inputs remain below high-risk planning thresholds")

    return {
        "health_risk": round(health_risk, 1),
        "hospitalization_risk": _band(health_risk),
        "mortality_risk": _band(mortality_score),
        "mortality_score": round(mortality_score, 1),
        "confidence": confidence,
        "drivers": drivers,
        "model_label": "Prototype Risk Estimate",
        "validated_dataset": False,
        "dataset_note": "No validated health outcome dataset loaded.",
        "method": "Evidence-inspired weighted baseline using HTSI, PVI, thermal signals and synthetic historical context.",
    }
