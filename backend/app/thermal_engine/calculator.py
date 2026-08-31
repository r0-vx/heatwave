from __future__ import annotations

import math
from typing import Any

from .config import HTSI_CONFIG


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def _lerp_score(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return _clamp((value - low) * 100.0 / (high - low))


def risk_category(score: float) -> str:
    thresholds = HTSI_CONFIG["category_thresholds"]
    if score <= thresholds["LOW"]:
        return "LOW"
    if score <= thresholds["CAUTION"]:
        return "CAUTION"
    if score <= thresholds["HIGH"]:
        return "HIGH"
    if score <= thresholds["DANGEROUS"]:
        return "DANGEROUS"
    return "EXTREME"


def heat_index_celsius(temperature_c: float, relative_humidity: float) -> float:
    """NOAA/NWS heat-index regression, evaluated in Fahrenheit then converted.

    The Rothfusz regression is intended for warm conditions. Below its
    operating range this function uses the NWS simplified apparent-temperature
    expression, so the result remains useful without presenting the regression
    as valid outside its intended domain.
    """

    temp_c = float(temperature_c)
    rh = _clamp(float(relative_humidity), 0.0, 100.0)
    temp_f = temp_c * 9.0 / 5.0 + 32.0

    if temp_f < 80.0 or rh < 40.0:
        simple_f = 0.5 * (temp_f + 61.0 + ((temp_f - 68.0) * 1.2) + (rh * 0.094))
        return round((simple_f - 32.0) * 5.0 / 9.0, 2)

    hi_f = (
        -42.379
        + 2.04901523 * temp_f
        + 10.14333127 * rh
        - 0.22475541 * temp_f * rh
        - 0.00683783 * temp_f * temp_f
        - 0.05481717 * rh * rh
        + 0.00122874 * temp_f * temp_f * rh
        + 0.00085282 * temp_f * rh * rh
        - 0.00000199 * temp_f * temp_f * rh * rh
    )

    if rh < 13.0 and 80.0 <= temp_f <= 112.0:
        hi_f -= ((13.0 - rh) / 4.0) * math.sqrt((17.0 - abs(temp_f - 95.0)) / 17.0)
    elif rh > 85.0 and 80.0 <= temp_f <= 87.0:
        hi_f += ((rh - 85.0) / 10.0) * ((87.0 - temp_f) / 5.0)

    return round((hi_f - 32.0) * 5.0 / 9.0, 2)


def _stull_wet_bulb_celsius(temperature_c: float, relative_humidity: float) -> float:
    """Stull (2011) wet-bulb approximation from air temperature and RH."""

    temp = float(temperature_c)
    rh = _clamp(float(relative_humidity), 1.0, 99.0)
    wet_bulb = (
        temp * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        + math.atan(temp + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * rh**1.5 * math.atan(0.023101 * rh)
        - 4.686035
    )
    return wet_bulb


def _estimated_mean_radiant_temperature(temperature_c: float, solar_radiation: float | None) -> float:
    # Mean radiant temperature requires globe/radiometer measurements. The
    # solar proxy is deliberately conservative and clearly marked estimated.
    solar = 550.0 if solar_radiation is None else max(0.0, float(solar_radiation))
    return temperature_c + _clamp(0.012 * solar, 0.0, 14.0)


def _estimated_wbgt(
    temperature_c: float, relative_humidity: float, wind_speed: float, solar_radiation: float | None
) -> float:
    """Outdoor WBGT estimate using the standard 0.7/0.2/0.1 weighting.

    Natural wet-bulb and globe temperatures are estimated because this
    prototype accepts weather-station fields rather than direct WBGT sensors.
    """

    tnwb = _stull_wet_bulb_celsius(temperature_c, relative_humidity)
    mrt = _estimated_mean_radiant_temperature(temperature_c, solar_radiation)
    globe = temperature_c + 0.25 * (mrt - temperature_c) / math.sqrt(max(wind_speed, 0.2))
    wbgt = 0.7 * tnwb + 0.2 * globe + 0.1 * temperature_c
    return round(wbgt, 2)


def _utci_from_pythermalcomfort(
    temperature_c: float, relative_humidity: float, wind_speed: float, mean_radiant_temperature: float
) -> float | None:
    """Use pythermalcomfort when available; retain a safe fallback below."""

    try:
        from pythermalcomfort.models import utci

        result = utci(
            tdb=temperature_c,
            tr=mean_radiant_temperature,
            v=max(0.1, wind_speed),
            rh=relative_humidity,
            limit_inputs=False,
        )
        value: Any = getattr(result, "utci", result)
        if isinstance(value, dict):
            value = value.get("utci")
        if value is not None:
            return float(value)
    except Exception:
        # An unavailable/incompatible optional library must not take down the
        # local dashboard; the documented approximation is used below.
        return None
    return None


def _utci_estimate(
    temperature_c: float, relative_humidity: float, wind_speed: float, solar_radiation: float | None
) -> tuple[float, str]:
    mrt = _estimated_mean_radiant_temperature(temperature_c, solar_radiation)
    library_value = _utci_from_pythermalcomfort(temperature_c, relative_humidity, wind_speed, mrt)
    if library_value is not None and math.isfinite(library_value):
        return round(library_value, 2), "pythermalcomfort UTCI polynomial with estimated mean radiant temperature"

    # Fallback is an explicit apparent-temperature approximation for machines
    # where the optional UTCI package cannot be installed. It is not labelled
    # as a direct UTCI observation.
    vapor_pressure = (relative_humidity / 100.0) * 6.105 * math.exp(17.27 * temperature_c / (237.7 + temperature_c))
    fallback = temperature_c + 0.33 * vapor_pressure - 0.70 * max(0.1, wind_speed) - 4.0 + 0.35 * (mrt - temperature_c)
    return round(fallback, 2), "documented fallback apparent-temperature approximation"


def calculate_thermal_stress(
    temperature: float,
    humidity: float,
    wind_speed: float,
    solar_radiation: float | None = None,
    rainfall: float | None = None,
) -> dict[str, Any]:
    """Return recognised indices plus transparent HTSI normalization."""

    temp = float(temperature)
    rh = _clamp(float(humidity), 0.0, 100.0)
    wind = max(0.0, float(wind_speed))
    hi = heat_index_celsius(temp, rh)
    wbgt = _estimated_wbgt(temp, rh, wind, solar_radiation)
    utci, utci_method = _utci_estimate(temp, rh, wind, solar_radiation)

    norm = HTSI_CONFIG["normalization"]
    hi_score = _lerp_score(hi, norm["heat_index"]["low"], norm["heat_index"]["extreme"])
    wbgt_score = _lerp_score(wbgt, norm["wbgt"]["low"], norm["wbgt"]["extreme"])
    utci_score = _lerp_score(utci, norm["utci"]["low"], norm["utci"]["extreme"])
    humidity_score = _lerp_score(rh, norm["humidity"]["low"], norm["humidity"]["extreme"])
    solar_score = _lerp_score(550.0 if solar_radiation is None else float(solar_radiation), norm["solar"]["low"], norm["solar"]["extreme"])

    weights = HTSI_CONFIG["metric_weights"]
    thermal_signal = weights["heat_index"] * hi_score + weights["wbgt"] * wbgt_score + weights["utci"] * utci_score
    htsi = _clamp(
        HTSI_CONFIG["thermal_signal_weight"] * thermal_signal
        + HTSI_CONFIG["context_weights"]["humidity"] * humidity_score
        + HTSI_CONFIG["context_weights"]["solar"] * solar_score
    )
    category = risk_category(htsi)

    factors: list[str] = []
    if wbgt_score >= 70:
        factors.append(f"WBGT {wbgt:.1f}°C is in the {risk_category(wbgt_score)} stress band")
    if utci_score >= 70:
        factors.append(f"UTCI {utci:.1f}°C indicates severe thermal strain")
    if hi_score >= 70:
        factors.append(f"Heat Index {hi:.1f}°C is elevated")
    if rh >= 65:
        factors.append(f"High humidity at {rh:.0f}% reduces evaporative cooling")
    if (solar_radiation or 550.0) >= 750:
        factors.append("High solar exposure increases radiant heat load")
    if not factors:
        factors.append("Thermal indicators remain within the lower stress bands")

    return {
        "temperature": round(temp, 2),
        "humidity": round(rh, 2),
        "wind_speed": round(wind, 2),
        "solar_radiation": None if solar_radiation is None else round(float(solar_radiation), 2),
        "rainfall": None if rainfall is None else round(float(rainfall), 2),
        "heat_index": hi,
        "wbgt": wbgt,
        "utci": utci,
        "htsi": round(htsi, 1),
        "risk_category": category,
        "contributing_indicators": factors,
        "explanation": "HTSI combines normalized Heat Index, estimated outdoor WBGT, and UTCI using configurable weights, then applies small humidity and radiation context adjustments.",
        "methods": {
            "heat_index": "NOAA/NWS Rothfusz regression (or simplified NWS expression below range)",
            "wbgt": "Estimated outdoor WBGT: 0.7 natural wet-bulb + 0.2 globe + 0.1 air temperature; wet-bulb/globe are proxies",
            "utci": utci_method,
        },
        "estimated": True,
        "data_quality": "Estimated from weather fields; direct globe/wet-bulb/radiant sensors were not supplied",
    }
