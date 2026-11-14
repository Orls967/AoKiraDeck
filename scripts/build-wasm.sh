#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/crates/aokira-engine"
wasm-pack build --target web --out-dir ../../apps/web/src/wasm
