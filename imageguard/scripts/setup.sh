#!/usr/bin/env bash
# One-time setup: Python venv + backend deps, and frontend deps.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3.12}"
command -v "$PY" >/dev/null || PY=python3
"$PY" -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
[ -f backend/.env ] || cp backend/.env.example backend/.env
(cd frontend && npm install)
[ -f frontend/.env ] || cp frontend/.env.example frontend/.env
echo "Setup complete. Run scripts/dev-backend.sh and scripts/dev-frontend.sh in two terminals."
