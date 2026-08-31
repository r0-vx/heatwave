from app.thermal_engine import calculate_thermal_stress, heat_index_celsius


def test_noaa_heat_index_increases_with_humidity():
    dry = heat_index_celsius(40, 35)
    humid = heat_index_celsius(40, 75)
    assert humid > dry
    assert humid > 40


def test_thermal_engine_handles_missing_radiation_and_zero_wind():
    result = calculate_thermal_stress(41, 70, 0, None)
    assert result["estimated"] is True
    assert result["wbgt"] > 25
    assert result["utci"] > 30
    assert result["risk_category"] in {"HIGH", "DANGEROUS", "EXTREME"}


def test_thermal_engine_returns_explainable_factors():
    result = calculate_thermal_stress(43, 80, 1, 950)
    assert result["htsi"] >= 61
    assert result["contributing_indicators"]
    assert "WBGT" in " ".join(result["contributing_indicators"])
