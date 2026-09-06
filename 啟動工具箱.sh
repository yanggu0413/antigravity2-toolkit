#!/usr/bin/env bash
# ============================================================
# Antigravity 2 全能增強工具箱 - Linux / macOS 一鍵啟動腳本
# ============================================================

set -e

# 定位腳本所在目錄
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 嘗試設置終端視窗標題
printf "\033]0;Antigravity 2 全能增強工具箱\007" 2>/dev/null || true

# 檢查 Node.js 執行環境
if ! command -v node >/dev/null 2>&1; then
    clear 2>/dev/null || true
    echo ""
    echo "  ┌────────────────────────────────────────────────────────────┐"
    echo "  │ [錯誤] 系統未安裝或找不到 Node.js 執行環境                   │"
    echo "  │                                                            │"
    echo "  │ Antigravity 工具箱需要 Node.js 環境才能運行。              │"
    echo "  │ 請前往官方網站下載並安裝 LTS 穩定版本：                    │"
    echo "  │ https://nodejs.org                                         │"
    echo "  │                                                            │"
    echo "  │ 或透過套件管理器安裝：                                     │"
    echo "  │   macOS:  brew install node                                │"
    echo "  │   Debian/Ubuntu: sudo apt install nodejs npm               │"
    echo "  │   Fedora/Arch:   sudo dnf install nodejs / pacman -S nodejs│"
    echo "  └────────────────────────────────────────────────────────────┘"
    echo ""
    read -rp "按 Enter 鍵結束..." _
    exit 1
fi

# 執行工具箱
set +e
if [ $# -gt 0 ]; then
    node "$DIR/bin/antigravity2-toolkit.js" "$@"
    EXIT_CODE=$?
else
    node "$DIR/bin/antigravity2-toolkit.js"
    EXIT_CODE=$?
fi

# 若異常退出，暫停供使用者查閱報錯訊息（防止終端閃退）
if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "  [提示] 程式已退出 (結束代碼: $EXIT_CODE)"
    read -rp "按 Enter 鍵關閉視窗..." _
fi

exit $EXIT_CODE
