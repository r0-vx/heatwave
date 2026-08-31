"""Recognised thermal-index calculations and the configurable HTSI method."""

from .calculator import calculate_thermal_stress, heat_index_celsius, risk_category

__all__ = ["calculate_thermal_stress", "heat_index_celsius", "risk_category"]
