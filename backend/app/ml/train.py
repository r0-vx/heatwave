"""Train an optional tabular prototype model from a real CSV dataset.

Usage:
    python -m app.ml.train --csv path/to/validated_health_outcomes.csv --target hospitalization_count

The script never fabricates a score. It fails with a clear message when a
validated dataset is not supplied and prints held-out metrics when it is.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split


def train(csv_path: Path, target: str) -> dict[str, float | int | str]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Validated health outcome CSV not found: {csv_path}")
    frame = pd.read_csv(csv_path)
    if target not in frame.columns:
        raise ValueError(f"Target column '{target}' is missing. Available columns: {', '.join(frame.columns)}")
    if len(frame) < 20:
        raise ValueError("At least 20 rows are required for a meaningful held-out evaluation.")
    numeric = frame.select_dtypes(include="number").copy()
    numeric = numeric.dropna(axis=1, how="all")
    if target not in numeric.columns:
        raise ValueError("Target must be numeric for this regression pipeline.")
    features = numeric.drop(columns=[target]).fillna(numeric.drop(columns=[target]).median(numeric_only=True))
    labels = numeric[target]
    if features.shape[1] == 0:
        raise ValueError("No numeric predictor columns were found.")
    x_train, x_test, y_train, y_test = train_test_split(features, labels, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    return {
        "rows": int(len(frame)), "features": int(features.shape[1]), "target": target,
        "mae": float(mean_absolute_error(y_test, predictions)),
        "rmse": float(mean_squared_error(y_test, predictions) ** 0.5),
        "r2": float(r2_score(y_test, predictions)),
        "note": "Metrics are valid only for the supplied dataset and split; they are not used as clinical claims.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    print(json.dumps(train(args.csv, args.target), indent=2))


if __name__ == "__main__":
    main()
