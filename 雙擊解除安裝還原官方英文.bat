@echo off
chcp 65001 >nul
title Antigravity - 解除安裝還原官方英文

echo.
echo ======================================================
echo  正在解除安裝在地化與自訂樣式，恢復官方英文原版...
echo ======================================================
echo.

cd /d "%~dp0"
node bin/antigravity2-toolkit.js restore %*

if %errorlevel% neq 0 (
    echo.
    echo [×] 還原失敗，請檢查上方錯誤訊息。
    pause
    exit /b 1
)

echo.
echo [√] 還原完成！已恢復為官方原版狀態。
echo 視窗將在 5 秒後自動關閉...
timeout /t 5 >nul
