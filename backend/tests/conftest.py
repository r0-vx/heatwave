from __future__ import annotations

import os
from pathlib import Path


TEST_DATABASE = Path(__file__).resolve().parent / ".pytest_heatshield.db"
TEST_DATABASE.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DATABASE.as_posix()}"


def pytest_sessionfinish(session, exitstatus):  # noqa: ANN001, ARG001
    # Dispose the Windows file handle before removing the isolated test database.
    from app.database import engine

    engine.dispose()
    TEST_DATABASE.unlink(missing_ok=True)
