#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================"
echo " 欢迎使用 Antigravity 简体中文本地化安装程序 (Linux)"
echo "======================================================"
echo ""
echo "请选择左上角品牌显示方式："
echo "[1] 保持英文 Antigravity（推荐）"
echo "[2] 隐藏品牌名称"
echo "[3] 启用品牌名称本地化"
read -p "请选择 [1/2/3] (直接按 Enter 默认为 1): " CHOICE_VAL
BRAND_ARG="--brand-title english"
if [ "$CHOICE_VAL" = "2" ]; then
    BRAND_ARG="--brand-title hidden"
elif [ "$CHOICE_VAL" = "3" ]; then
    BRAND_ARG="--brand-title translated"
fi

node bin/ag-toolkit.js $BRAND_ARG "$@"
