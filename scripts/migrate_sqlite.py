from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

db_path = Path(os.getenv("SQLITE_PATH", "/home/ubuntu/d_major_data/dmajor.sqlite"))
db_path.parent.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")

from app.core.database import Base, engine  # noqa: E402
from app import models  # noqa: F401,E402


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"SQLite schema ready: {db_path}")


if __name__ == "__main__":
    main()
