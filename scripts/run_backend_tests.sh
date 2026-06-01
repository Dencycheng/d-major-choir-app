#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
rm -f test_choir_app.db choir_app.db
PYTHON_BIN="${PYTHON_BIN:-python3}"
"$PYTHON_BIN" -S -m py_compile app/main.py app/models.py app/schemas.py app/deps.py app/core/*.py app/routers/*.py
"$PYTHON_BIN" -m pytest -q
