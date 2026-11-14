#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== [1/3] Rust Engine (crates/aokira-engine) ==="
cd "$ROOT_DIR/crates/aokira-engine"
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test

echo "=== [2/3] Python Analytics API (apps/api) ==="
cd "$ROOT_DIR/apps/api"
if [ -d ".venv" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
pytest
ruff check .

echo "=== [3/3] Web Frontend (apps/web) ==="
cd "$ROOT_DIR/apps/web"
npm run typecheck
npm run test
npm run build
