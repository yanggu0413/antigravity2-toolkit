#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================"
echo " 正在卸载本地化，恢复官方原版 (Linux)..."
echo "======================================================"

node bin/ag-toolkit.js restore "$@"
