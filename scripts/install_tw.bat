@echo off
setlocal
chcp 65001 >nul 2>&1
title Antigravity 2 - 安裝繁體中文在地化
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Node.js，請先安裝 Node.js！
    pause
    exit /b 1
)

echo.
echo ======================================================
echo  歡迎使用 Antigravity 繁體中文在地化快速安裝
echo ======================================================
echo.
echo 請選擇左上角品牌名顯示方式：
echo [1] 保持英文 Antigravity（推薦，美觀原生）
echo [2] 隱藏品牌名稱
echo [3] 啟用品牌名稱在地化
choice /C 123 /N /M "請選擇 [1/2/3]: "
if errorlevel 3 (
    set "BRAND_ARG=--brand-title translated"
) else if errorlevel 2 (
    set "BRAND_ARG=--brand-title hidden"
) else (
    set "BRAND_ARG=--brand-title english"
)

echo.
echo 正在安裝繁體中文在地化...
node "%~dp0..\bin\antigravity2-toolkit.js" --tw %BRAND_ARG% %*

if errorlevel 1 (
    echo.
    echo [×] 安裝失敗，請檢查上方訊息。
    pause
    exit /b 1
)

echo.
echo [√] 繁體中文在地化已成功部署！
echo 按任意鍵關閉視窗...
pause >nul
endlocal
