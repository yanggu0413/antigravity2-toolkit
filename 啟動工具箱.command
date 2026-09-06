#!/usr/bin/env bash
# ============================================================
# Antigravity 2 全能增強工具箱 - macOS Finder 雙擊專用啟動腳本
# ============================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

chmod +x "$DIR/啟動工具箱.sh" 2>/dev/null || true
exec "$DIR/啟動工具箱.sh" "$@"
