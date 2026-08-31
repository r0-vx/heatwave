"""Research-tunable HTSI configuration.

HTSI deliberately keeps the three indices as the primary thermal signal, then
adds small contextual adjustments for humidity and solar exposure. This is a
transparent prototype method, not a clinically validated composite index.
"""

HTSI_CONFIG = {
    "metric_weights": {"heat_index": 0.20, "wbgt": 0.45, "utci": 0.35},
    "thermal_signal_weight": 0.88,
    "context_weights": {"humidity": 0.07, "solar": 0.05},
    "normalization": {
        "heat_index": {"low": 26.0, "extreme": 54.0},
        "wbgt": {"low": 22.0, "extreme": 36.0},
        "utci": {"low": 20.0, "extreme": 48.0},
        "humidity": {"low": 40.0, "extreme": 90.0},
        "solar": {"low": 100.0, "extreme": 1000.0},
    },
    "category_thresholds": {
        "LOW": 20.0,
        "CAUTION": 40.0,
        "HIGH": 60.0,
        "DANGEROUS": 80.0,
        "EXTREME": 100.0,
    },
}
