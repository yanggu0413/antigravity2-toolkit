#!/bin/bash
cd "$(dirname "$0")"

echo "======================================================"
echo " 歡迎使用 Antigravity 繁體中文在地化安裝程式 (macOS)"
echo "======================================================"
echo ""
echo "請選擇左上角品牌顯示方式："
echo "[1] 保持英文 Antigravity（推薦）"
echo "[2] 隱藏品牌名稱"
echo "[3] 啟用品牌名稱在地化"
read -p "請選擇 [1/2/3] (直接按 Enter 預設為 1): " CHOICE_VAL
BRAND_ARG="--brand-title english"
if [ "$CHOICE_VAL" = "2" ]; then
    BRAND_ARG="--brand-title hidden"
elif [ "$CHOICE_VAL" = "3" ]; then
    BRAND_ARG="--brand-title translated"
fi

node bin/ag-toolkit.js --tw $BRAND_ARG "$@"
