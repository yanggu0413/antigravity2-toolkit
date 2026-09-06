#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$DIR/bin/antigravity2-toolkit.js" --brand-title english "$@"
